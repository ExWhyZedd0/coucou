// Chat view — multi-provider AI chat with window context capture and file attachments.

import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { Bridge, type ChatContext } from "../core/bridge";
import { Sound } from "../core/sound";
import { State, type ChatMessage } from "../core/state";
import { VoiceSpeakerEngine } from "../voice/speaker";
import { VoiceListenerEngine } from "../voice/listener";
import type { ViewHost } from "./views";

let nextId = 1;

function bubble(message: ChatMessage): HTMLElement {
  if (message.role === "user") {
    return h(
      "div",
      { class: "chat-row user" },
      h("div", { class: "bubble", text: message.content }),
    );
  }
  return h("div", { class: "chat-row" }, h("div", { class: "reply", text: message.content }));
}

function typingDots(): HTMLElement {
  return h(
    "div",
    { class: "chat-row" },
    h("div", { class: "typing" }, h("i"), h("i"), h("i")),
  );
}

/** The coloured chip showing what the question is about (a dropped file or window). */
function contextChip(label: string, onRemove: () => void): HTMLElement {
  const removeBtn = h("button", {
    class: "chip-remove",
    title: "Remove attachment",
    onclick: (e: Event) => {
      e.stopPropagation();
      onRemove();
    },
  }, svg(ICONS.xmark, 8));

  const chip = h(
    "div",
    { class: "chip" },
    h("i", { class: "chip-dot" }),
    h("span", { class: "chip-label", text: label }),
    removeBtn,
  );
  requestAnimationFrame(() => chip.classList.add("settled"));
  return chip;
}

