// Preferences, stored as plain JSON in settings.json under platform::config_dir().
// No secret ever lands here — API keys live in the OS keychain (see secrets.rs).

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub sound_enabled: bool,
    pub sound_volume: f64,
    pub auto_close_interval: f64,
    pub absence_interval: f64,
    pub active_integrations: Vec<String>,
    /// "primary" = the main display, "cursor" = whichever display the mouse is on.
    pub screen: String,
    pub autostart: bool,
    pub hooks_installed: bool,
    /// Claude model used by the chat. Changeable in the settings window.
    /// Defaulted explicitly so a settings.json written by an older build still loads.
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_chat_provider")]
    pub chat_provider: String,
    #[serde(default = "default_gemini_model")]
    pub gemini_model: String,
    #[serde(default = "default_openai_model")]
    pub openai_model: String,
    #[serde(default = "default_ollama_model")]
    pub ollama_model: String,
    #[serde(default = "default_lmstudio_model")]
    pub lmstudio_model: String,
    #[serde(default = "default_ollama_url")]
    pub ollama_url: String,
    #[serde(default = "default_lmstudio_url")]
    pub lmstudio_url: String,
    #[serde(default = "default_outfit")]
    pub mochi_outfit: String,
    #[serde(default)]
    pub mochi_on_desktop: bool,
    #[serde(default = "default_true")]
    pub global_shortcuts_enabled: bool,
    #[serde(default = "default_true")]
    pub voice_wake_word_enabled: bool,
    #[serde(default = "default_wake_phrase")]
    pub voice_wake_phrase: String,
    #[serde(default = "default_true")]
    pub voice_tts_enabled: bool,
    #[serde(default = "default_tts_voice")]
    pub voice_tts_voice: String,
    #[serde(default = "default_voice_rate")]
    pub voice_tts_rate: f64,
    #[serde(default = "default_voice_pitch")]
    pub voice_tts_pitch: f64,
    #[serde(default)]
    pub voice_push_to_talk: bool,
    #[serde(default = "default_mic_device")]
    pub voice_microphone_device: String,
    #[serde(default = "default_preamp_boost")]
    pub voice_preamp_boost: f64,
    #[serde(default = "default_main_pill")]
    pub main_pill: String,
}

fn default_model() -> String {
    crate::claude::DEFAULT_MODEL.to_string()
}
fn default_chat_provider() -> String {
    "anthropic".to_string()
}
fn default_gemini_model() -> String {
    "gemini-2.0-flash".to_string()
}
fn default_openai_model() -> String {
    "gpt-4o".to_string()
}
fn default_ollama_model() -> String {
    "llama3.2".to_string()
}
fn default_lmstudio_model() -> String {
    "local-model".to_string()
}
fn default_ollama_url() -> String {
    "http://localhost:11434".to_string()
}
fn default_lmstudio_url() -> String {
    "http://localhost:1234".to_string()
}
fn default_outfit() -> String {
    "auto".to_string()
}
fn default_true() -> bool {
    true
}
fn default_wake_phrase() -> String {
    "both".to_string()
}
fn default_tts_voice() -> String {
    "default".to_string()
}
fn default_voice_rate() -> f64 {
    1.0
}
fn default_voice_pitch() -> f64 {
    1.1
}
fn default_mic_device() -> String {
    "default".to_string()
}
fn default_preamp_boost() -> f64 {
    3.0
}
fn default_main_pill() -> String {
    "integration_claude".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            sound_enabled: true,
            sound_volume: 0.12,
            auto_close_interval: 15.0,
            absence_interval: 180.0,
            active_integrations: vec![
                "integration_resend".into(),
                "integration_n8n".into(),
                "integration_vercel".into(),
                "integration_github".into(),
            ],
            screen: "primary".into(),
            autostart: false,
            hooks_installed: false,
            model: default_model(),
            chat_provider: default_chat_provider(),
            gemini_model: default_gemini_model(),
            openai_model: default_openai_model(),
            ollama_model: default_ollama_model(),
            lmstudio_model: default_lmstudio_model(),
            ollama_url: default_ollama_url(),
            lmstudio_url: default_lmstudio_url(),
            mochi_outfit: default_outfit(),
            mochi_on_desktop: false,
            global_shortcuts_enabled: true,
            voice_wake_word_enabled: true,
            voice_wake_phrase: default_wake_phrase(),
            voice_tts_enabled: true,
            voice_tts_voice: default_tts_voice(),
            voice_tts_rate: default_voice_rate(),
            voice_tts_pitch: default_voice_pitch(),
            voice_push_to_talk: false,
            voice_microphone_device: default_mic_device(),
            voice_preamp_boost: default_preamp_boost(),
            main_pill: default_main_pill(),
        }
    }
}

pub use crate::platform::{config_dir, local_dir};

pub fn hook_exe_path() -> PathBuf {
    local_dir().join("bin").join(crate::platform::HOOK_EXE)
}

fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

pub fn load() -> Settings {
    match std::fs::read(settings_path()) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Settings::default(),
    }
}

pub fn save(settings: &Settings) -> std::io::Result<()> {
    let dir = config_dir();
    crate::platform::ensure_private_dir(&dir)?;
    let json = serde_json::to_vec_pretty(settings)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::write(settings_path(), json)
}
