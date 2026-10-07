// Audio Core & Real-time Speech Pipeline
// Handles Microphone Pre-amp Boost (1.0x - 10.0x), Browser AGC Bypassing,
// Universal Peak Normalization (0.85), Low-CPU RMS Energy Gate, and Live VU Meter.

export interface WavEncodeResult {
  wavBytes: Uint8Array;
  base64: string;
  durationSec: number;
}

/**
 * Normalizes PCM float32 samples to peak amplitude 0.85 and encodes to 16kHz mono 16-bit WAV.
 */
export function normalizeAndEncodeWav(
  samples: Float32Array,
  inputSampleRate: number = 16000,
  targetSampleRate: number = 16000,
): WavEncodeResult {
  if (samples.length === 0) {
    return { wavBytes: new Uint8Array(0), base64: "", durationSec: 0 };
  }

  // 1. Resample if necessary (linear interpolation to 16kHz)
  let pcm16k: Float32Array;
  if (inputSampleRate === targetSampleRate) {
    pcm16k = samples;
  } else {
    const ratio = inputSampleRate / targetSampleRate;
    const newLen = Math.round(samples.length / ratio);
    pcm16k = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const srcIdx = i * ratio;
      const idx0 = Math.floor(srcIdx);
      const idx1 = Math.min(samples.length - 1, idx0 + 1);
      const frac = srcIdx - idx0;
      pcm16k[i] = samples[idx0] * (1 - frac) + samples[idx1] * frac;
    }
  }

  // 2. Universal Peak Normalization to 0.85 peak amplitude
  let maxPeak = 0;
  for (let i = 0; i < pcm16k.length; i++) {
    const abs = Math.abs(pcm16k[i]);
    if (abs > maxPeak) maxPeak = abs;
  }

  // Scale so peak reaches 0.85, clamped so pure silence isn't overamplified
  const normFactor = maxPeak > 0.005 ? Math.min(8.0, 0.85 / maxPeak) : 1.0;

  // 3. Encode to 16-bit PCM RIFF WAV mono
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = targetSampleRate * blockAlign;
  const dataByteCount = pcm16k.length * bytesPerSample;
  const wavBufferSize = 44 + dataByteCount;

  const buffer = new ArrayBuffer(wavBufferSize);
  const view = new DataView(buffer);

  // RIFF header
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataByteCount, true);
  writeAscii(view, 8, "WAVE");

  // fmt subchunk
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, targetSampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // data subchunk
  writeAscii(view, 36, "data");
  view.setUint32(40, dataByteCount, true);

  let offset = 44;
  for (let i = 0; i < pcm16k.length; i++) {
    const s = Math.max(-1.0, Math.min(1.0, pcm16k[i] * normFactor));
    const sampleInt16 = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, Math.round(sampleInt16), true);
    offset += 2;
  }

  const wavBytes = new Uint8Array(buffer);

  // Encode to base64
  let binary = "";
  const len = wavBytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(wavBytes[i]);
  }
  const base64 = window.btoa(binary);
  const durationSec = pcm16k.length / targetSampleRate;

  return { wavBytes, base64, durationSec };
}

