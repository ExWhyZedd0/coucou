// Coucou Windows-to-Mobile Hybrid Sync Bridge
// Exposes mDNS advertisement, local WebSocket streaming, QR pairing, and E2E encryption.

pub mod crypto;
pub mod mdns;
pub mod protocol;
pub mod server;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;
use tauri::{AppHandle, State};
use tokio::sync::broadcast;

use crate::log;
use mdns::MdnsAdvertiser;
use protocol::*;
use server::{get_local_ip, run_server, SyncServerState};

pub const DEFAULT_SYNC_PORT: u16 = 7654;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub struct SyncBridge {
    #[allow(dead_code)]
    pub app: AppHandle,
    pub server_state: Arc<SyncServerState>,
    shutdown_tx: Mutex<Option<broadcast::Sender<()>>>,
    mdns: Mutex<MdnsAdvertiser>,
}

impl SyncBridge {
    pub fn new(app: AppHandle) -> Self {
        let secret = crypto::generate_secret();
        let server_state = Arc::new(SyncServerState::new(app.clone(), DEFAULT_SYNC_PORT, secret));
        Self {
            app,
            server_state,
            shutdown_tx: Mutex::new(None),
            mdns: Mutex::new(MdnsAdvertiser::new()),
        }
    }

    pub fn start(&self) {
        let mut shutdown_guard = self.shutdown_tx.lock().unwrap();
        if shutdown_guard.is_some() {
            return;
        }

        let (tx, rx) = broadcast::channel(1);
        *shutdown_guard = Some(tx);

        let state = self.server_state.clone();
        tauri::async_runtime::spawn(async move {
            run_server(state, rx).await;
        });

        // Register mDNS advertisement
        let mut mdns = self.mdns.lock().unwrap();
        let mut props = HashMap::new();
        props.insert("version".into(), env!("CARGO_PKG_VERSION").into());
        props.insert("name".into(), self.server_state.device_name());
        props.insert("id".into(), self.server_state.device_id());

        let host = self.server_state.device_name();
        let _ = mdns.register(&host, &self.server_state.ip, self.server_state.port, props);
        log::line(format!(
            "sync bridge started on ws://{}:{}",
            self.server_state.ip, self.server_state.port
        ));
    }

    pub fn stop(&self) {
        {
            let mut shutdown_guard = self.shutdown_tx.lock().unwrap();
            if let Some(tx) = shutdown_guard.take() {
                let _ = tx.send(());
            }
        }
        let mut mdns = self.mdns.lock().unwrap();
        mdns.unregister();
        log::line("sync bridge stopped");
    }

    pub fn get_status(&self) -> SyncStatus {
        let running = self.server_state.is_running.load(std::sync::atomic::Ordering::Relaxed);
        let secret = self.server_state.secret.read().unwrap().clone();
        SyncStatus {
            enabled: running,
            running,
            ip: get_local_ip(),
            port: self.server_state.port,
            secret,
            connected_devices: self.server_state.get_connected_devices(),
        }
    }

    pub fn get_pairing_data(&self) -> Result<PairingData, String> {
        let ip = get_local_ip();
        let port = self.server_state.port;
        let secret = self.server_state.secret.read().unwrap().clone();
        let device_id = self.server_state.device_id();
        let device_name = self.server_state.device_name();

        let pairing_url = format!(
            "coucou://pair?v=1&ip={}&port={}&secret={}&id={}&name={}",
            ip, port, secret, device_id, urlencoding_simple(&device_name)
        );

        let code = qrcode::QrCode::new(pairing_url.as_bytes())
            .map_err(|e| format!("qr encode: {e}"))?;

        let qr_svg = code
            .render::<qrcode::render::svg::Color>()
            .min_dimensions(180, 180)
            .dark_color(qrcode::render::svg::Color("#F5F6F8"))
            .light_color(qrcode::render::svg::Color("#16181D"))
            .build();

        Ok(PairingData {
            version: 1,
            ip,
            port,
            secret,
            device_id,
            device_name,
            pairing_url,
            qr_svg,
        })
    }

    pub fn regenerate_secret(&self) -> Result<PairingData, String> {
        let new_secret = crypto::generate_secret();
        {
            let mut sec = self.server_state.secret.write().unwrap();
            *sec = new_secret;
        }
        self.get_pairing_data()
    }

