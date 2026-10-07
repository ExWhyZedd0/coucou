// WebSocket server for Coucou Mobile Companion Sync.
// Communicates with Android / iOS companion devices over LAN.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

use crate::log;
use crate::pipe;
use crate::sync::crypto;
use crate::sync::protocol::*;

static CLIENT_COUNTER: AtomicUsize = AtomicUsize::new(1);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn get_local_ip() -> String {
    if let Ok(socket) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                if ip != "0.0.0.0" {
                    return ip;
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

pub struct SyncServerState {
    pub app: AppHandle,
    pub port: u16,
    pub ip: String,
    pub secret: Arc<RwLock<String>>,
    pub is_running: Arc<AtomicBool>,
    pub clients: Arc<Mutex<HashMap<usize, mpsc::UnboundedSender<String>>>>,
    pub devices: Arc<Mutex<HashMap<usize, ConnectedDevice>>>,
    pub sessions: Arc<Mutex<HashMap<String, SessionSyncItem>>>,
    pub pending_approval: Arc<Mutex<Option<ApprovalRequestData>>>,
    pub pending_question: Arc<Mutex<Option<QuestionRequestData>>>,
}

impl SyncServerState {
    pub fn new(app: AppHandle, port: u16, secret: String) -> Self {
        let ip = get_local_ip();
        Self {
            app,
            port,
            ip,
            secret: Arc::new(RwLock::new(secret)),
            is_running: Arc::new(AtomicBool::new(false)),
            clients: Arc::new(Mutex::new(HashMap::new())),
            devices: Arc::new(Mutex::new(HashMap::new())),
            sessions: Arc::new(Mutex::new(HashMap::new())),
            pending_approval: Arc::new(Mutex::new(None)),
            pending_question: Arc::new(Mutex::new(None)),
        }
    }

    pub fn device_name(&self) -> String {
        std::env::var("COMPUTERNAME")
            .or_else(|_| std::env::var("HOSTNAME"))
            .unwrap_or_else(|_| "Coucou Windows".into())
    }

    pub fn device_id(&self) -> String {
        format!("win-{}", &crypto::generate_secret()[..12])
    }

    pub fn get_connected_devices(&self) -> Vec<ConnectedDevice> {
        self.devices.lock().unwrap().values().cloned().collect()
    }

    pub fn broadcast_payload(&self, payload: &SyncPayload) {
        let secret_str = self.secret.read().unwrap().clone();
        let key = crypto::parse_key(&secret_str);

        let json_bytes = match serde_json::to_vec(payload) {
            Ok(b) => b,
            Err(e) => {
                log::line(format!("sync: serialize payload error: {e}"));
                return;
            }
        };

        let envelope = match crypto::encrypt(&key, &json_bytes) {
            Ok((iv, p)) => WireMessage::Encrypted { iv, payload: p },
            Err(e) => {
                log::line(format!("sync: encrypt payload error: {e}"));
                return;
            }
        };

        let wire_json = match serde_json::to_string(&envelope) {
            Ok(s) => s,
            Err(e) => {
                log::line(format!("sync: serialize wire error: {e}"));
                return;
            }
        };

        let clients = self.clients.lock().unwrap();
        for tx in clients.values() {
            let _ = tx.send(wire_json.clone());
        }
    }

    pub fn update_session(&self, item: SessionSyncItem) {
        {
            let mut map = self.sessions.lock().unwrap();
            map.insert(item.id.clone(), item.clone());
        }
        self.broadcast_payload(&SyncPayload::SessionUpdate(item));
    }

    pub fn set_approval_request(&self, req: ApprovalRequestData) {
        {
            let mut pending = self.pending_approval.lock().unwrap();
            *pending = Some(req.clone());
        }
        // Also update matching session in sessions map
        {
            let mut map = self.sessions.lock().unwrap();
            let session_id = if req.session_id.is_empty() {
                "integration_claude".to_string()
            } else {
                req.session_id.clone()
            };
            if let Some(item) = map.get_mut(&session_id) {
                item.state = "approval".into();
                item.needs_approval = true;
                item.approval_command = req.command.clone();
                item.approval_fingerprint = req.fingerprint.clone();
                item.updated_at = now_ms();
            }
        }
        self.broadcast_payload(&SyncPayload::ApprovalRequest(req));
    }

    pub fn clear_approval_request(&self, request_id: &str) {
        {
            let mut pending = self.pending_approval.lock().unwrap();
            if let Some(ref cur) = *pending {
                if cur.request_id == request_id {
                    *pending = None;
                }
            }
        }
        // Reset matching session in sessions map
        {
            let mut map = self.sessions.lock().unwrap();
            for item in map.values_mut() {
                if item.approval_fingerprint == request_id || item.needs_approval {
                    item.needs_approval = false;
                    item.approval_command.clear();
                    item.approval_fingerprint.clear();
                    if item.state == "approval" {
                        item.state = "working".into();
                    }
                    item.updated_at = now_ms();
                }
            }
        }
        self.broadcast_payload(&SyncPayload::ApprovalCleared {
            request_id: request_id.to_string(),
        });
    }

    #[allow(dead_code)]
    pub fn set_question_request(&self, req: QuestionRequestData) {
        {
            let mut pending = self.pending_question.lock().unwrap();
            *pending = Some(req.clone());
        }
        self.broadcast_payload(&SyncPayload::QuestionRequest(req));
    }

    pub fn clear_question_request(&self, request_id: &str) {
        {
            let mut pending = self.pending_question.lock().unwrap();
            if let Some(ref cur) = *pending {
                if cur.request_id == request_id {
                    *pending = None;
                }
            }
        }
        self.broadcast_payload(&SyncPayload::QuestionCleared {
            request_id: request_id.to_string(),
        });
    }

    pub fn create_state_snapshot(&self) -> SyncStateData {
        let sessions: Vec<SessionSyncItem> = self.sessions.lock().unwrap().values().cloned().collect();
        let pending_approval = self.pending_approval.lock().unwrap().clone();
        let pending_question = self.pending_question.lock().unwrap().clone();

        SyncStateData {
            device_name: self.device_name(),
            device_id: self.device_id(),
            sessions,
            pending_approval,
            pending_question,
        }
    }
}

pub async fn run_server(
    state: Arc<SyncServerState>,
    mut shutdown_rx: tokio::sync::broadcast::Receiver<()>,
) {
    let addr: SocketAddr = ([0, 0, 0, 0], state.port).into();
    let listener = match TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            log::line(format!("sync server: cannot bind {addr}: {e}"));
            state.is_running.store(false, Ordering::Relaxed);
            return;
        }
    };

    state.is_running.store(true, Ordering::Relaxed);
    log::line(format!(
        "sync server listening on ws://{}:{}",
        state.ip, state.port
    ));

    loop {
        tokio::select! {
            _ = shutdown_rx.recv() => {
                log::line("sync server shutting down");
                break;
            }
            res = listener.accept() => {
                match res {
                    Ok((stream, peer_addr)) => {
                        let client_id = CLIENT_COUNTER.fetch_add(1, Ordering::Relaxed);
                        let s = state.clone();
                        tokio::spawn(async move {
                            handle_client(client_id, stream, peer_addr, s).await;
                        });
                    }
                    Err(e) => {
                        log::line(format!("sync server accept error: {e}"));
                    }
                }
            }
        }
    }

    state.is_running.store(false, Ordering::Relaxed);
    state.clients.lock().unwrap().clear();
    state.devices.lock().unwrap().clear();
}

