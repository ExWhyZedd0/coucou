// Thin wrapper over the Tauri commands/events. Every call is a no-op when the
// page is opened in a plain browser, so the island can be iterated on with
// `npm run dev` alone.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { Settings } from "./state";

export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!IS_TAURI) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.error(`[coucou] ${cmd} failed`, err);
    return null;
  }
}

export interface BootInfo {
  settings: Settings;
  /** Logical screen rect of the monitor the island lives on. */
  screen: { x: number; y: number; width: number; height: number; scale: number };
  version: string;
  hookPath: string;
  /** False where the OS has no global cursor (Wayland): see Island.followPageCursor. */
  cursorPoll: boolean;
}

export const Bridge = {
  boot: () => call<BootInfo>("boot"),

  saveSettings: (settings: Settings) => call<void>("save_settings", { settings }),

  /** Shrink the window down to the invisible wake strip (hidden) or back to full. */
  setCollapsed: (collapsed: boolean) => call<void>("set_collapsed", { collapsed }),

  /**
   * Pushes the island shape in window coordinates. Rust flips click-through from
   * its own cursor poll, so the flag is never a frame behind a click.
   */
  setIslandRect: (x: number, y: number, width: number, height: number) =>
    call<void>("set_island_rect", { x, y, width, height }),

  /** Give the window keyboard focus (chat field) and take it away again. */
  focusWindow: (focused: boolean) => call<void>("focus_window", { focused }),

  reposition: () => call<void>("reposition"),

  openUrl: (url: string) => call<void>("open_url", { url }),

  /** "Open terminal" → opens the folder in VS Code when `code` is on PATH. */
  openInVSCode: (path: string | null) => call<boolean>("open_in_vscode", { path }),

  /** Launches desktop applications via Windows App Paths / Registry / PATH */
  launchApp: (query: string) => call<string>("launch_app", { query }),

  quit: () => call<void>("quit_app"),

  openSettingsWindow: () => call<void>("open_settings_window"),

  /** Writes to %LOCALAPPDATA%\Coucou\coucou.log, next to the Rust lines. */
  log: (message: string) => call<void>("log_line", { message }),

  // ── Claude Code & expanded hooks ─────────────────────────────────────────
  hooksStatus: () => call<HookStatus>("hooks_status"),
  hooksStatusFor: (agent: string) => call<HookStatus>("hooks_status_for", { agent }),
  /** Diff to show before anything is written. `install: false` previews removal. */
  hooksPreview: (install: boolean) => callOrThrow<HookPreview>("hooks_preview", { install }),
  hooksPreviewFor: (agent: string, install: boolean) =>
    callOrThrow<HookPreview>("hooks_preview_for", { agent, install }),
  /**
   * Writes settings.json — only ever after an explicit click, and only
   * when the file still matches the preview the user looked at.
   */
  hooksApply: (install: boolean, fingerprint: string) =>
    callOrThrow<string>("hooks_apply", { install, fingerprint }),
  hooksApplyFor: (agent: string, install: boolean, fingerprint: string) =>
    callOrThrow<string>("hooks_apply_for", { agent, install, fingerprint }),

  approvalDecision: (requestId: string, decision: "allow" | "deny") =>
    call<void>("approval_decision", { requestId, decision }),
  /** "The card is up" — until this lands the relay only waits a moment. */
  approvalAck: (requestId: string) => call<void>("approval_ack", { requestId }),
  /** "Nobody can act on this" — Claude Code asks in the terminal right away. */
  approvalDecline: (requestId: string) => call<void>("approval_decline", { requestId }),

  // ── Chat, files, secrets ──────────────────────────────────────────────────
  /** One chat turn. The API key and any file bytes never leave Rust. */
  chatSend: (query: string, context: ChatContext | null) =>
    callOrThrow<{ text: string }>("chat_send", { query, context }),
  aiChatSend: (provider: string, model: string, query: string, context: ChatContext | null) =>
    callOrThrow<{ text: string }>("ai_chat_send", { provider, model, query, context }),
  aiListModels: (provider: string) =>
    callOrThrow<string[]>("ai_list_models", { provider }),
  aiCheckLocalServer: (provider: string) =>
    call<boolean>("ai_check_local_server", { provider }),
  chatReset: () => call<void>("chat_reset"),
  /** Copies a dropped file into the inbox. */
  ingestFile: (path: string) => callOrThrow<DroppedFile>("ingest_file", { path }),
  /** Only ever tells you whether a key exists — never its value. */
  secretPresent: (key: string) => call<boolean>("secret_present", { key }),
  secretSet: (key: string, value: string) => callOrThrow<void>("secret_set", { key, value }),
  secretClear: (key: string) => callOrThrow<void>("secret_clear", { key }),

  // ── Desktop Mochi ─────────────────────────────────────────────────────────
  desktopMochiToggle: () => call<boolean>("desktop_mochi_toggle"),
  desktopMochiShow: () => call<boolean>("desktop_mochi_show"),
  desktopMochiHide: () => call<boolean>("desktop_mochi_hide"),
  desktopMochiSetPosition: (x: number, y: number) =>
    call<void>("desktop_mochi_set_position", { x, y }),
  desktopMochiGetPosition: () =>
    call<[number, number] | null>("desktop_mochi_get_position"),

  // ── Media & System ────────────────────────────────────────────────────────
  mediaGetState: () => call<MediaInfo | null>("media_get_state"),
  mediaPlayPause: () => call<boolean>("media_play_pause"),
  mediaNext: () => call<boolean>("media_next"),
  mediaPrevious: () => call<boolean>("media_previous"),
  captureActiveWindow: () => call<WindowContext | null>("capture_active_window"),

  // ── Integrations ──────────────────────────────────────────────────────────
  refreshIntegration: (id: string) => call<void>("refresh_integration", { id }),
  /** Opens the configured n8n instance in the browser. */
  openN8n: () => call<void>("open_n8n"),

  /** Tray → Pause. Stops the integration pollers, not just the island. */
  setPaused: (paused: boolean) => call<void>("set_paused", { paused }),

  // ── Mobile Sync Bridge ────────────────────────────────────────────────────
  syncGetStatus: () => call<SyncStatus>("sync_get_status"),
  syncGetPairingData: () => callOrThrow<PairingData>("sync_get_pairing_data"),
  syncRegenerateSecret: () => callOrThrow<PairingData>("sync_regenerate_secret"),
  syncToggle: (enabled: boolean) => call<SyncStatus>("sync_toggle", { enabled }),
  syncSendTestEvent: () => call<void>("sync_send_test_event"),

  // ── Voice Awake & Local TTS ───────────────────────────────────────────────
  voiceStartListening: () => call<VoiceStatus>("voice_start_listening"),
  voiceStopListening: () => call<VoiceStatus>("voice_stop_listening"),
  voiceSpeakText: (text: string, voiceName?: string, rate?: number, pitch?: number) =>
    call<TtsResult>("voice_speak_text", { text, voiceName, rate, pitch }),
  voiceGetStatus: () => call<VoiceStatus>("voice_get_status"),
  voiceListVoices: () => call<VoiceInfo[]>("voice_list_voices"),
  voiceDetectWakeWord: (text: string) =>
    call<WakeMatch | null>("voice_detect_wake_word", { text }),
  voiceTranscribeAudio: (audioBase64: string) =>
    call<string>("voice_transcribe_audio", { audioBase64 }),
};

