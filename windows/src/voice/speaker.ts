// Local Neural TTS Voice Speaker & Viseme Audio Driver
// Plays synthesized speech locally and coordinates live viseme mouth shapes with MochiEngine.

import { Bridge, type TtsResult } from "../core/bridge";
import { State } from "../core/state";
import type { MochiEngine } from "../mochi/engine";

export class VoiceSpeaker {
  private static instance: VoiceSpeaker | null = null;
  private audioCtx: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private animFrameId: number | null = null;
  private isSpeaking = false;
  private engine: MochiEngine | null = null;

  static getInstance(): VoiceSpeaker {
    if (!VoiceSpeaker.instance) {
      VoiceSpeaker.instance = new VoiceSpeaker();
    }
    return VoiceSpeaker.instance;
  }

  setEngine(engine: MochiEngine | null) {
    this.engine = engine;
  }

  private initAudio(): AudioContext | null {
    if (!this.audioCtx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        this.audioCtx = new Ctor();
      }
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      void this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Synthesize text via local Windows SAPI / OneCore speech engine and play with synchronized visemes.
   */
  async speak(text: string, engine?: MochiEngine): Promise<boolean> {
    if (engine) this.engine = engine;
    const clean = text.trim();
    if (!clean) return false;

    // Stop any ongoing speech
    this.stop();

    const voice = State.settings.voiceTtsVoice === "default" ? undefined : State.settings.voiceTtsVoice;
    const rate = State.settings.voiceTtsRate || 1.0;
    const pitch = State.settings.voiceTtsPitch || 1.1;

    try {
      const result: TtsResult | null = await Bridge.voiceSpeakText(clean, voice, rate, pitch);
      if (!result || !result.audioBase64) {
        return false;
      }

      await this.playWithVisemes(result);
      return true;
    } catch (err) {
      console.warn("[coucou voice] speak failed:", err);
      return false;
    }
  }

  private async playWithVisemes(result: TtsResult): Promise<void> {
    const ctx = this.initAudio();
    if (!ctx) return;

    // Decode base64 WAV into ArrayBuffer
    const binaryStr = window.atob(result.audioBase64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const audioBuffer = await ctx.decodeAudioData(bytes.buffer);

    this.stop();

    this.isSpeaking = true;
    State.isVoiceSpeaking = true;
    State.notify();

    if (this.engine) {
      this.engine.setSpeaking(true);
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;

    source.connect(analyser);
    analyser.connect(ctx.destination);

    this.currentSource = source;

    const startTime = ctx.currentTime;
    const cues = result.visemes || [];
    const pcmData = new Uint8Array(analyser.frequencyBinCount);

    const updateFrame = () => {
      if (!this.isSpeaking || !this.engine) return;

      const elapsedMs = (ctx.currentTime - startTime) * 1000;
      analyser.getByteFrequencyData(pcmData);

      // Compute volume/energy
      let sum = 0;
      for (let i = 0; i < pcmData.length; i++) {
        sum += pcmData[i];
      }
      const avgVol = sum / (pcmData.length * 255); // 0.0 to 1.0

      // Find active viseme cue
      let activeShape = "neutral";
      let activeAmp = 0;

      for (let i = cues.length - 1; i >= 0; i--) {
        if (elapsedMs >= cues[i].timeOffsetMs) {
          activeShape = cues[i].shape;
          activeAmp = cues[i].amplitude;
          break;
        }
      }

      // Combine planned cue amplitude with real-time audio volume
      const jawDrop = Math.min(1.0, Math.max(activeAmp * 0.7, avgVol * 2.2));
      const smileAmount = activeShape === "smile" ? 0.9 : 0.2;
      const validShape = (["neutral", "smile", "open", "o", "wide"].includes(activeShape)
        ? activeShape
        : "neutral") as "neutral" | "smile" | "open" | "o" | "wide";

      this.engine.setViseme(jawDrop, validShape, smileAmount);

      this.animFrameId = requestAnimationFrame(updateFrame);
    };

    this.animFrameId = requestAnimationFrame(updateFrame);

    source.onended = () => {
      this.finishSpeaking();
    };

    source.start(0);
  }

  stop() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {
        // already stopped
      }
      this.currentSource = null;
    }
    this.finishSpeaking();
  }

  private finishSpeaking() {
    if (this.animFrameId != null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.isSpeaking = false;
    State.isVoiceSpeaking = false;
    if (this.engine) {
      this.engine.setSpeaking(false);
      this.engine.setViseme(0, "neutral", 0);
    }
    State.notify();
  }
}

export const VoiceSpeakerEngine = VoiceSpeaker.getInstance();
