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
    let key = secrets::get("openai-api-key")
        .ok_or_else(|| "OpenAI API key missing. Open settings.".to_string())?;

    let model_id = if model.is_empty() { "gpt-4o" } else { model };
    let endpoint = "https://api.openai.com/v1/chat/completions";

    let mut messages: Vec<Value> = vec![
        json!({ "role": "system", "content": SYSTEM_PROMPT })
    ];

    let mut user_content = String::new();
    if let Some(ctx) = context {
        match ctx {
            ChatContext::File { name, path } => {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if content.len() <= 100_000 {
                        user_content.push_str(&format!("[Context File: {}\n{}]\n\n", name, content));
                    } else {
                        user_content.push_str(&format!("[Context File: {}]\n\n", name));
                    }
                }
            }
            ChatContext::Window { app_name, title, url } => {
                user_content.push_str(&format!("[Context Window — App: {}, Title: {}{}]\n\n",
                    app_name, title, url.map(|u| format!(", URL: {}", u)).unwrap_or_default()));
            }
        }
    }
    user_content.push_str(&query);

    messages.push(json!({ "role": "user", "content": user_content }));

    let body = json!({
        "model": model_id,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 4096
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .post(endpoint)
        .header("Authorization", format!("Bearer {}", key))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI network error: {e}"))?;

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
        return Err(format!("OpenAI API {status}: {err_msg}"));
    }

    let parsed: Value = serde_json::from_str(&text).map_err(|e| format!("Bad JSON from OpenAI: {e}"))?;
    let content = parsed
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|c| c.first())
        .and_then(|first| first.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(Value::as_str)
        .unwrap_or("");

    if content.trim().is_empty() {
        return Err("No response text from OpenAI.".into());
    }

    Ok(ChatReply {
        text: content.trim().to_string(),
    })
}