export interface MediaInfo {
  title: string;
  artist: string;
  album: string;
  playing: boolean;
}

export interface WindowContext {
  appName: string;
  title: string;
  url?: string;
}

export interface IntegrationUpdate {
  id: string;
  data: Record<string, unknown>;
  error: string | null;
  event: { success: boolean; label: string; detail: string | null } | null;
}

export type ChatContext =
  | { kind: "file"; name: string; path: string }
  | { kind: "window"; appName: string; title: string; url?: string };

export interface DroppedFile {
  name: string;
  path: string;
  size: number;
}

export interface HookStatus {
  installed: boolean;
  settingsPath: string;
  hookPath: string;
  hookReady: boolean;
}

export interface HookPreview {
  diff: string;
  backup: string;
  settingsPath: string;
  /** Hand back to hooksApply so only the reviewed diff is ever written. */
  fingerprint: string;
}

export interface PairingData {
  version: number;
  ip: string;
  port: number;
  secret: string;
  deviceId: string;
  deviceName: string;
  pairingUrl: string;
  qrSvg: string;
}

export interface ConnectedDevice {
  id: string;
  name: string;
  remoteAddr: string;
  connectedAt: number;
}

export interface SyncStatus {
  enabled: boolean;
  running: boolean;
  ip: string;
  port: number;
  secret: string;
  connectedDevices: ConnectedDevice[];
}

/** Same as `call`, but surfaces the error so the UI can show what went wrong. */
async function callOrThrow<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!IS_TAURI) throw new Error("not running inside Coucou");
  return invoke<T>(cmd, args);
}

export type BridgeEvent =
  | { name: "cursor"; payload: { x: number; y: number } }
  | { name: "tray"; payload: string }
  | { name: "hook"; payload: Record<string, unknown> }
  | { name: "screen-changed"; payload: null };

export interface DragDropPayload {
  type: "enter" | "over" | "drop" | "leave";
  paths?: string[];
}

/** Files dragged onto the island. Only reaches us when the window takes the mouse. */
export async function onDragDrop(handler: (e: DragDropPayload) => void) {
  if (!IS_TAURI) return () => {};
  return getCurrentWebview().onDragDropEvent((event) => {
    handler(event.payload as DragDropPayload);
  });
}

export async function onEvent<T>(name: string, handler: (payload: T) => void) {
  if (!IS_TAURI) return () => {};
  return listen<T>(name, (e) => handler(e.payload));
}

export interface VoiceStatus {
  isListening: boolean;
  isSpeaking: boolean;
  wakeWordEnabled: boolean;
  wakePhrase: string;
  currentVoice: string;
}

export interface VoiceInfo {
  id: string;
  name: string;
  culture: string;
  gender: string;
  isDefault: boolean;
}

export interface VisemeCue {
  timeOffsetMs: number;
  shape: string;
  amplitude: number;
}

export interface TtsResult {
  audioBase64: string;
  durationMs: number;
  visemes: VisemeCue[];
  voiceUsed: string;
}

export interface WakeMatch {
  detected: boolean;
  phrase: string;
  confidence: number;
  timestampMs: number;
}

