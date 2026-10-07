// Local Neural Text-to-Speech (TTS) Engine
// Synthesizes speech with cute companion voice persona and generates timed mouth visemes.

use std::process::Command;
use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceInfo {
    pub id: String,
    pub name: String,
    pub language: String,
    pub culture: String,
    pub gender: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisemeCue {
    pub time_offset_ms: u64,
    pub shape: String, // "neutral" | "smile" | "open" | "o" | "wide"
    pub amplitude: f32, // 0.0 to 1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsResult {
    pub audio_base64: String,
    pub duration_ms: u64,
    pub visemes: Vec<VisemeCue>,
    pub voice_used: String,
}

pub struct LocalTtsEngine;

impl LocalTtsEngine {
    /// Lists all installed system voices available for speech synthesis on Windows.
    pub fn list_installed_voices() -> Vec<VoiceInfo> {
        let mut list = Vec::new();

        // Query Windows System.Speech & OneCore installed voices via PowerShell
        let script = r#"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
Add-Type -AssemblyName System.Speech;
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;
$s.GetInstalledVoices() | ForEach-Object {
    $v = $_.VoiceInfo;
    $v.Name + "`t" + $v.Culture.Name + "`t" + $v.Gender
}
"#;

        let mut ps_cmd = Command::new("powershell");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            ps_cmd.creation_flags(0x08000000);
        }

        if let Ok(output) = ps_cmd
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .output()
        {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let parts: Vec<&str> = line.trim().split('\t').collect();
                    if parts.len() >= 3 {
                        let is_def = parts[0].contains("Zira") || parts[0].contains("David");
                        list.push(VoiceInfo {
                            id: parts[0].to_string(),
                            name: parts[0].to_string(),
                            language: parts[1].to_string(),
                            culture: parts[1].to_string(),
                            gender: parts[2].to_string(),
                            is_default: is_def,
                        });
                    }
                }
            }
        }

        // Always ensure at least default cute fallback voices are present
        if list.is_empty() {
            list.push(VoiceInfo {
                id: "default".into(),
                name: "Microsoft Zira (Companion)".into(),
                language: "en-US".into(),
                culture: "en-US".into(),
                gender: "Female".into(),
                is_default: true,
            });
            list.push(VoiceInfo {
                id: "david".into(),
                name: "Microsoft David".into(),
                language: "en-US".into(),
                culture: "en-US".into(),
                gender: "Male".into(),
                is_default: false,
            });
        }

        list
    }

    /// Synthesizes text via the persistent neural TTS daemon (Kokoro-82M / Piper on port 8178)
    pub async fn synthesize_daemon(
        text: &str,
        voice_name: Option<&str>,
        rate: f64,
        pitch: f64,
    ) -> Result<TtsResult, String> {
        let clean = clean_text_for_speech(text);
        if clean.is_empty() {
            return Err("Cannot speak empty text".into());
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_millis(2500))
            .build()
            .map_err(|e| format!("HTTP client error: {e}"))?;

        let body = serde_json::json!({
            "input": clean,
            "voice": voice_name.unwrap_or("companion"),
            "speed": rate,
            "pitch": pitch,
        });

        let res = client
            .post("http://127.0.0.1:8178/v1/audio/speech")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Neural TTS daemon unreachable: {e}"))?;

        if !res.status().is_success() {
            return Err(format!("Neural TTS daemon returned HTTP {}", res.status()));
        }

        let parsed: TtsResult = res.json().await.map_err(|e| format!("Bad JSON response: {e}"))?;
        Ok(parsed)
    }

    /// Synthesizes text into base64 WAV audio bytes using Windows local speech engine
    pub fn synthesize(
        text: &str,
        voice_name: Option<&str>,
        rate: f64,  // 0.5 to 2.0 (1.0 = normal)
        pitch: f64, // 0.8 to 1.5 (1.1 = cute companion pitch)
    ) -> Result<TtsResult, String> {
        let clean = clean_text_for_speech(text);
        if clean.is_empty() {
            return Err("Cannot speak empty text".into());
        }

        // Clamp rate (-10 to 10 for System.Speech where 0 is normal)
        // Rate 1.0 -> 0, Rate 1.2 -> 2, Rate 0.8 -> -2
        let sys_rate = ((rate - 1.0) * 10.0).round().clamp(-10.0, 10.0) as i32;

        let voice_selector = if let Some(v) = voice_name {
            if v != "default" && !v.is_empty() {
                format!(r#"try {{ $s.SelectVoice('{}') }} catch {{}}"#, escape_ps(v))
            } else {
                r#"try { $s.SelectVoice('Microsoft Zira Desktop') } catch {}"#.to_string()
            }
        } else {
            r#"try { $s.SelectVoice('Microsoft Zira Desktop') } catch {}"#.to_string()
        };

        let text_b64 = base64::engine::general_purpose::STANDARD.encode(clean.as_bytes());

        let script = format!(
            r#"
$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
Add-Type -AssemblyName System.Speech;
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;
{voice_selector}
$s.Rate = {sys_rate};
$text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{text_b64}'));
$ms = New-Object System.IO.MemoryStream;
$s.SetOutputToWaveStream($ms);
$s.Speak($text);
[Convert]::ToBase64String($ms.ToArray())
"#
        );

        let mut ps_cmd = Command::new("powershell");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            ps_cmd.creation_flags(0x08000000);
        }

        let output = ps_cmd
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .output()
            .map_err(|e| format!("failed to invoke powershell speech: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("speech synthesis error: {stderr}"));
        }

        let audio_base64 = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if audio_base64.is_empty() {
            return Err("Empty audio produced by synthesizer".into());
        }

        // Approximate duration based on word count & speech rate:
        // Average speaking rate ~ 150 words per minute (~2.5 words per sec)
        let words_count = clean.split_whitespace().count().max(1);
        let sec_per_word = 0.40 / rate.max(0.5);
        let duration_ms = (words_count as f64 * sec_per_word * 1000.0).round() as u64;

        // Generate expressive timed viseme cues for Mochi's mouth
        let visemes = generate_visemes_for_text(&clean, duration_ms, pitch);

        Ok(TtsResult {
            audio_base64,
            duration_ms,
            visemes,
            voice_used: voice_name.unwrap_or("Microsoft Zira").to_string(),
        })
    }
}

