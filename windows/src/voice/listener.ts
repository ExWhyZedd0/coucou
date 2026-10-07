// Voice Awake & Speech Recognition Listener
// Listens for local wake words ("Hey Coucou", "coucou", "kuku", "mochi", "hey mochi", "hai mochi"),
// integrates with AudioCore (RMS Energy Gate, Pre-amp Boost, Peak Normalization, Barge-In),
// and supports real-time auto-typing with 1.0s silence auto-send.

import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import { State } from "../core/state";
import { AudioCore, type WavEncodeResult } from "./audio_core";
import { VoiceSpeakerEngine } from "./speaker";

export type WakeCallback = (wakePhrase: string, query: string) => void;
export type TranscriptCallback = (text: string, isFinal: boolean) => void;

interface IWindowSpeechRecognition {
  new (): ISpeechRecognition;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export class VoiceListener {
  private static instance: VoiceListener | null = null;
  private recognition: ISpeechRecognition | null = null;
  private isListening = false;
  private wakeCallbacks: Set<WakeCallback> = new Set();
  private transcriptCallbacks: Set<TranscriptCallback> = new Set();
  private restartTimeout: number | null = null;

  private awaitingQuery = false;
  private awaitingQueryTimeout: number | null = null;
  private lastWakePhrase = "hey_mochi";

  private silenceTimer: number | null = null;
  private currentSpokenText = "";

  static getInstance(): VoiceListener {
    if (!VoiceListener.instance) {
      VoiceListener.instance = new VoiceListener();
    }
    return VoiceListener.instance;
  }

  constructor() {
    this.initRecognition();
    this.wireAudioCore();
  }

  onWake(cb: WakeCallback): () => void {
    this.wakeCallbacks.add(cb);
    return () => this.wakeCallbacks.delete(cb);
  }

  onTranscript(cb: TranscriptCallback): () => void {
    this.transcriptCallbacks.add(cb);
    return () => this.transcriptCallbacks.delete(cb);
  }

  private wireAudioCore() {
    // 1. Barge-In: Halt TTS immediately when user begins speaking or calls Mochi
    AudioCore.onBargeIn = () => {
      if (State.isVoiceSpeaking) {
        console.info("[coucou voice] Barge-In triggered: stopping TTS playback");
        VoiceSpeakerEngine.stop();
        Sound.play("pop");
      }
    };

    // 2. Real-time interim audio transcription for auto-typing
    AudioCore.onSpeechInterim = async (wavResult: WavEncodeResult) => {
      if (!wavResult.base64) return;
      try {
        const partial = await Bridge.voiceTranscribeAudio(wavResult.base64);
        if (partial && partial.trim()) {
          this.dispatchTranscript(partial.trim(), false);
        }
      } catch (err) {
        console.debug("[coucou voice] interim transcription error:", err);
      }
    };

    // 3. Audio Core speech utterance ended (Universal Peak Normalized 0.85 WAV)
    AudioCore.onSpeechEnd = async (wavResult: WavEncodeResult) => {
      if (!wavResult.base64) return;

      try {
        // Query local Whisper GPU daemon on port 8178 via Tauri backend
        const transcribed = await Bridge.voiceTranscribeAudio(wavResult.base64);
        if (transcribed && transcribed.trim()) {
          this.handleTranscript(transcribed.trim(), true);
        }
      } catch (err) {
        console.debug("[coucou voice] Whisper transcription fallback error:", err);
      }
    };
  }

  private initRecognition() {
    const SpeechCtor =
      (window as unknown as { SpeechRecognition?: IWindowSpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: IWindowSpeechRecognition }).webkitSpeechRecognition;

    if (!SpeechCtor) {
      console.info("[coucou voice] Web Speech API not supported; using local AudioCore & Whisper daemon");
      return;
    }

    try {
      const rec = new SpeechCtor();
      rec.continuous = true;
      rec.interimResults = true; // Real-time streaming typing
      rec.lang = "id-ID, en-US";

      rec.onresult = (event: SpeechRecognitionEvent) => {
        let interimText = "";
        let finalText = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalText += res[0].transcript;
          } else {
            interimText += res[0].transcript;
          }
        }

        const spoken = (finalText || interimText).trim();
        if (spoken) {
          // Barge-In interrupt
          if (State.isVoiceSpeaking) {
            VoiceSpeakerEngine.stop();
          }

          this.dispatchTranscript(spoken, Boolean(finalText));
          this.resetSilenceTimer(spoken);
        }

        if (finalText.trim()) {
          this.handleTranscript(finalText.trim(), true);
        }
      };

      rec.onerror = (e) => {
        console.debug("[coucou voice] recognition error:", e);
      };

      rec.onend = () => {
        if (this.isListening) {
          this.restartTimeout = window.setTimeout(() => {
            if (this.isListening && this.recognition) {
              try {
                this.recognition.start();
              } catch {
                // already running
              }
            }
          }, 300);
        }
      };

      this.recognition = rec;
    } catch (e) {
      console.warn("[coucou voice] failed to create SpeechRecognition:", e);
    }
  }

  private resetSilenceTimer(text: string) {
    this.currentSpokenText = text;
    if (this.silenceTimer != null) {
      window.clearTimeout(this.silenceTimer);
    }

    // Auto-send after 1.0 second of silence
    this.silenceTimer = window.setTimeout(() => {
      if (this.currentSpokenText.trim()) {
        const query = this.currentSpokenText.trim();
        this.currentSpokenText = "";
        this.handleTranscript(query, true);
      }
      this.silenceTimer = null;
    }, 1000);
  }

  private dispatchTranscript(text: string, isFinal: boolean) {
    for (const cb of this.transcriptCallbacks) {
      try {
        cb(text, isFinal);
      } catch (err) {
        console.error("[coucou voice] transcript callback error:", err);
      }
    }
  }

  private setAwaitingQuery(phrase: string) {
    this.clearAwaitingQuery();
    this.awaitingQuery = true;
    this.lastWakePhrase = phrase;
    this.awaitingQueryTimeout = window.setTimeout(() => {
      this.awaitingQuery = false;
      this.awaitingQueryTimeout = null;
    }, 8500);
  }

  private clearAwaitingQuery() {
    this.awaitingQuery = false;
    if (this.awaitingQueryTimeout != null) {
      window.clearTimeout(this.awaitingQueryTimeout);
      this.awaitingQueryTimeout = null;
    }
  }

  private dispatchWake(phrase: string, query: string) {
    for (const cb of this.wakeCallbacks) {
      try {
        cb(phrase, query);
      } catch (err) {
        console.error("[coucou voice] wake callback error:", err);
      }
    }
  }

  public async handleTranscript(raw: string, isFinalUtterance = false) {
    if (!raw) return;

    // First query local Rust wake detector for robust phonetic matching
    let wake = await Bridge.voiceDetectWakeWord(raw);

    // Flexible Phonetic Matching in JS (supporting Indonesian and English):
    // "hey coucou", "coucou", "kuku", "hai coucou", "mochi", "hey mochi", "hai mochi"
    if (!wake || !wake.detected) {
      const lower = raw.toLowerCase();
      const heyMochiMatch = lower.match(/\b(hey\s+mochi|hai\s+mochi|hi\s+mochi|halo\s+mochi|mochi)\b/i);
      const coucouMatch = lower.match(/\b(hey\s+coucou|hai\s+coucou|coucou|cou\s+cou|kuku|hey\s+kuku|hai\s+kuku)\b/i);

      if (heyMochiMatch) {
        wake = {
          detected: true,
          phrase: "hey_mochi",
          confidence: 0.95,
          timestampMs: Date.now(),
        };
      } else if (coucouMatch) {
        wake = {
          detected: true,
          phrase: "coucou",
          confidence: 0.95,
          timestampMs: Date.now(),
        };
      }
    }

    if (wake && wake.detected) {
      Sound.play("peek");
      this.lastWakePhrase = wake.phrase;

      // Extract trailing query if any (e.g., "Hey Mochi, buka notepad")
      let trailing = "";
      const regex = new RegExp(
        `\\b(hey\\s+coucou|hai\\s+coucou|cou\\s*cou|hey\\s+kuku|hai\\s+kuku|kuku|coucou|hey\\s+mochi|hai\\s+mochi|hi\\s+mochi|halo\\s+mochi|mochi)[\\s,:\\-.]*`,
        "i",
      );
      const match = raw.match(regex);
      if (match && match.index != null) {
        trailing = raw.slice(match.index + match[0].length).trim();
      }

      if (trailing) {
        this.clearAwaitingQuery();
        this.dispatchTranscript(trailing, true);
        this.dispatchWake(wake.phrase, trailing);
      } else {
        // Wake word triggered without trailing words — enter conversational listening state
        this.setAwaitingQuery(wake.phrase);
        this.dispatchWake(wake.phrase, "");
      }
      return;
    }

    // If awaiting conversational query after wake word, or listening mode is active
    if (this.awaitingQuery || (this.isListening && isFinalUtterance)) {
      this.clearAwaitingQuery();
      this.dispatchTranscript(raw, true);
      this.dispatchWake(this.lastWakePhrase, raw);
    } else if (this.isListening && !isFinalUtterance) {
      this.dispatchTranscript(raw, false);
    }
  }

  async startListening(): Promise<boolean> {
    if (this.isListening) return true;
    this.isListening = true;
    State.isVoiceListening = true;
    State.notify();

    void Bridge.voiceStartListening();

    // Start AudioCore with selected mic device & configured pre-amp boost
    AudioCore.setPreampBoost(State.settings.voicePreampBoost ?? 3.0);
    void AudioCore.start(State.settings.voiceMicrophoneDevice);

    if (this.recognition) {
      try {
        this.recognition.start();
      } catch {
        // already started
      }
    }

    return true;
  }

  async stopListening(): Promise<boolean> {
    this.isListening = false;
    State.isVoiceListening = false;
    State.notify();

    if (this.restartTimeout != null) {
      window.clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.silenceTimer != null) {
      window.clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    AudioCore.stop();
    void Bridge.voiceStopListening();

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // already stopped
      }
    }

    return true;
  }

  toggleListening(): Promise<boolean> {
    if (this.isListening) {
      return this.stopListening();
    } else {
      return this.startListening();
    }
  }
}

export const VoiceListenerEngine = VoiceListener.getInstance();
