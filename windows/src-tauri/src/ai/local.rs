use serde_json::{json, Value};
use crate::claude::{ChatContext, ChatReply};

const SYSTEM_PROMPT: &str = "You are Mochi, a personal AI assistant living at the top of the user's screen. \
You can help with research, coding, writing, and questions. \
Respond in the user's language. Be concise yet helpful.";

pub async fn send(
    base_url: &str,
    model: &str,
    query: String,
    context: Option<ChatContext>,
) -> Result<ChatReply, String> {
    let clean_url = base_url.trim_end_matches('/');
    let endpoint = format!("{}/v1/chat/completions", clean_url);

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
        "model": model,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 4096
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
        .map_err(|e| format!("Cannot reach {clean_url}. Is the server running? ({e})"))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("Local model server returned status {status}: {text}"));
    }

    let parsed: Value = serde_json::from_str(&text).map_err(|e| format!("Bad JSON response: {e}"))?;
    let raw_content = parsed
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|c| c.first())
        .and_then(|first| first.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(Value::as_str)
        .unwrap_or("");

    // Keep thinking tags (<think>...</think>) intact per requirement 5
    if raw_content.trim().is_empty() {
        return Err("No content returned from local model.".into());
    }

    Ok(ChatReply {
        text: raw_content.trim().to_string(),
    })
}

pub async fn list_models(base_url: &str) -> Result<Vec<String>, String> {
    let clean_url = base_url.trim_end_matches('/');
    let endpoint = format!("{}/v1/models", clean_url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(&endpoint)
        .send()
        .await
        .map_err(|e| format!("Server unreachable: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("Failed to list models: HTTP {}", res.status()));
    }

    let val: Value = res.json().await.map_err(|e| e.to_string())?;
    let mut models = Vec::new();
    if let Some(arr) = val.get("data").and_then(Value::as_array) {
        for item in arr {
            if let Some(id) = item.get("id").or_else(|| item.get("name")).and_then(Value::as_str) {
                let id_lower = id.to_lowercase();
                if !id_lower.contains("embed") && !id_lower.contains("rerank") && !id_lower.contains("clip") {
                    models.push(id.to_string());
                }
            }
        }
    } else if let Some(arr) = val.get("models").and_then(Value::as_array) {
        for item in arr {
            if let Some(name) = item.get("name").or_else(|| item.get("model")).and_then(Value::as_str) {
                let name_lower = name.to_lowercase();
                if !name_lower.contains("embed") && !name_lower.contains("rerank") && !name_lower.contains("clip") {
                    models.push(name.to_string());
                }
            }
        }
    }
    Ok(models)
}

pub async fn check_server(base_url: &str) -> bool {
    let clean_url = base_url.trim_end_matches('/');
    let endpoint = format!("{}/v1/models", clean_url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(2))
        .build();
    if let Ok(c) = client {
        c.get(&endpoint).send().await.map(|r| r.status().is_success()).unwrap_or(false)
    } else {
        false
    }
}

/// Removes completed <think>...</think> and <thought>...</thought> blocks as in LocalChat.swift
#[allow(dead_code)]
pub fn filter_thinking_blocks(text: &str) -> String {
    let mut result = String::new();
    let mut remainder = text;
    while let Some(start) = remainder.find("<think>") {
        result.push_str(&remainder[..start]);
        if let Some(end) = remainder[start..].find("</think>") {
            remainder = &remainder[start + end + 8..];
        } else {
            remainder = "";
            break;
        }
    }
    result.push_str(remainder);

    let mut final_result = String::new();
    let mut remainder = result.as_str();
    while let Some(start) = remainder.find("<thought>") {
        final_result.push_str(&remainder[..start]);
        if let Some(end) = remainder[start..].find("</thought>") {
            remainder = &remainder[start + end + 10..];
        } else {
            remainder = "";
            break;
        }
    }
    final_result.push_str(remainder);
    final_result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_filter_thinking_blocks() {
        assert_eq!(filter_thinking_blocks("plain text"), "plain text");
        assert_eq!(filter_thinking_blocks("<think>secret thoughts</think>answer here"), "answer here");
        assert_eq!(filter_thinking_blocks("<thought>deep thought</thought>result"), "result");
        assert_eq!(filter_thinking_blocks("start <think>abc</think> mid <thought>xyz</thought> end"), "start  mid  end");
        assert_eq!(filter_thinking_blocks("<think>unclosed thought"), "");
    }
}