export function buildPrompt(onHeightChange: () => void): ViewHost {
  const chipRow = h("div", { class: "chip-row" });
  const log = h("div", { class: "chat-log" });

  const providerSelect = h("select", { class: "chat-provider-select", title: "Select AI Provider" }) as HTMLSelectElement;
  const providers = [
    { id: "anthropic", label: "Claude" },
    { id: "gemini", label: "Gemini" },
    { id: "openai", label: "OpenAI" },
    { id: "ollama", label: "Ollama" },
    { id: "lmstudio", label: "LM Studio" },
  ];
  for (const p of providers) {
    providerSelect.append(h("option", { value: p.id, text: p.label }));
  }
  providerSelect.value = State.settings.chatProvider || "anthropic";
  providerSelect.addEventListener("change", () => {
    State.settings.chatProvider = providerSelect.value;
    void Bridge.saveSettings(State.settings);
    Sound.play("blip");
    State.notify();
  });

  const attachWindowBtn = h(
    "button",
    {
      class: "chat-attach-btn",
      title: "Attach active window",
      onclick: async () => {
        Sound.play("blip");
        try {
          const win = await Bridge.captureActiveWindow();
          if (win && win.title) {
            State.promptContext = { kind: "window", appName: win.appName, title: win.title, url: win.url };
            State.notify();
            input.focus();
          }
        } catch {
          // ignore window capture errors
        }
      },
    },
    svg(ICONS.stack, 11),
  );

  const voiceBtn = h(
    "button",
    {
      class: "chat-voice-btn",
      title: "Voice Awake / Talk to Mochi",
      onclick: async () => {
        Sound.play("blip");
        await VoiceListenerEngine.toggleListening();
        State.notify();
      },
    },
    svg(ICONS.mic, 11),
  );

  const input = h("input", {
    type: "text",
    class: "chat-input",
    placeholder: "Ask me anything…",
    spellcheck: "false",
  }) as HTMLInputElement;

  const send = h("button", { class: "send-btn", title: "Send" }, svg(ICONS.arrowUp, 11));
  const bar = h("div", { class: "chat-bar" }, providerSelect, attachWindowBtn, voiceBtn, input, send);

  const el = h(
    "div",
    { class: "view" },
    h("div", { class: "card wash chat-card" }, h("div", { class: "chat-body" }, chipRow, log, bar)),
  );
  (el.querySelector(".card") as HTMLElement).style.setProperty("--wash", "rgba(99,102,241,0.5)");

  let sending = false;
  let renderedCount = -1;

  async function submit() {
    const query = input.value.trim();
    if (!query || sending) return;
    input.value = "";
    sending = true;
    Sound.play("send");

    // Local App Launcher: check if command is to open an app (e.g. "Buka VS Code", "Buka Notepad", "Open Spotify")
    const isAppLaunch =
      /^(buka|open|jalankan|start|launch|tolong\s+buka(kan)?|bisa\s+buka|bisakah\s+kamu\s+buka|please\s+open|can\s+you\s+open|(hey\s+|hai\s+)?(mochi|coucou)[\s,]+(buka|open))\s+/i.test(
        query,
      );
    if (isAppLaunch) {
      try {
        const launched = await Bridge.launchApp(query);
        if (launched) {
          State.chatHistory.push({ id: nextId++, role: "user", content: query });
          State.chatHistory.push({ id: nextId++, role: "assistant", content: `✓ ${launched}` });
          Sound.play("finish");
          if (State.settings.voiceTtsEnabled) {
            void VoiceSpeakerEngine.speak(launched);
          }
          sending = false;
          State.notify();
          onHeightChange();
          input.focus();
          return;
        }
      } catch (err) {
        console.debug("[coucou] app launch fallback to LLM:", err);
      }
    }

    State.chatHistory.push({ id: nextId++, role: "user", content: query });
    State.stateOverride = "thinking";
    State.notify();
    onHeightChange();

    const provider = State.settings.chatProvider || "anthropic";
    const model =
      provider === "gemini"
        ? State.settings.geminiModel
        : provider === "openai"
          ? State.settings.openaiModel
          : provider === "ollama"
            ? State.settings.ollamaModel
            : provider === "lmstudio"
              ? State.settings.lmstudioModel
              : State.settings.model;

    let context: ChatContext | null = null;
    if (State.chatHistory.length === 1) {
      if (State.promptContext) {
        if (State.promptContext.kind === "window") {
          context = State.promptContext;
        } else {
          context = { kind: "file", name: State.promptContext.name, path: State.promptContext.path ?? "" };
        }
      } else if (State.droppedFile) {
        context = { kind: "file", name: State.droppedFile.name, path: State.droppedFile.path };
      }
    }

    try {
      const reply = await Bridge.aiChatSend(provider, model, query, context);
      State.chatHistory.push({ id: nextId++, role: "assistant", content: reply.text });
      State.stateOverride = null;
      Sound.play("finish");
      if (State.settings.voiceTtsEnabled) {
        void VoiceSpeakerEngine.speak(reply.text);
      }
    } catch (err) {
      State.stateOverride = null;
      State.noteMessage = String(err).replace(/^Error:\s*/, "");
      State.view = "note";
      Sound.play("error");
    } finally {
      sending = false;
      State.notify();
      onHeightChange();
      input.focus();
    }
  }

  VoiceListenerEngine.onWake((_phrase, trailing) => {
    if (trailing) {
      if (!sending) {
        input.value = trailing;
        void submit();
      }
    } else {
      input.focus();
    }
  });

  VoiceListenerEngine.onTranscript((text, isFinal) => {
    input.value = text;
    if (isFinal && text.trim() && !sending) {
      void submit();
    }
  });

  send.addEventListener("click", () => void submit());
  input.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") {
      e.preventDefault();
      void submit();
    }
    e.stopPropagation(); // Escape closes the island, not the chat
  });

  return {
    el,
    sync() {
      providerSelect.value = State.settings.chatProvider || "anthropic";
      voiceBtn.classList.toggle("listening", State.isVoiceListening);

      const file = State.droppedFile;
      const ctx = State.promptContext;
      const chipLabel =
        ctx
          ? ctx.kind === "window"
            ? `${ctx.appName}: ${ctx.title}`
            : ctx.name
          : file?.name ?? "";

      if (chipRow.dataset.label !== chipLabel) {
        chipRow.dataset.label = chipLabel;
        clear(chipRow);
        if (chipLabel) {
          chipRow.append(
            contextChip(chipLabel, () => {
              State.promptContext = null;
              State.droppedFile = null;
              State.notify();
            }),
          );
        }
      }

      const thinking = State.stateOverride === "thinking";
      const count = State.chatHistory.length + (thinking ? 0.5 : 0);
      if (count !== renderedCount) {
        renderedCount = count;
        clear(log);
        for (const m of State.chatHistory) log.append(bubble(m));
        if (thinking) log.append(typingDots());
        log.scrollTop = log.scrollHeight;
      }

      input.placeholder = State.chatHistory.length === 0 ? "Ask me anything…" : "Continue…";
      input.disabled = sending;
    },
    focus() {
      input.focus();
      input.select();
    },
  };
}
