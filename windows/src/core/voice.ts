import { Bridge } from "./bridge";
import { State } from "./state";
import { Sound } from "./sound";

function encodeWav(samples: Float32Array, sampleRate = 16000): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeStr(offset: number, s: string) {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  }

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");

  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Uint8Array(buffer);
}

function uint8ToBase64(uint8: Uint8Array): string {
  let binary = "";
  const len = uint8.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return btoa(binary);
}

export class VoiceEngine {
  private pcmChunks: Float32Array[] = [];
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private stream: MediaStream | null = null;
  private vadInterval: number | null = null;
  private silenceTimer: number | null = null;
  private speakingAudio: HTMLAudioElement | null = null;
  private onTranscriptionCallback: ((text: string) => void) | null = null;

  initWakeWord(onWake: () => void) {
    void Bridge.listenWakeWord(() => {
      if (!State.settings.voiceEnabled) return;
      void Bridge.log("voice wake word triggered, expanding island");
      Sound.play("greet");
      onWake();
      void this.startListening();
    });
  }

  setTranscriptionHandler(fn: (text: string) => void) {
    this.onTranscriptionCallback = fn;
  }

  async toggleListening() {
    if (State.isVoiceListening) {
      await this.stopListeningAndTranscribe();
    } else {
      await this.startListening();
    }
  }

  async startListening() {
    if (State.isVoiceListening) return;
    this.stopSpeaking();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.pcmChunks = [];

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.stream);

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      source.connect(this.analyser);

      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (e) => {
        if (!State.isVoiceListening) return;
        const input = e.inputBuffer.getChannelData(0);
        this.pcmChunks.push(new Float32Array(input));
      };
      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      State.isVoiceListening = true;
      State.notify();
      Sound.play("send");
      void Bridge.log("voice listening started");

      this.startVadMonitoring();
    } catch (err) {
      void Bridge.log(`voice microphone access failed: ${String(err)}`);
      State.isVoiceListening = false;
      State.notify();
    }
  }

  private startVadMonitoring() {
    if (!this.analyser) return;
    const buffer = new Uint8Array(this.analyser.frequencyBinCount);
    let hasSpoken = false;
    let speechFrameCount = 0;

    this.vadInterval = window.setInterval(() => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(buffer);

      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i];
      const avg = sum / buffer.length;

      if (avg > 15) {
        speechFrameCount++;
        if (speechFrameCount >= 3) hasSpoken = true;
        if (this.silenceTimer != null) {
          window.clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
      } else {
        speechFrameCount = Math.max(0, speechFrameCount - 1);
        if (hasSpoken && this.silenceTimer == null) {
          const timeoutMs = (State.settings.voiceSilenceTimeout || 1.5) * 1000;
          this.silenceTimer = window.setTimeout(() => {
            void this.stopListeningAndTranscribe();
          }, timeoutMs);
        }
      }
    }, 100);
  }

  async stopListeningAndTranscribe() {
    if (!State.isVoiceListening) return;

    if (this.vadInterval != null) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.silenceTimer != null) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    State.isVoiceListening = false;
    State.notify();
    void Bridge.log("voice listening stopped, transcribing...");

    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }

    const sampleRate = this.audioContext?.sampleRate || 16000;
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    const totalSamples = this.pcmChunks.reduce((acc, c) => acc + c.length, 0);
    if (totalSamples < sampleRate * 0.3) {
      void Bridge.log("voice audio too short, discarded");
      this.pcmChunks = [];
      return;
    }

    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of this.pcmChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    this.pcmChunks = [];

    let maxAmplitude = 0;
    for (let i = 0; i < merged.length; i++) {
      const abs = Math.abs(merged[i]);
      if (abs > maxAmplitude) maxAmplitude = abs;
    }
    void Bridge.log(
      `voice audio metrics: totalSamples=${totalSamples}, maxAmplitude=${maxAmplitude.toFixed(3)}`
    );

    const wavBytes = encodeWav(merged, sampleRate);
    const base64 = uint8ToBase64(wavBytes);

    try {
      State.isVoiceTranscribing = true;
      State.stateOverride = "thinking";
      State.notify();

      const text = await Bridge.sttTranscribe(
        base64,
        State.settings.voiceLanguage,
        State.settings.voiceSttProvider,
        State.settings.voiceWhisperUrl,
      );

      State.isVoiceTranscribing = false;
      State.stateOverride = null;
      State.notify();

      if (text && text.trim()) {
        void Bridge.log("voice transcription result: " + text);
        if (this.onTranscriptionCallback) {
          this.onTranscriptionCallback(text.trim());
        }
      } else {
        void Bridge.log("voice transcription result: ");
      }
    } catch (err) {
      void Bridge.log(`voice STT transcription failed: ${String(err)}`);
      State.isVoiceTranscribing = false;
      State.stateOverride = null;
      State.notify();
    }
  }

  async speakReply(text: string) {
    if (!State.settings.voiceEnabled || !text.trim()) return;
    this.stopSpeaking();

    const cleaned = text
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[*_#`]/g, "")
      .trim();

    if (!cleaned) return;

    try {
      State.isVoiceSpeaking = true;
      State.notify();
      void Bridge.log(`voice speaking reply: '${cleaned.slice(0, 40)}...'`);

      const bytes = await Bridge.ttsSpeak(
        cleaned,
        State.settings.voiceTtsVoice,
        State.settings.voiceLanguage,
      );

      if (!State.isVoiceSpeaking) return;

      const uint8 = new Uint8Array(bytes);
      const isWav =
        uint8.length >= 4 &&
        uint8[0] === 0x52 &&
        uint8[1] === 0x49 &&
        uint8[2] === 0x46 &&
        uint8[3] === 0x46;
      const mime = isWav ? "audio/wav" : "audio/mpeg";
      const blob = new Blob([uint8], { type: mime });
      const url = URL.createObjectURL(blob);

      this.speakingAudio = new Audio(url);
      this.speakingAudio.onended = () => {
        URL.revokeObjectURL(url);
        State.isVoiceSpeaking = false;
        State.notify();
      };
      this.speakingAudio.onerror = (e) => {
        URL.revokeObjectURL(url);
        void Bridge.log(`voice playback error: ${String(e)}`);
        State.isVoiceSpeaking = false;
        State.notify();
      };

      void Bridge.log("voice playback started");
      await this.speakingAudio.play();
    } catch (err) {
      void Bridge.log(`voice TTS playback failed: ${String(err)}`);
      State.isVoiceSpeaking = false;
      State.notify();
    }
  }

  stopSpeaking() {
    if (this.speakingAudio) {
      this.speakingAudio.pause();
      this.speakingAudio.currentTime = 0;
      this.speakingAudio = null;
    }
    void Bridge.ttsStop();
    if (State.isVoiceSpeaking) {
      State.isVoiceSpeaking = false;
      State.notify();
    }
  }
}

export const Voice = new VoiceEngine();
