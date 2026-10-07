// Real-time Voice Activity Detection (VAD) & Wake Word Matcher
// Listens for "Hey Mochi" and "Coucou" with energy thresholding to prevent false activations.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WakePhrase {
    HeyMochi,
    Coucou,
    Both,
}

impl Default for WakePhrase {
    fn default() -> Self {
        Self::Both
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WakeMatch {
    pub detected: bool,
    pub phrase: String,
    pub confidence: f64,
    pub timestamp_ms: u64,
}

#[allow(dead_code)]
pub struct WakeWordDetector {
    pub phrase: WakePhrase,
    pub sensitivity: f64, // 0.0 to 1.0 (default 0.7)
}

impl WakeWordDetector {
    pub fn new(phrase: WakePhrase) -> Self {
        Self {
            phrase,
            sensitivity: 0.7,
        }
    }

    /// Tests whether a transcribed string or utterance contains the wake word.
    pub fn match_text(&self, text: &str) -> Option<WakeMatch> {
        let clean = clean_text(text);
        if clean.is_empty() {
            return None;
        }

        let words: Vec<&str> = clean.split_whitespace().collect();

        // Check for "Hey Mochi" / "Mochi" / "Hai Mochi"
        let matches_mochi = match self.phrase {
            WakePhrase::HeyMochi | WakePhrase::Both => {
                clean.contains("hey mochi")
                    || clean.contains("hai mochi")
                    || clean.contains("hi mochi")
                    || clean.contains("hello mochi")
                    || clean.contains("halo mochi")
                    || clean.contains("ok mochi")
                    || clean.contains("coucou mochi")
                    || words.iter().any(|&w| w == "mochi")
            }
            WakePhrase::Coucou => false,
        };

        if matches_mochi {
            return Some(WakeMatch {
                detected: true,
                phrase: "hey_mochi".into(),
                confidence: 0.95,
                timestamp_ms: current_time_ms(),
            });
        }

        // Check for "Coucou" / "Hey Coucou" / "Kuku" / "Hai Coucou"
        let matches_coucou = match self.phrase {
            WakePhrase::Coucou | WakePhrase::Both => {
                clean.contains("coucou")
                    || clean.contains("cou cou")
                    || clean.contains("hey coucou")
                    || clean.contains("hai coucou")
                    || clean.contains("kuku")
                    || clean.contains("hey kuku")
                    || clean.contains("hai kuku")
                    || words.iter().any(|&w| w == "coucou" || w == "kuku")
            }
            WakePhrase::HeyMochi => false,
        };

        if matches_coucou {
            return Some(WakeMatch {
                detected: true,
                phrase: "coucou".into(),
                confidence: 0.95,
                timestamp_ms: current_time_ms(),
            });
        }

        None
    }
}

/// Simple energy-based Voice Activity Detection (VAD) for real-time PCM audio chunks.
#[allow(dead_code)]
pub struct EnergyVad {
    pub energy_threshold: f32, // Default: 0.015
    pub speech_frame_count: usize,
    pub silence_frame_count: usize,
    pub min_speech_frames: usize,
    pub max_silence_frames: usize,
    pub is_speech_active: bool,
}

#[allow(dead_code)]
impl EnergyVad {
    pub fn new(threshold: f32) -> Self {
        Self {
            energy_threshold: threshold,
            speech_frame_count: 0,
            silence_frame_count: 0,
            min_speech_frames: 3,
            max_silence_frames: 15,
            is_speech_active: false,
        }
    }

    /// Process a mono float PCM frame (-1.0 to 1.0) and return true if voice is active.
    pub fn process_frame(&mut self, samples: &[f32]) -> bool {
        if samples.is_empty() {
            return self.is_speech_active;
        }

        let sum_sq: f32 = samples.iter().map(|&s| s * s).sum();
        let rms = (sum_sq / samples.len() as f32).sqrt();

        if rms >= self.energy_threshold {
            self.speech_frame_count += 1;
            self.silence_frame_count = 0;
            if self.speech_frame_count >= self.min_speech_frames {
                self.is_speech_active = true;
            }
        } else {
            self.silence_frame_count += 1;
            if self.silence_frame_count >= self.max_silence_frames {
                self.speech_frame_count = 0;
                self.is_speech_active = false;
            }
        }

        self.is_speech_active
    }

    pub fn reset(&mut self) {
        self.speech_frame_count = 0;
        self.silence_frame_count = 0;
        self.is_speech_active = false;
    }
}

fn clean_text(raw: &str) -> String {
    raw.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c.is_whitespace() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn current_time_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wake_phrase_hey_mochi() {
        let detector = WakeWordDetector::new(WakePhrase::HeyMochi);
        assert!(detector.match_text("Hey Mochi!").is_some());
        assert!(detector.match_text("hai mochi, apa kabar?").is_some());
        assert!(detector.match_text("hi mochi, what's up?").is_some());
        assert!(detector.match_text("hello mochi").is_some());
        assert!(detector.match_text("ok mochi").is_some());
        assert!(detector.match_text("Mochi").is_some());
        assert!(detector.match_text("coucou").is_none());
    }

    #[test]
    fn test_wake_phrase_coucou() {
        let detector = WakeWordDetector::new(WakePhrase::Coucou);
        assert!(detector.match_text("Coucou!").is_some());
        assert!(detector.match_text("hey coucou").is_some());
        assert!(detector.match_text("hai coucou").is_some());
        assert!(detector.match_text("kuku").is_some());
        assert!(detector.match_text("coucou, comment vas-tu?").is_some());
        assert!(detector.match_text("hey mochi").is_none());
    }

    #[test]
    fn test_wake_phrase_both() {
        let detector = WakeWordDetector::new(WakePhrase::Both);
        assert!(detector.match_text("Hey Mochi!").is_some());
        assert!(detector.match_text("hai mochi").is_some());
        assert!(detector.match_text("Coucou!").is_some());
        assert!(detector.match_text("kuku").is_some());
        assert!(detector.match_text("Random conversation about nothing").is_none());
    }

    #[test]
    fn test_energy_vad() {
        let mut vad = EnergyVad::new(0.02);
        let silence = vec![0.001f32; 100];
        let speech = vec![0.1f32; 100];

        // Initially silent
        assert!(!vad.process_frame(&silence));

        // 3 consecutive speech frames should trigger voice activity
        vad.process_frame(&speech);
        vad.process_frame(&speech);
        let active = vad.process_frame(&speech);
        assert!(active);

        // After silence frames, speech becomes inactive
        for _ in 0..16 {
            vad.process_frame(&silence);
        }
        assert!(!vad.is_speech_active);
    }
}
