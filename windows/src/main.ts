// Entry point: boot the bridge, wire the island, start the greeting.

import "./style.css";
import { Bridge, IS_TAURI, onEvent } from "./core/bridge";
import { Sound } from "./core/sound";
import { State, type Settings } from "./core/state";
import { Island } from "./island/island";
import { registerHookHandlers } from "./island/hooks";
import { registerIntegrationHandlers, refreshConfigured } from "./island/integrations";
import { VoiceListenerEngine } from "./voice/listener";
import { AudioCore } from "./voice/audio_core";

async function main() {
  const root = document.getElementById("root");
  if (!root) return;

  void Sound.preload();

  const island = new Island(root);

  const boot = await Bridge.boot();
  if (boot) {
    State.settings = { ...State.settings, ...boot.settings };
  }
  island.applySettings();
  State.loadIntegrationTasks();
  if (boot && !boot.cursorPoll) island.followPageCursor();

  await onEvent<{ x: number; y: number }>("cursor", ({ x, y }) => island.onCursor(x, y));

  /** Pause has to reach Rust too, or the pollers keep calling out. */
  const setPaused = (on: boolean) => {
    if (State.paused === on) return;
    State.paused = on;
    void Bridge.setPaused(on);
  };

  await onEvent<string>("tray", (what) => {
    switch (what) {
      case "settings":
        setPaused(false);
        island.alert("settings");
        break;
      case "open":
        setPaused(false);
        island.alert(State.defaultView());
        break;
      case "pause":
        setPaused(!State.paused);
        if (State.paused) island.fsm.forceHidden();
        else island.reveal();
        break;
    }
  });

  await onEvent<null>("screen-changed", () => void Bridge.reposition());

  // The settings window writes preferences; apply them here without a restart.
  await onEvent<Settings>("settings-changed", (s) => {
    const prevWake = State.settings.voiceWakeWordEnabled;
    const prevDevice = State.settings.voiceMicrophoneDevice;
    const prevBoost = State.settings.voicePreampBoost;
    State.settings = { ...State.settings, ...s };
    island.applySettings();
    State.loadIntegrationTasks();
    void refreshConfigured();

    if (State.settings.voiceWakeWordEnabled && !prevWake) {
      void VoiceListenerEngine.startListening();
    } else if (!State.settings.voiceWakeWordEnabled && prevWake) {
      void VoiceListenerEngine.stopListening();
    } else if (State.settings.voiceWakeWordEnabled) {
      if (s.voiceMicrophoneDevice !== prevDevice || s.voicePreampBoost !== prevBoost) {
        AudioCore.setPreampBoost(s.voicePreampBoost ?? 3.0);
        AudioCore.stop();
        void AudioCore.start(s.voiceMicrophoneDevice);
      }
    }
  });

  await onEvent<string>("global-shortcut", (action) => {
    if (!State.settings.globalShortcutsEnabled) return;
    switch (action) {
      case "openChat":
        island.reveal();
        island.setView("prompt");
        break;
      case "goToAlert":
        if (State.pendingApproval) {
          island.alert("approval");
        }
        break;
      case "nextPill": {
        const tasks = State.tasks;
        if (tasks.length > 0) {
          const idx = tasks.findIndex((t) => t.id === State.focusId);
          const next = tasks[(idx + 1) % tasks.length];
          State.setFocus(next.id);
        }
        break;
      }
      case "prevPill": {
        const tasks = State.tasks;
        if (tasks.length > 0) {
          const idx = tasks.findIndex((t) => t.id === State.focusId);
          const prev = tasks[(idx - 1 + tasks.length) % tasks.length];
          State.setFocus(prev.id);
        }
        break;
      }
      case "muteToggle":
        island.actions.toggleSound();
        break;
      case "desktopToggle":
        void Bridge.desktopMochiToggle();
        break;
      case "wardrobeToggle":
        island.reveal();
        island.setView(State.view === "wardrobe" ? "overview" : "wardrobe");
        break;
    }
  });

  registerHookHandlers(island);
  registerIntegrationHandlers(island);

  island.launch();

  if (State.settings.voiceWakeWordEnabled) {
    void VoiceListenerEngine.startListening();
  }

  // In a plain browser there is no wake strip behind the cursor: make the whole
  // page wake the island so the visuals can be checked with `npm run dev`.
  if (!IS_TAURI) {
    document.addEventListener("click", () => Sound.resume(), { once: true });
  }
}

void main();