async fn handle_client(
    client_id: usize,
    stream: TcpStream,
    peer_addr: SocketAddr,
    state: Arc<SyncServerState>,
) {
    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            log::line(format!("sync ws handshake failed from {peer_addr}: {e}"));
            return;
        }
    };

    log::line(format!("sync client #{} connected from {peer_addr}", client_id));

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    // Task forwarding outbound messages from channel to websocket
    let forward_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    // 10-second authentication handshake timeout
    let auth_msg = match tokio::time::timeout(tokio::time::Duration::from_secs(10), ws_receiver.next()).await {
        Ok(Some(Ok(m))) => m,
        _ => {
            log::line(format!("sync client #{client_id} timed out waiting for auth"));
            forward_task.abort();
            return;
        }
    };

    let auth_text = match auth_msg {
        Message::Text(t) => t,
        _ => {
            forward_task.abort();
            return;
        }
    };

    let parsed_auth: Result<WireMessage, _> = serde_json::from_str(&auth_text);
    match parsed_auth {
        Ok(WireMessage::Auth {
            client_id: c_id,
            client_name,
            secret,
        }) => {
            let current_secret = state.secret.read().unwrap().clone();
            if secret.trim() != current_secret.trim() {
                log::line(format!(
                    "sync client #{} auth failed: invalid secret",
                    client_id
                ));
                let err = WireMessage::AuthError {
                    reason: "invalid pairing secret".into(),
                };
                let _ = tx.send(serde_json::to_string(&err).unwrap());
                tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
                forward_task.abort();
                return;
            }

            log::line(format!(
                "sync client #{} authenticated ({client_name})",
                client_id
            ));

            // Store device info and register for broadcasts only after successful authentication
            {
                let dev = ConnectedDevice {
                    id: c_id,
                    name: client_name.clone(),
                    remote_addr: peer_addr.to_string(),
                    connected_at: now_ms(),
                };
                state.devices.lock().unwrap().insert(client_id, dev);
                state.clients.lock().unwrap().insert(client_id, tx.clone());
            }

            // Emit Tauri event so Windows settings UI updates live
            let _ = state.app.emit(
                "sync-devices-changed",
                json!({ "count": state.devices.lock().unwrap().len() }),
            );

            // Send AuthOk
            let ok = WireMessage::AuthOk {
                server_name: state.device_name(),
                server_version: env!("CARGO_PKG_VERSION").to_string(),
            };
            let _ = tx.send(serde_json::to_string(&ok).unwrap());

            // Send current state snapshot encrypted
            let snapshot = state.create_state_snapshot();
            let key = crypto::parse_key(&current_secret);
            if let Ok(bytes) = serde_json::to_vec(&SyncPayload::SyncState(snapshot)) {
                if let Ok((iv, p)) = crypto::encrypt(&key, &bytes) {
                    let env = WireMessage::Encrypted { iv, payload: p };
                    let _ = tx.send(serde_json::to_string(&env).unwrap());
                }
            }
        }
        _ => {
            log::line(format!("sync client #{client_id} sent non-auth first message"));
            forward_task.abort();
            return;
        }
    }

    // Main authenticated loop
    while let Some(msg_res) = ws_receiver.next().await {
        let msg = match msg_res {
            Ok(m) => m,
            Err(_) => break,
        };

        if msg.is_close() {
            break;
        }

        if let Message::Ping(_) = msg {
            let _ = tx.send(serde_json::to_string(&WireMessage::Pong { timestamp: now_ms() }).unwrap());
            continue;
        }

        if let Message::Text(text) = msg {
            let parsed: Result<WireMessage, _> = serde_json::from_str(&text);
            match parsed {
                Ok(WireMessage::Ping { timestamp }) => {
                    let pong = WireMessage::Pong { timestamp };
                    let _ = tx.send(serde_json::to_string(&pong).unwrap());
                }

                Ok(WireMessage::Encrypted { iv, payload }) => {
                    let current_secret = state.secret.read().unwrap().clone();
                    let key = crypto::parse_key(&current_secret);

                    match crypto::decrypt(&key, &iv, &payload) {
                        Ok(decrypted) => {
                            match serde_json::from_slice::<SyncPayload>(&decrypted) {
                                Ok(SyncPayload::ApprovalDecision(dec)) => {
                                    log::line(format!(
                                        "sync decision from mobile: req={} decision={} bio={}",
                                        dec.request_id, dec.decision, dec.biometric_verified
                                    ));
                                    // Forward to pipe
                                    pipe::answer(&state.app, &dec.request_id, &dec.decision);
                                    state.clear_approval_request(&dec.request_id);
                                }
                                Ok(SyncPayload::QuestionResponse(resp)) => {
                                    log::line(format!(
                                        "sync question response from mobile: req={}",
                                        resp.request_id
                                    ));
                                    let _ = state.app.emit("sync-question-response", &resp);
                                    state.clear_question_request(&resp.request_id);
                                }
                                Ok(other) => {
                                    log::line(format!("sync unhandled client payload: {:?}", other));
                                }
                                Err(e) => {
                                    log::line(format!("sync cannot parse decrypted payload: {e}"));
                                }
                            }
                        }
                        Err(e) => {
                            log::line(format!("sync decrypt error from #{}: {e}", client_id));
                        }
                    }
                }

                _ => {}
            }
        }
    }

    forward_task.abort();
    {
        state.clients.lock().unwrap().remove(&client_id);
        state.devices.lock().unwrap().remove(&client_id);
    }
    let _ = state.app.emit(
        "sync-devices-changed",
        json!({ "count": state.devices.lock().unwrap().len() }),
    );
    log::line(format!("sync client #{} disconnected", client_id));
}
