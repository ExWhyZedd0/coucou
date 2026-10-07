use serde_json::{json, Value};
use crate::claude::{ChatContext, ChatReply};
use crate::secrets;

const SYSTEM_PROMPT: &str = "You are Mochi, a personal AI assistant living at the top of the user's screen. \
You can help with research, coding, writing, and questions. \
Respond in the user's language. Be concise yet helpful. No markdown tables or deep formatting.";

pub async fn send(
    model: &str,
    query: String,
    context: Option<ChatContext>,
) -> Result<ChatReply, String> {
    let key = secrets::get("google-api-key")
        .ok_or_else(|| "Google AI API key missing. Open settings.".to_string())?;

    let model_id = if model.is_empty() { "gemini-2.0-flash" } else { model };
    let endpoint = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model_id, key
    );

    let mut parts: Vec<Value> = Vec::new();

    if let Some(ctx) = context {
        match ctx {
            ChatContext::File { name, path } => {
                if let Some(block) = file_part(&path) {
                    parts.push(block);
                }
                parts.push(json!({ "text": format!("Context File: {}", name) }));
            }
            ChatContext::Window { app_name, title, url } => {
                let mut text = format!("Context — App: {}, Window: {}", app_name, title);
                if let Some(u) = url {
                    text.push_str(&format!(", URL: {}", u));
                }
                parts.push(json!({ "text": text }));
            }
        }
    }

    parts.push(json!({ "text": query }));

    let body = json!({
        "systemInstruction": {
            "parts": [{ "text": SYSTEM_PROMPT }]
        },
        "contents": [
            {
                "role": "user",
                "parts": parts
            }
        ]
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .post(&endpoint)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Gemini network error: {e}"))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        let err_msg = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| {
                v.get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .unwrap_or_else(|| text.chars().take(200).collect());
        return Err(format!("Gemini API {status}: {err_msg}"));
    }

    let parsed: Value = serde_json::from_str(&text).map_err(|e| format!("Bad JSON from Gemini: {e}"))?;
    let candidates = parsed.get("candidates").and_then(Value::as_array);

    let answer = candidates
        .and_then(|c| c.first())
        .and_then(|first| first.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(Value::as_array)
        .map(|parts_arr| {
            parts_arr
                .iter()
                .filter_map(|p| p.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default();

    if answer.trim().is_empty() {
        return Err("No response text from Gemini.".into());
    }

    Ok(ChatReply {
        text: answer.trim().to_string(),
    })
}

fn file_part(path: &str) -> Option<Value> {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mime_type = match ext.as_str() {
        "pdf" => Some("application/pdf"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "webp" => Some("image/webp"),
        _ => None,
    };

    if let Some(mime) = mime_type {
        let bytes = std::fs::read(path).ok()?;
        return Some(json!({
            "inlineData": {
                "mimeType": mime,
                "data": crate::claude::base64_for(&bytes)
            }
        }));
    }

    let text = std::fs::read_to_string(path).ok()?;
    if text.len() > 200_000 {
        return None;
    }
    Some(json!({ "text": format!("File content:\n{}", text) }))
}
