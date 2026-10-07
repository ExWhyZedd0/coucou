// Voice Awake, Local STT & Neural TTS Coordinator
// Drives real-time speech interaction and mouth visemes on Mochi.

pub mod stt;
pub mod tts;
pub mod wake_word;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use serde::{Deserialize, Serialize};

#[allow(unused_imports)]
pub use stt::LocalSttEngine;
#[allow(unused_imports)]
pub use tts::{LocalTtsEngine, TtsResult, VoiceInfo, VisemeCue};
pub use wake_word::{WakeMatch, WakePhrase, WakeWordDetector};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceStatus {
    pub is_listening: bool,
    pub is_speaking: bool,
    pub wake_word_enabled: bool,
    pub wake_phrase: String,
    pub current_voice: String,
}

pub struct VoiceManager {
    pub is_listening: AtomicBool,
    pub is_speaking: AtomicBool,
    pub wake_word_enabled: AtomicBool,
    pub wake_detector: Mutex<WakeWordDetector>,
    pub current_voice: Mutex<String>,
}

impl Default for VoiceManager {
    fn default() -> Self {
        Self {
            is_listening: AtomicBool::new(false),
            is_speaking: AtomicBool::new(false),
            wake_word_enabled: AtomicBool::new(true),
            wake_detector: Mutex::new(WakeWordDetector::new(WakePhrase::Both)),
            current_voice: Mutex::new("Microsoft Zira (Companion)".into()),
        }
    }
}

// ── Tauri Commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn voice_start_listening(
    app: AppHandle,
    voice: State<VoiceManager>,
) -> Result<VoiceStatus, String> {
    voice.is_listening.store(true, Ordering::Relaxed);
    let status = voice_get_status(voice);
    let _ = app.emit("voice-listening-state", true);
    Ok(status)
}

#[tauri::command]
pub fn voice_stop_listening(
    app: AppHandle,
    voice: State<VoiceManager>,
) -> Result<VoiceStatus, String> {
    voice.is_listening.store(false, Ordering::Relaxed);
    let status = voice_get_status(voice);
    let _ = app.emit("voice-listening-state", false);
    Ok(status)
}

#[tauri::command]
pub async fn voice_speak_text(
    app: AppHandle,
    voice: State<'_, VoiceManager>,
    text: String,
    voice_name: Option<String>,
    rate: Option<f64>,
    pitch: Option<f64>,
) -> Result<TtsResult, String> {
    voice.is_speaking.store(true, Ordering::Relaxed);
    let _ = app.emit("voice-speaking-start", &text);

    let v_name = voice_name.or_else(|| {
        let guard = voice.current_voice.lock().unwrap();
        Some(guard.clone())
    });

    let rate_val = rate.unwrap_or(1.0);
    let pitch_val = pitch.unwrap_or(1.1);

    // 1. Attempt persistent Neural TTS daemon first (Kokoro-82M / Piper on port 8178)
    let res = match LocalTtsEngine::synthesize_daemon(&text, v_name.as_deref(), rate_val, pitch_val).await {
        Ok(neural_res) => Ok(neural_res),
        Err(_) => {
            // 2. Seamless fallback to local Windows SAPI / System.Speech
            LocalTtsEngine::synthesize(
                &text,
                v_name.as_deref(),
                rate_val,
                pitch_val,
            )
        }
    };

    voice.is_speaking.store(false, Ordering::Relaxed);
    let _ = app.emit("voice-speaking-end", ());

    res
}

#[tauri::command]
pub fn voice_get_status(voice: State<VoiceManager>) -> VoiceStatus {
    let wake_phrase = {
        let det = voice.wake_detector.lock().unwrap();
        match det.phrase {
            WakePhrase::HeyMochi => "hey_mochi".into(),
            WakePhrase::Coucou => "coucou".into(),
            WakePhrase::Both => "both".into(),
        }
    };
    let current_voice = voice.current_voice.lock().unwrap().clone();

    VoiceStatus {
        is_listening: voice.is_listening.load(Ordering::Relaxed),
        is_speaking: voice.is_speaking.load(Ordering::Relaxed),
        wake_word_enabled: voice.wake_word_enabled.load(Ordering::Relaxed),
        wake_phrase,
        current_voice,
    }
}

#[tauri::command]
pub fn voice_list_voices() -> Vec<VoiceInfo> {
    LocalTtsEngine::list_installed_voices()
}

#[tauri::command]
pub fn voice_detect_wake_word(
    voice: State<VoiceManager>,
    text: String,
) -> Option<WakeMatch> {
    let det = voice.wake_detector.lock().unwrap();
    det.match_text(&text)
}

#[tauri::command]
pub async fn voice_transcribe_audio(audio_base64: String) -> Result<String, String> {
    if audio_base64.is_empty() {
        return Ok(String::new());
    }

    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(&audio_base64)
        .map_err(|e| format!("invalid base64 audio: {e}"))?;

    if decoded.is_empty() {
        return Ok(String::new());
    }

    let engine = LocalSttEngine::default();
    match engine.transcribe(&decoded).await {
        Ok(text) if !text.trim().is_empty() => Ok(text),
        _ => {
            // Fallback to Windows built-in speech recognition (SAPI)
            LocalSttEngine::transcribe_sapi_fallback(&decoded)
        }
    }
}
