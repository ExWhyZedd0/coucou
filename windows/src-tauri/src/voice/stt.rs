// High-speed local Speech-to-Text (STT) processor
// Integrates with local Whisper engine / local audio endpoints with hallucination filtering.

use std::process::Command;
use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub language: String,
    pub duration_sec: f64,
}

#[allow(dead_code)]
pub struct LocalSttEngine {
    pub local_endpoint: String,
}

impl Default for LocalSttEngine {
    fn default() -> Self {
        Self {
            local_endpoint: "http://127.0.0.1:8178/v1/audio/transcriptions".into(),
        }
    }
}

#[allow(dead_code)]
impl LocalSttEngine {
    pub fn new(endpoint: Option<String>) -> Self {
        Self {
            local_endpoint: endpoint.unwrap_or_else(|| "http://127.0.0.1:8178/v1/audio/transcriptions".into()),
        }
    }

    /// Sends WAV audio bytes to the persistent Whisper GPU daemon (port 8178)
    pub async fn transcribe(&self, audio_bytes: &[u8]) -> Result<String, String> {
        if audio_bytes.is_empty() {
            return Ok(String::new());
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

        let res = client
            .post(&self.local_endpoint)
            .header("Content-Type", "audio/wav")
            .body(audio_bytes.to_vec())
            .send()
            .await
            .map_err(|e| format!("Whisper daemon request failed: {e}"))?;

        if !res.status().is_success() {
            return Err(format!("Whisper daemon error: HTTP {}", res.status()));
        }

        let val: serde_json::Value = res.json().await.map_err(|e| format!("Bad JSON response: {e}"))?;
        let raw_text = val.get("text").and_then(|t| t.as_str()).unwrap_or("");
        Ok(Self::sanitize_transcript(raw_text))
    }

    /// Clean up raw Whisper transcriptions to remove hallucinatory repetitive tokens
    pub fn sanitize_transcript(raw: &str) -> String {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return String::new();
        }

        let mut cleaned = String::new();
        for line in trimmed.lines() {
            let mut line_trim = line.trim();
            // Strip Whisper timestamp markers like "[00:00.000 -> 00:02.000]"
            if line_trim.starts_with('[') {
                if let Some(close_idx) = line_trim.find(']') {
                    let inside = &line_trim[1..close_idx];
                    if inside.contains("->") || inside.contains(':') {
                        line_trim = line_trim[close_idx + 1..].trim();
                    }
                }
            }
            if line_trim.is_empty() {
                continue;
            }

            // Skip common Whisper hallucinations when input is silent or background noise
            let lower = line_trim.to_lowercase();
            if lower == "[blank_audio]"
                || lower == "[silence]"
                || lower == "(silence)"
                || lower == "(music)"
                || lower == "[music]"
                || lower == "you"
                || lower == "thank you."
                || lower == "bye."
                || lower == "subtitles by the amara.org community"
            {
                continue;
            }

            if !cleaned.is_empty() {
                cleaned.push(' ');
            }
            cleaned.push_str(line_trim);
        }

        cleaned.trim().to_string()
    }

    /// Validates if an audio slice has a valid RIFF/WAV header
    pub fn is_valid_wav(data: &[u8]) -> bool {
        if data.len() < 12 {
            return false;
        }
        &data[0..4] == b"RIFF" && &data[8..12] == b"WAVE"
    }

    /// Fallback to Windows System.Speech.Recognition when local Whisper daemon is offline
    pub fn transcribe_sapi_fallback(audio_bytes: &[u8]) -> Result<String, String> {
        if audio_bytes.len() < 44 || !Self::is_valid_wav(audio_bytes) {
            return Ok(String::new());
        }

        let temp_dir = std::env::temp_dir();
        let temp_wav = temp_dir.join(format!("coucou_speech_{}_{}.wav", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis()));
        if let Err(e) = std::fs::write(&temp_wav, audio_bytes) {
            return Err(format!("Failed to write temp wav: {e}"));
        }

        let script = format!(
            r#"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
Add-Type -AssemblyName System.Speech;
try {{
    $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine;
    $rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar));
    $rec.SetInputToWaveFile('{}');
    $res = $rec.Recognize([TimeSpan]::FromSeconds(3));
    if ($res) {{ $res.Text }}
}} catch {{}}
"#,
            temp_wav.to_string_lossy().replace('\'', "''")
        );

        let mut cmd = Command::new("powershell");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let output = cmd
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output();

        let _ = std::fs::remove_file(&temp_wav);

        match output {
            Ok(out) if out.status.success() => {
                let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
                Ok(Self::sanitize_transcript(&text))
            }
            _ => Ok(String::new()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_transcript_removes_whisper_artifacts() {
        let raw = "[BLANK_AUDIO]\nHello Mochi, how are you today?\n[silence]\n(music)";
        let sanitized = LocalSttEngine::sanitize_transcript(raw);
        assert_eq!(sanitized, "Hello Mochi, how are you today?");
    }

    #[test]
    fn test_sanitize_transcript_removes_timestamp_brackets() {
        let raw = "[00:00.000 -> 00:02.500] What is the weather outside?";
        let sanitized = LocalSttEngine::sanitize_transcript(raw);
        assert_eq!(sanitized, "What is the weather outside?");

        let multi = "[00:00.000 -> 00:02.000]\nCoucou Mochi";
        let multi_clean = LocalSttEngine::sanitize_transcript(multi);
        assert_eq!(multi_clean, "Coucou Mochi");
    }

    #[test]
    fn test_wav_header_validation() {
        let valid_wav_header = b"RIFF\x24\x00\x00\x00WAVEfmt ";
        assert!(LocalSttEngine::is_valid_wav(valid_wav_header));

        let invalid = b"NOTAWAVFILE";
        assert!(!LocalSttEngine::is_valid_wav(invalid));
    }
}