function writeAscii(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Requests temporary mic permission to unlock real hardware device labels in Chrome/Webview2.
 */
export async function unlockAndEnumerateMicrophones(): Promise<MediaDeviceInfo[]> {
  try {
    if (typeof navigator !== "undefined" && navigator.mediaDevices) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately stop all temporary tracks
      stream.getTracks().forEach((track) => track.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((d) => d.kind === "audioinput");
    }
  } catch (err) {
    console.warn("[coucou audio] permission unlock error:", err);
  }
  return [];
}

export class AudioCoreEngine {
  private static instance: AudioCoreEngine | null = null;

  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;

  private preampBoost = 3.0; // Default 3.0x pre-amp gain
  private isRunning = false;
  private isSpeechActive = false;

  private recordedChunks: Float32Array[] = [];
  private preRollChunks: Float32Array[] = [];
  private totalRecordedSamples = 0;

  private silenceCount = 0;
  private speechCount = 0;
  private speechActiveTicks = 0;
  private timerId: number | null = null;

  // Energy Gate thresholds (RMS)
  private readonly speechThreshold = 0.018; // Speech start threshold
  private readonly silenceThreshold = 0.012; // Silence threshold
  private readonly minSpeechFrames = 2;     // consecutive speech frames to trigger speech active
  private readonly maxSilenceFrames = 20;   // ~1.0s at 50ms intervals = auto-dispatch threshold

  // Callbacks
  public onVolumeLevel: ((level: number) => void) | null = null;
  public onSpeechStart: (() => void) | null = null;
  public onSpeechInterim: ((result: WavEncodeResult) => void) | null = null;
  public onSpeechEnd: ((result: WavEncodeResult) => void) | null = null;
  public onBargeIn: (() => void) | null = null;

  static getInstance(): AudioCoreEngine {
    if (!AudioCoreEngine.instance) {
      AudioCoreEngine.instance = new AudioCoreEngine();
    }
    return AudioCoreEngine.instance;
  }

  setPreampBoost(boost: number) {
    this.preampBoost = Math.max(1.0, Math.min(10.0, boost));
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setTargetAtTime(this.preampBoost, this.audioCtx.currentTime, 0.05);
    }
  }

  getPreampBoost(): number {
    return this.preampBoost;
  }

  async start(deviceId?: string): Promise<boolean> {
    if (this.isRunning) return true;

    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;

      this.audioCtx = new Ctor();
      if (this.audioCtx.state === "suspended") {
        await this.audioCtx.resume();
      }

      // Explicitly turn off browser AGC, echo cancellation, and noise suppression
      // to avoid mic audio clamping
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId && deviceId !== "default" ? { exact: deviceId } : undefined,
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
      };

      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // If specified device failed (e.g. unplugged), fallback to default audio input
        if (deviceId && deviceId !== "default") {
          console.warn("[coucou audio] specific device failed, falling back to default:", err);
          this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              autoGainControl: false,
              echoCancellation: false,
              noiseSuppression: false,
            },
          });
        } else {
          throw err;
        }
      }

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);

      // Pre-amp Boost GainNode
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.preampBoost;

      // Analyser for low-CPU RMS gate & visual VU meter
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.2;

      // Processor for PCM buffer recording
      this.processorNode = this.audioCtx.createScriptProcessor(2048, 1, 1);
      this.processorNode.onaudioprocess = (e) => {
        if (!this.isRunning) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const copy = new Float32Array(inputData.length);
        copy.set(inputData);

        if (this.isSpeechActive) {
          // Record speech buffer
          this.recordedChunks.push(copy);
          this.totalRecordedSamples += copy.length;
        } else {
          // Rolling pre-roll buffer (~250ms) to preserve onset consonants/vowels
          this.preRollChunks.push(copy);
          if (this.preRollChunks.length > 6) {
            this.preRollChunks.shift();
          }
        }
      };

      this.sourceNode.connect(this.gainNode);
      this.gainNode.connect(this.analyserNode);
      this.gainNode.connect(this.processorNode);
      // Connect processor to destination with 0 volume to keep Web Audio clock ticking without loopback
      const silentGain = this.audioCtx.createGain();
      silentGain.gain.value = 0;
      this.processorNode.connect(silentGain);
      silentGain.connect(this.audioCtx.destination);

      this.isRunning = true;
      this.startMeterLoop();
      return true;
    } catch (err) {
      console.warn("[coucou audio] failed to start audio core:", err);
      this.stop();
      return false;
    }
  }

  stop() {
    this.isRunning = false;
    this.isSpeechActive = false;

    if (this.timerId != null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch {}
      this.sourceNode = null;
    }
    if (this.gainNode) {
      try { this.gainNode.disconnect(); } catch {}
      this.gainNode = null;
    }
    if (this.analyserNode) {
      try { this.analyserNode.disconnect(); } catch {}
      this.analyserNode = null;
    }
    if (this.processorNode) {
      try { this.processorNode.disconnect(); } catch {}
      this.processorNode = null;
    }
    if (this.audioCtx) {
      try { void this.audioCtx.close(); } catch {}
      this.audioCtx = null;
    }

    this.recordedChunks = [];
    this.totalRecordedSamples = 0;
    this.onVolumeLevel?.(0);
  }

  private startMeterLoop() {
    if (!this.analyserNode) return;
    const data = new Float32Array(this.analyserNode.fftSize);

    // 50ms polling loop (~20Hz), ultra-low CPU overhead
    this.timerId = window.setInterval(() => {
      if (!this.isRunning || !this.analyserNode) return;

      this.analyserNode.getFloatTimeDomainData(data);

      // Compute RMS
      let sumSq = 0;
      for (let i = 0; i < data.length; i++) {
        sumSq += data[i] * data[i];
      }
      const rms = Math.sqrt(sumSq / data.length);

      // Scale RMS to 0.0 - 1.0 for visual VU meter bar
      const vuLevel = Math.min(1.0, rms * 4.5);
      this.onVolumeLevel?.(vuLevel);

      // Background Energy Gate & Barge-In Detection
      if (rms >= this.speechThreshold) {
        this.speechCount++;
        this.silenceCount = 0;

        // Barge-In interrupt: verified speech activity (>= minSpeechFrames) during TTS playback
        if (this.speechCount >= this.minSpeechFrames) {
          this.onBargeIn?.();
        }

        if (!this.isSpeechActive && this.speechCount >= this.minSpeechFrames) {
          this.isSpeechActive = true;
          this.speechActiveTicks = 0;
          this.recordedChunks = [];
          this.totalRecordedSamples = 0;

          // Consume pre-roll chunks so beginning of wake word is preserved
          for (const chunk of this.preRollChunks) {
            this.recordedChunks.push(chunk);
            this.totalRecordedSamples += chunk.length;
          }
          this.preRollChunks = [];

          this.onSpeechStart?.();
        }

        if (this.isSpeechActive) {
          this.speechActiveTicks++;
          // Periodic interim transcription (~every 600ms) for real-time auto-typing
          if (this.speechActiveTicks % 12 === 0 && this.totalRecordedSamples >= 8000) {
            this.emitInterimUtterance();
          }
        }
      } else if (rms <= this.silenceThreshold) {
        this.speechCount = 0;
        if (this.isSpeechActive) {
          this.silenceCount++;
          // Auto-Dispatch after 1.0s of silence (20 frames * 50ms = 1000ms)
          if (this.silenceCount >= this.maxSilenceFrames) {
            this.finalizeSpeechUtterance();
          }
        }
      }
    }, 50);
  }

  private emitInterimUtterance() {
    if (this.totalRecordedSamples < 4000) return;
    const fullPcm = new Float32Array(this.totalRecordedSamples);
    let offset = 0;
    for (const chunk of this.recordedChunks) {
      fullPcm.set(chunk, offset);
      offset += chunk.length;
    }
    const sampleRate = this.audioCtx?.sampleRate || 16000;
    const interimWav = normalizeAndEncodeWav(fullPcm, sampleRate, 16000);
    if (interimWav.durationSec >= 0.25) {
      this.onSpeechInterim?.(interimWav);
    }
  }

  private finalizeSpeechUtterance() {
    this.isSpeechActive = false;
    this.speechActiveTicks = 0;
    this.silenceCount = 0;
    this.speechCount = 0;

    if (this.totalRecordedSamples < 1600) {
      // Audio chunk too short (<0.1s), discard noise spike
      this.recordedChunks = [];
      this.totalRecordedSamples = 0;
      return;
    }

    // Combine recorded chunks into single Float32Array
    const fullPcm = new Float32Array(this.totalRecordedSamples);
    let offset = 0;
    for (const chunk of this.recordedChunks) {
      fullPcm.set(chunk, offset);
      offset += chunk.length;
    }

    this.recordedChunks = [];
    this.totalRecordedSamples = 0;

    const sampleRate = this.audioCtx?.sampleRate || 16000;
    const wavResult = normalizeAndEncodeWav(fullPcm, sampleRate, 16000);

    if (wavResult.durationSec >= 0.25) {
      this.onSpeechEnd?.(wavResult);
    }
  }
}

export const AudioCore = AudioCoreEngine.getInstance();
