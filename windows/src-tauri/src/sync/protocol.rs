// Protocol data types for Coucou Windows-to-Mobile Hybrid Sync.
// Encrypted wire protocol over WebSocket.

use serde::{Deserialize, Serialize};

/// High-level envelope on the WebSocket wire.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WireMessage {
    /// Plaintext pairing/auth handshake request from mobile client
    Auth {
        client_id: String,
        client_name: String,
        secret: String,
    },
    /// Plaintext auth acknowledgment from Windows
    AuthOk {
        server_name: String,
        server_version: String,
    },
    /// Auth error
    AuthError {
        reason: String,
    },
    /// Ping heartbeat
    Ping {
        timestamp: u64,
    },
    /// Pong heartbeat response
    Pong {
        timestamp: u64,
    },
    /// Encrypted payload containing an AES-256-GCM encrypted SyncPayload
    Encrypted {
        /// Base64-encoded 12-byte IV / nonce
        iv: String,
        /// Base64-encoded ciphertext with 16-byte authentication tag appended
        payload: String,
    },
}

/// Inner payload transferred inside encrypted envelopes or directly during sync
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SyncPayload {
    /// Initial full snapshot sent after connection
    SyncState(SyncStateData),
    /// Live update for a single agent session
    SessionUpdate(SessionSyncItem),
    /// Agent requesting approval from user
    ApprovalRequest(ApprovalRequestData),
    /// User decision from mobile app (Allow/Deny)
    ApprovalDecision(ApprovalDecisionData),
    /// Approval cancelled or fulfilled on PC
    ApprovalCleared { request_id: String },
    /// Agent asking question
    QuestionRequest(QuestionRequestData),
    /// User answering question
    QuestionResponse(QuestionResponseData),
    /// Question cleared
    QuestionCleared { request_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStateData {
    pub device_name: String,
    pub device_id: String,
    pub sessions: Vec<SessionSyncItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_approval: Option<ApprovalRequestData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_question: Option<QuestionRequestData>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSyncItem {
    pub id: String,
    pub name: String,
    pub color: String,
    pub state: String,
    pub step_index: usize,
    pub steps: Vec<String>,
    pub needs_approval: bool,
    #[serde(default)]
    pub approval_command: String,
    #[serde(default)]
    pub approval_fingerprint: String,
    #[serde(default)]
    pub cwd: Option<String>,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalRequestData {
    pub request_id: String,
    pub session_id: String,
    pub tool: String,
    pub command: String,
    pub fingerprint: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalDecisionData {
    pub request_id: String,
    pub decision: String, // "allow" or "deny"
    pub fingerprint: String,
    pub biometric_verified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionOption {
    pub label: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionRequestData {
    pub request_id: String,
    pub session_id: String,
    pub question: String,
    #[serde(default)]
    pub header: String,
    pub options: Vec<QuestionOption>,
    pub multi_select: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionResponseData {
    pub request_id: String,
    #[serde(default)]
    pub answer: Option<String>,
    #[serde(default)]
    pub answers: Option<Vec<String>>,
}

/// Pairing information exposed in settings for QR code scanning
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairingData {
    pub version: u32,
    pub ip: String,
    pub port: u16,
    pub secret: String,
    pub device_id: String,
    pub device_name: String,
    pub pairing_url: String,
    pub qr_svg: String,
}

/// Current status of the sync bridge
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub enabled: bool,
    pub running: bool,
    pub ip: String,
    pub port: u16,
    pub secret: String,
    pub connected_devices: Vec<ConnectedDevice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedDevice {
    pub id: String,
    pub name: String,
    pub remote_addr: String,
    pub connected_at: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wire_auth_message_serde() {
        let auth = WireMessage::Auth {
            client_id: "android-phone".into(),
            client_name: "Pixel 9".into(),
            secret: "secret-123".into(),
        };

        let json_str = serde_json::to_string(&auth).expect("serialize");
        assert!(json_str.contains("\"type\":\"auth\""));

        let deserialized: WireMessage = serde_json::from_str(&json_str).expect("deserialize");
        match deserialized {
            WireMessage::Auth { client_id, client_name, secret } => {
                assert_eq!(client_id, "android-phone");
                assert_eq!(client_name, "Pixel 9");
                assert_eq!(secret, "secret-123");
            }
            _ => panic!("unexpected wire message variant"),
        }
    }

    #[test]
    fn test_sync_payload_approval_roundtrip() {
        let req = ApprovalRequestData {
            request_id: "req-42".into(),
            session_id: "integration_claude".into(),
            tool: "Bash".into(),
            command: "Bash · cargo test".into(),
            fingerprint: "req-42".into(),
            created_at: 1700000000000,
        };

        let payload = SyncPayload::ApprovalRequest(req);
        let bytes = serde_json::to_vec(&payload).expect("serialize payload");
        let restored: SyncPayload = serde_json::from_slice(&bytes).expect("deserialize payload");

        match restored {
            SyncPayload::ApprovalRequest(r) => {
                assert_eq!(r.request_id, "req-42");
                assert_eq!(r.command, "Bash · cargo test");
            }
            _ => panic!("unexpected payload"),
        }
    }

    #[test]
    fn test_sync_payload_approval_decision_roundtrip() {
        let decision = ApprovalDecisionData {
            request_id: "req-42".into(),
            decision: "allow".into(),
            fingerprint: "req-42".into(),
            biometric_verified: true,
        };

        let payload = SyncPayload::ApprovalDecision(decision);
        let s = serde_json::to_string(&payload).expect("serialize");
        let restored: SyncPayload = serde_json::from_str(&s).expect("deserialize");

        match restored {
            SyncPayload::ApprovalDecision(d) => {
                assert_eq!(d.request_id, "req-42");
                assert_eq!(d.decision, "allow");
                assert!(d.biometric_verified);
            }
            _ => panic!("unexpected payload"),
        }
    }

    #[test]
    fn test_sync_state_snapshot_serde() {
        let snap = SyncStateData {
            device_name: "Desktop-PC".into(),
            device_id: "win-1234".into(),
            sessions: vec![SessionSyncItem {
                id: "integration_claude".into(),
                name: "Claude Code".into(),
                color: "#F5F6F8".into(),
                state: "working".into(),
                step_index: 0,
                steps: vec!["Running cargo test".into()],
                needs_approval: false,
                approval_command: "".into(),
                approval_fingerprint: "".into(),
                cwd: Some("C:\\projects\\coucou".into()),
                updated_at: 1700000000000,
            }],
            pending_approval: None,
            pending_question: None,
        };

        let payload = SyncPayload::SyncState(snap);
        let bytes = serde_json::to_vec(&payload).expect("serialize");
        let restored: SyncPayload = serde_json::from_slice(&bytes).expect("deserialize");

        match restored {
            SyncPayload::SyncState(s) => {
                assert_eq!(s.device_name, "Desktop-PC");
                assert_eq!(s.sessions.len(), 1);
                assert_eq!(s.sessions[0].name, "Claude Code");
            }
            _ => panic!("unexpected payload"),
        }
    }
}
