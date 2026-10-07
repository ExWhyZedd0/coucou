pub mod gemini;
pub mod openai;
pub mod local;

use crate::claude::{self, Chat, ChatContext, ChatReply};

pub async fn send(
    chat: &Chat,
    provider: &str,
    model: &str,
    query: String,
    context: Option<ChatContext>,
    ollama_url: &str,
    lmstudio_url: &str,
) -> Result<ChatReply, String> {
    match provider.to_lowercase().as_str() {
        "anthropic" | "claude" => {
            claude::send(chat, model, query, context).await
        }
        "google" | "gemini" => {
            gemini::send(model, query, context).await
        }
        "openai" => {
            openai::send(model, query, context).await
        }
        "ollama" => {
            local::send(ollama_url, model, query, context).await
        }
        "lmstudio" => {
            local::send(lmstudio_url, model, query, context).await
        }
        _ => Err(format!("Unknown provider '{provider}'")),
    }
}

pub async fn list_models(provider: &str, ollama_url: &str, lmstudio_url: &str) -> Result<Vec<String>, String> {
    match provider.to_lowercase().as_str() {
        "anthropic" | "claude" => Ok(vec![
            "claude-opus-5".into(),
            "claude-sonnet-5".into(),
            "claude-haiku-4-5".into(),
        ]),
        "google" | "gemini" => Ok(vec![
            "gemini-2.0-flash".into(),
            "gemini-2.5-pro".into(),
            "gemini-2.5-flash".into(),
        ]),
        "openai" => Ok(vec![
            "gpt-4o".into(),
            "gpt-4o-mini".into(),
            "o3-mini".into(),
        ]),
        "ollama" => local::list_models(ollama_url).await,
        "lmstudio" => local::list_models(lmstudio_url).await,
        _ => Err(format!("Unknown provider '{provider}'")),
    }
}

pub async fn check_server(provider: &str, ollama_url: &str, lmstudio_url: &str) -> bool {
    match provider.to_lowercase().as_str() {
        "ollama" => local::check_server(ollama_url).await,
        "lmstudio" => local::check_server(lmstudio_url).await,
        _ => true,
    }
}