    pub fn handle_hook_event(&self, event_name: &str, payload: &Value) {
        let agent_tag = payload
            .get("coucou_agent")
            .and_then(Value::as_str)
            .unwrap_or("claude");

        let agent_id = if agent_tag == "claude" {
            "integration_claude".to_string()
        } else {
            format!("agent_{}", agent_tag)
        };

        let cwd = payload.get("cwd").and_then(Value::as_str).map(|s| s.to_string());

        let (agent_name, agent_color) = match agent_tag {
            "claude" => ("Claude Code", "#F5F6F8"),
            "gemini" => ("Gemini CLI", "#8AB4F8"),
            "antigravity" => ("Antigravity", "#9333EA"),
            "codex" => ("Codex", "#2DD4BF"),
            other => (other, "#22c55e"),
        };

        let mut item = {
            let map = self.server_state.sessions.lock().unwrap();
            map.get(&agent_id).cloned().unwrap_or_else(|| SessionSyncItem {
                id: agent_id.clone(),
                name: agent_name.to_string(),
                color: agent_color.to_string(),
                state: "idle".into(),
                step_index: 0,
                steps: Vec::new(),
                needs_approval: false,
                approval_command: String::new(),
                approval_fingerprint: String::new(),
                cwd: cwd.clone(),
                updated_at: now_ms(),
            })
        };

        match event_name {
            "SessionStart" => {
                item.state = "idle".into();
                item.steps.clear();
                item.step_index = 0;
            }
            "UserPromptSubmit" => {
                item.state = "thinking".into();
                if let Some(prompt) = payload.get("prompt").and_then(Value::as_str) {
                    item.steps.push(prompt.chars().take(80).collect());
                    item.step_index = item.steps.len() - 1;
                }
            }
            "PreToolUse" => {
                item.state = "working".into();
                let tool = payload.get("tool_name").and_then(Value::as_str).unwrap_or("Tool");
                item.steps.push(format!("Run {}", tool));
                item.step_index = item.steps.len() - 1;
            }
            "PostToolUse" => {
                item.state = "working".into();
            }
            "Stop" => {
                item.state = "finished".into();
                if let Some(msg) = payload.get("last_assistant_message").and_then(Value::as_str) {
                    item.steps.push(msg.chars().take(80).collect());
                    item.step_index = item.steps.len() - 1;
                }
            }
            "StopFailure" => {
                item.state = "error".into();
            }
            "SessionEnd" => {
                item.state = "idle".into();
            }
            _ => {}
        }

        item.updated_at = now_ms();
        self.server_state.update_session(item);
    }
}

fn urlencoding_simple(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            out.push(b as char);
        } else {
            use std::fmt::Write;
            let _ = write!(out, "%{:02X}", b);
        }
    }
    out
}

// ── Tauri Commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn sync_get_status(bridge: State<Arc<SyncBridge>>) -> SyncStatus {
    bridge.get_status()
}

#[tauri::command]
pub fn sync_get_pairing_data(bridge: State<Arc<SyncBridge>>) -> Result<PairingData, String> {
    bridge.get_pairing_data()
}

#[tauri::command]
pub fn sync_regenerate_secret(bridge: State<Arc<SyncBridge>>) -> Result<PairingData, String> {
    bridge.regenerate_secret()
}

#[tauri::command]
pub fn sync_toggle(bridge: State<Arc<SyncBridge>>, enabled: bool) -> SyncStatus {
    if enabled {
        bridge.start();
    } else {
        bridge.stop();
    }
    bridge.get_status()
}

#[tauri::command]
pub fn sync_send_test_event(bridge: State<Arc<SyncBridge>>) -> Result<(), String> {
    let test_item = SessionSyncItem {
        id: "agent_gemini".into(),
        name: "Gemini CLI".into(),
        color: "#8AB4F8".into(),
        state: "working".into(),
        step_index: 0,
        steps: vec!["Refactoring sync bridge module...".into()],
        needs_approval: false,
        approval_command: "".into(),
        approval_fingerprint: "".into(),
        cwd: Some("C:\\coucou".into()),
        updated_at: now_ms(),
    };
    bridge.server_state.update_session(test_item);
    Ok(())
}