/// Generates timed viseme shapes and amplitudes for mouth movement
pub fn generate_visemes_for_text(text: &str, duration_ms: u64, pitch: f64) -> Vec<VisemeCue> {
    let mut cues = Vec::new();
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.is_empty() {
        return cues;
    }

    let word_duration_ms = duration_ms / words.len() as u64;

    for (i, &word) in words.iter().enumerate() {
        let start_time = i as u64 * word_duration_ms;
        let word_len = word.len().max(1);
        let sub_step = (word_duration_ms / word_len as u64).max(40);

        for (j, c) in word.chars().enumerate() {
            let t = start_time + (j as u64 * sub_step);
            if t >= duration_ms {
                break;
            }

            let (shape, amp) = match c.to_ascii_lowercase() {
                'a' | 'h' => ("open", 0.85),
                'o' | 'u' => ("o", 0.75),
                'e' | 'i' | 'y' => ("smile", 0.80),
                'w' | 'r' | 'l' => ("wide", 0.70),
                'm' | 'b' | 'p' => ("neutral", 0.20),
                _ => ("open", 0.55),
            };

            // Cute companion pitch boost
            let modulated_amp = (amp * (pitch as f32 * 0.95)).clamp(0.1, 1.0);

            cues.push(VisemeCue {
                time_offset_ms: t,
                shape: shape.to_string(),
                amplitude: modulated_amp,
            });
        }
    }

    // Final rest cue
    cues.push(VisemeCue {
        time_offset_ms: duration_ms,
        shape: "neutral".into(),
        amplitude: 0.0,
    });

    cues
}

fn clean_text_for_speech(raw: &str) -> String {
    let s = raw
        .replace(['\r', '\n'], " ")
        .replace(['"', '\''], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    s.replace(" .", ".")
        .replace(" ,", ",")
        .replace(" !", "!")
        .replace(" ?", "?")
}

fn escape_ps(s: &str) -> String {
    s.replace('\'', "''")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clean_text_for_speech() {
        let input = "Hello\nWorld!\r\nLet's test 'quotes' and \"double quotes\".";
        let cleaned = clean_text_for_speech(input);
        assert!(!cleaned.contains('\n'));
        assert!(!cleaned.contains('\''));
        assert!(!cleaned.contains('"'));
        assert_eq!(cleaned, "Hello World! Let s test quotes and double quotes.");
    }

    #[test]
    fn test_viseme_generation_bounds() {
        let cues = generate_visemes_for_text("Hello Mochi", 1000, 1.1);
        assert!(!cues.is_empty());
        assert_eq!(cues.last().unwrap().shape, "neutral");
        assert_eq!(cues.last().unwrap().amplitude, 0.0);
        assert!(cues.iter().all(|c| c.time_offset_ms <= 1000));
    }
}
