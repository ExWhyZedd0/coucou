// Settings window — comprehensive preferences, hooks, multi-provider AI keys, and wardrobe.

import "./settings.css";
import { Bridge, onEvent, type HookStatus } from "../core/bridge";
import { DEFAULT_SETTINGS, type Settings } from "../core/state";
import { OUTFIT_CATALOG, type Outfit } from "../mochi/outfits";
import { h, clear, svg } from "../views/dom";
import { ICONS } from "../views/icons";
import { AudioCore, unlockAndEnumerateMicrophones } from "../voice/audio_core";

let settings: Settings = { ...DEFAULT_SETTINGS };
let version = "";

const root = document.getElementById("settings-root")!;

async function save() {
  await Bridge.saveSettings(settings);
}

// ── Reusable components ───────────────────────────────────────────────────────

function toggle(on: boolean, onChange: (v: boolean) => void): HTMLElement {
  const el = h("button", { class: on ? "switch on" : "switch", "aria-pressed": on });
  el.addEventListener("click", () => {
    const next = !el.classList.contains("on");
    el.classList.toggle("on", next);
    onChange(next);
  });
  return el;
}

function statusDot(ok: boolean): HTMLElement {
  return h("i", { class: "dot", style: `background:${ok ? "#22c55e" : "#f4505e"}` });
}

function renderDiff(text: string): HTMLElement {
  const box = h("div", { class: "diff" });
  for (const line of text.split("\n")) {
    const cls = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "ctx";
    box.append(h("div", { class: cls, text: line }));
  }
  return box;
}

// ── Multi-Agent Hooks Section ─────────────────────────────────────────────────

interface AgentHookDef {
  id: string;
  name: string;
  desc: string;
}

const AGENTS: AgentHookDef[] = [
  { id: "claude", name: "Claude Code", desc: "Hooks into Claude Code CLI for approvals and notifications." },
  { id: "gemini", name: "Gemini CLI", desc: "Hooks into Google Gemini CLI settings." },
  { id: "antigravity", name: "Antigravity (agy)", desc: "Hooks into Antigravity agent CLI." },
  { id: "codex", name: "Codex", desc: "Hooks into Codex CLI hooks configuration." },
];

function agentCard(agent: AgentHookDef, initialStatus?: HookStatus): HTMLElement {
  const status: HookStatus = initialStatus ?? {
    installed: false,
    settingsPath: "",
    hookPath: "",
    hookReady: false,
  };

  const body = h("div", { style: "display:flex;flex-direction:column;gap:10px" });
  const headDot = statusDot(status.installed);
  const card = h(
    "div",
    { class: "agent-card", style: "border:1px solid var(--hairline);border-radius:10px;padding:12px 14px;background:rgba(255,255,255,0.02)" },
    h("div", { class: "row", style: "justify-content:space-between;margin-bottom:6px" },
      h("strong", { style: "display:flex;align-items:center;gap:6px" }, headDot, h("span", { text: agent.name })),
      h("span", { class: "hint", text: status.installed ? "Active" : "Not hooked" }),
    ),
    body,
  );

  const rebuild = async () => {
    const fresh = await Bridge.hooksStatusFor(agent.id);
    if (fresh) Object.assign(status, fresh);
    headDot.style.background = status.installed ? "#22c55e" : "#f4505e";
    clear(body);
    draw();
  };

  function draw() {
    body.append(
      h("div", { class: "hint", text: agent.desc }),
      h("div", { class: "row" },
        h("label", { style: "min-width:100px", text: "Config file" }),
        h("span", { class: "path", text: status.settingsPath || "Default location" }),
      ),
    );

    const actions = h("div", { class: "row", style: "margin-top:4px" });
    const install = h("button", {
      class: "primary",
      text: status.installed ? "Reinstall hooks…" : "Install hooks…",
      onclick: () => showPreview(true),
    });
    actions.append(install);

    if (status.installed) {
      actions.append(h("button", {
        class: "danger",
        text: "Uninstall hooks…",
        onclick: () => showPreview(false),
      }));
    }
    body.append(actions);
  }

  async function showPreview(install: boolean) {
    let preview;
    try {
      preview = await Bridge.hooksPreviewFor(agent.id, install);
    } catch (err) {
      clear(body);
      body.append(h("div", { class: "notice err", text: `Could not prepare hooks: ${String(err)}` }));
      window.setTimeout(() => void rebuild(), 3000);
      return;
    }

    clear(body);
    body.append(
      h("div", {
        class: "hint",
        text: install
          ? `Here is the diff Coucou will write to ${agent.name}'s config. Verify the changes:`
          : `Coucou will remove its hooks from ${agent.name}'s config:`,
      }),
      renderDiff(preview.diff),
    );

    const confirm = h("button", {
      class: install ? "primary" : "danger",
      text: install ? "Confirm and write" : "Confirm uninstall",
    });
    confirm.addEventListener("click", async () => {
      confirm.disabled = true;
      try {
        const backup = await Bridge.hooksApplyFor(agent.id, install, preview.fingerprint);
        clear(body);
        body.append(h("div", {
          class: "notice ok",
          text: `Done. Backup saved as ${backup}.`,
        }));
        window.setTimeout(() => void rebuild(), 2500);
      } catch (err) {
        confirm.disabled = false;
        body.append(h("div", { class: "notice err", text: `Could not write: ${String(err)}` }));
      }
    });

    body.append(
      h("div", { class: "row" },
        confirm,
        h("button", { text: "Cancel", onclick: () => { clear(body); draw(); } }),
      ),
    );
  }

  void rebuild();
  return card;
}

function agentsSection(): HTMLElement {
  const container = h("div", { style: "display:flex;flex-direction:column;gap:12px" });
  for (const a of AGENTS) {
    container.append(agentCard(a));
  }
  return h(
    "section",
    {},
    h("h2", {}, h("span", { class: "section-icon" }, svg(ICONS.robot, 15)), h("span", { text: "Multi-Agent Hooks & CLIs" })),
    h("div", { class: "hint", text: "Integrate Coucou into your AI coding agent CLIs to intercept tool calls, diffs, and approvals." }),
    container,
  );
}

// ── Multi-Provider AI section ─────────────────────────────────────────────────

function secretRow(
  secretKey: string,
  label: string,
  placeholder: string,
  initialPresent: boolean,
): HTMLElement {
  const dot = statusDot(initialPresent);
  const field = h("input", {
    type: "password",
    placeholder: initialPresent ? "•••••••••••• (stored)" : placeholder,
    style: "flex:1 1 auto;min-width:0",
    autocomplete: "off",
    spellcheck: "false",
  }) as HTMLInputElement;

  const saveBtn = h("button", { class: "primary", text: "Save" });
  const clearBtn = h("button", { class: "danger", text: "Remove", style: initialPresent ? "" : "display:none" });
  const feedback = h("div", {});

  async function refresh() {
    const ok = (await Bridge.secretPresent(secretKey)) ?? false;
    dot.style.background = ok ? "#22c55e" : "#f4505e";
    field.placeholder = ok ? "•••••••••••• (stored)" : placeholder;
    clearBtn.style.display = ok ? "" : "none";
  }

  saveBtn.addEventListener("click", async () => {
    const val = field.value.trim();
    if (!val) return;
    clear(feedback);
    try {
      await Bridge.secretSet(secretKey, val);
      field.value = "";
      feedback.append(h("div", { class: "notice ok", text: "Key saved to Windows Credential Manager." }));
      await refresh();
    } catch (err) {
      feedback.append(h("div", { class: "notice err", text: `Could not save: ${String(err)}` }));
    }
  });

  clearBtn.addEventListener("click", async () => {
    clear(feedback);
    try {
      await Bridge.secretClear(secretKey);
      feedback.append(h("div", { class: "notice ok", text: "Key removed." }));
      await refresh();
    } catch (err) {
      feedback.append(h("div", { class: "notice err", text: `Could not remove: ${String(err)}` }));
    }
  });

  return h(
    "div",
    { style: "display:flex;flex-direction:column;gap:6px" },
    h("div", { class: "row" }, dot, h("label", { style: "min-width:110px", text: label }), field, saveBtn, clearBtn),
    feedback,
  );
}

function aiProvidersSection(keysPresent: Record<string, boolean>): HTMLElement {
  // Provider selector
  const providerSelect = h("select", {}) as HTMLSelectElement;
  const providers = [
    { id: "anthropic", label: "Anthropic Claude" },
    { id: "gemini", label: "Google Gemini" },
    { id: "openai", label: "OpenAI" },
    { id: "ollama", label: "Ollama (Local)" },
    { id: "lmstudio", label: "LM Studio (Local)" },
  ];
  for (const p of providers) providerSelect.append(h("option", { value: p.id, text: p.label }));
  providerSelect.value = settings.chatProvider || "anthropic";

  // Quick Toggle: Claude (Cloud) vs Local LLM
  const isLocal = settings.chatProvider === "ollama" || settings.chatProvider === "lmstudio";
  const modeDot = statusDot(isLocal);
  const modeHint = h("span", {
    class: "hint",
    text: isLocal ? "Local LLM active (Zero Cloud, 100% Private)" : "Claude Cloud active (Anthropic)",
  });
  const localToggle = toggle(isLocal, (active) => {
    if (active) {
      settings.chatProvider = settings.chatProvider === "lmstudio" ? "lmstudio" : "ollama";
    } else {
      settings.chatProvider = "anthropic";
    }
    providerSelect.value = settings.chatProvider;
    modeDot.style.background = active ? "var(--green)" : "#8AB4F8";
    modeHint.textContent = active
      ? "Local LLM active (Zero Cloud, 100% Private)"
      : "Claude Cloud active (Anthropic)";
    void save();
  });

  providerSelect.addEventListener("change", () => {
    settings.chatProvider = providerSelect.value;
    const nowLocal = settings.chatProvider === "ollama" || settings.chatProvider === "lmstudio";
    localToggle.classList.toggle("on", nowLocal);
    modeDot.style.background = nowLocal ? "var(--green)" : "#8AB4F8";
    modeHint.textContent = nowLocal
      ? "Local LLM active (Zero Cloud, 100% Private)"
      : "Claude Cloud active (Anthropic)";
    void save();
  });

  // Claude models
  const claudeModels = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-3-5-sonnet-20241022"];
  const claudeSelect = h("select", {}) as HTMLSelectElement;
  for (const m of claudeModels) claudeSelect.append(h("option", { value: m, text: m }));
  claudeSelect.value = settings.model || "claude-opus-5";
  claudeSelect.addEventListener("change", () => { settings.model = claudeSelect.value; void save(); });

  // Gemini models
  const geminiModels = ["gemini-2.0-flash", "gemini-2.0-pro-exp-02-05", "gemini-1.5-pro", "gemini-1.5-flash"];
  const geminiSelect = h("select", {}) as HTMLSelectElement;
  for (const m of geminiModels) geminiSelect.append(h("option", { value: m, text: m }));
  geminiSelect.value = settings.geminiModel || "gemini-2.0-flash";
  geminiSelect.addEventListener("change", () => { settings.geminiModel = geminiSelect.value; void save(); });

  // OpenAI models
  const openaiModels = ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini"];
  const openaiSelect = h("select", {}) as HTMLSelectElement;
  for (const m of openaiModels) openaiSelect.append(h("option", { value: m, text: m }));
  openaiSelect.value = settings.openaiModel || "gpt-4o";
  openaiSelect.addEventListener("change", () => { settings.openaiModel = openaiSelect.value; void save(); });

  // Ollama inputs & dynamic model dropdown
  const ollamaUrl = h("input", {
    type: "text",
    value: settings.ollamaUrl || "http://localhost:11434",
    style: "flex:1 1 auto;min-width:180px",
  }) as HTMLInputElement;
  ollamaUrl.addEventListener("change", () => { settings.ollamaUrl = ollamaUrl.value; void save(); });

  const ollamaModelSelect = h("select", { style: "flex:1 1 auto;min-width:140px" }) as HTMLSelectElement;
  const curOllama = settings.ollamaModel || "llama3.2";
  ollamaModelSelect.append(h("option", { value: curOllama, text: curOllama }));
  ollamaModelSelect.value = curOllama;
  ollamaModelSelect.addEventListener("change", () => {
    settings.ollamaModel = ollamaModelSelect.value;
    void save();
  });

  const ollamaStatus = h("span", { class: "hint" });
  const ollamaTestBtn = h("button", { text: "Test", class: "btn" });
  ollamaTestBtn.addEventListener("click", async () => {
    ollamaStatus.textContent = "Checking…";
    settings.ollamaUrl = ollamaUrl.value;
    await save();
    const ok = await Bridge.aiCheckLocalServer("ollama");
    ollamaStatus.textContent = ok ? "✓ Connected" : "✗ Not reachable";
    ollamaStatus.style.color = ok ? "var(--green)" : "var(--red)";
  });

  const ollamaFetchBtn = h("button", { text: "Fetch Models", class: "btn" });
  ollamaFetchBtn.addEventListener("click", async () => {
    ollamaFetchBtn.textContent = "Fetching…";
    ollamaStatus.textContent = "Querying Ollama tags…";
    ollamaStatus.style.color = "var(--dim)";
    try {
      settings.ollamaUrl = ollamaUrl.value;
      await save();
      const models = await Bridge.aiListModels("ollama");
      if (models && models.length > 0) {
        clear(ollamaModelSelect);
        for (const m of models) {
          ollamaModelSelect.append(h("option", { value: m, text: m }));
        }
        if (models.includes(settings.ollamaModel)) {
          ollamaModelSelect.value = settings.ollamaModel;
        } else {
          settings.ollamaModel = models[0];
          ollamaModelSelect.value = models[0];
          await save();
        }
        ollamaStatus.textContent = `✓ ${models.length} model(s) available`;
        ollamaStatus.style.color = "var(--green)";
      } else {
        ollamaStatus.textContent = "No models found in Ollama";
        ollamaStatus.style.color = "var(--red)";
      }
    } catch {
      ollamaStatus.textContent = "Server unreachable";
      ollamaStatus.style.color = "var(--red)";
    } finally {
      ollamaFetchBtn.textContent = "Fetch Models";
    }
  });

  // LM Studio inputs & dynamic model dropdown
  const lmUrl = h("input", {
    type: "text",
    value: settings.lmstudioUrl || "http://localhost:1234",
    style: "flex:1 1 auto;min-width:180px",
  }) as HTMLInputElement;
  lmUrl.addEventListener("change", () => { settings.lmstudioUrl = lmUrl.value; void save(); });

  const lmModelSelect = h("select", { style: "flex:1 1 auto;min-width:140px" }) as HTMLSelectElement;
  const curLm = settings.lmstudioModel || "local-model";
  lmModelSelect.append(h("option", { value: curLm, text: curLm }));
  lmModelSelect.value = curLm;
  lmModelSelect.addEventListener("change", () => {
    settings.lmstudioModel = lmModelSelect.value;
    void save();
  });

  const lmStatus = h("span", { class: "hint" });
  const lmTestBtn = h("button", { text: "Test", class: "btn" });
  lmTestBtn.addEventListener("click", async () => {
    lmStatus.textContent = "Checking…";
    settings.lmstudioUrl = lmUrl.value;
    await save();
    const ok = await Bridge.aiCheckLocalServer("lmstudio");
    lmStatus.textContent = ok ? "✓ Connected" : "✗ Not reachable";
    lmStatus.style.color = ok ? "var(--green)" : "var(--red)";
  });

  const lmFetchBtn = h("button", { text: "Fetch Models", class: "btn" });
  lmFetchBtn.addEventListener("click", async () => {
    lmFetchBtn.textContent = "Fetching…";
    lmStatus.textContent = "Querying LM Studio /v1/models…";
    lmStatus.style.color = "var(--dim)";
    try {
      settings.lmstudioUrl = lmUrl.value;
      await save();
      const models = await Bridge.aiListModels("lmstudio");
      if (models && models.length > 0) {
        clear(lmModelSelect);
        for (const m of models) {
          lmModelSelect.append(h("option", { value: m, text: m }));
        }
        if (models.includes(settings.lmstudioModel)) {
          lmModelSelect.value = settings.lmstudioModel;
        } else {
          settings.lmstudioModel = models[0];
          lmModelSelect.value = models[0];
          await save();
        }
        lmStatus.textContent = `✓ ${models.length} model(s) loaded`;
        lmStatus.style.color = "var(--green)";
      } else {
        lmStatus.textContent = "No models currently loaded in LM Studio";
        lmStatus.style.color = "var(--red)";
      }
    } catch {
      lmStatus.textContent = "Server unreachable";
      lmStatus.style.color = "var(--red)";
    } finally {
      lmFetchBtn.textContent = "Fetch Models";
    }
  });

  return h(
    "section",
    {},
    h("h2", {}, h("span", { class: "section-icon" }, svg(ICONS.sparkles, 15)), h("span", { text: "AI Chat Providers & Models" })),
    h("div", { class: "row", style: "justify-content:space-between;padding-bottom:6px" },
      h("strong", { style: "display:flex;align-items:center;gap:6px" },
        modeDot,
        h("span", { text: "Claude (Cloud) vs Local LLM" }),
      ),
      h("div", { class: "row", style: "gap:10px" },
        modeHint,
        localToggle,
      ),
    ),
    h("div", { class: "row" }, h("label", { text: "Default provider" }), providerSelect),
    h("hr", { style: "border:none;border-top:1px solid var(--hairline);margin:4px 0" }),
    secretRow("anthropic-api-key", "Anthropic Claude", "sk-ant-...", keysPresent["anthropic-api-key"] ?? false),
    h("div", { class: "row" }, h("label", { style: "min-width:110px", text: "Claude model" }), claudeSelect),
    h("hr", { style: "border:none;border-top:1px solid var(--hairline);margin:4px 0" }),
    secretRow("gemini-api-key", "Google Gemini", "AIzaSy...", keysPresent["gemini-api-key"] ?? false),
    h("div", { class: "row" }, h("label", { style: "min-width:110px", text: "Gemini model" }), geminiSelect),
    h("hr", { style: "border:none;border-top:1px solid var(--hairline);margin:4px 0" }),
    secretRow("openai-api-key", "OpenAI", "sk-...", keysPresent["openai-api-key"] ?? false),
    h("div", { class: "row" }, h("label", { style: "min-width:110px", text: "OpenAI model" }), openaiSelect),
    h("hr", { style: "border:none;border-top:1px solid var(--hairline);margin:4px 0" }),
    h("div", { class: "row" },
      h("label", { style: "min-width:110px", text: "Ollama URL" }),
      ollamaUrl,
      ollamaTestBtn,
      ollamaStatus,
    ),
    h("div", { class: "row" },
      h("label", { style: "min-width:110px", text: "Ollama model" }),
      ollamaModelSelect,
      ollamaFetchBtn,
    ),
    h("hr", { style: "border:none;border-top:1px solid var(--hairline);margin:4px 0" }),
    h("div", { class: "row" },
      h("label", { style: "min-width:110px", text: "LM Studio URL" }),
      lmUrl,
      lmTestBtn,
      lmStatus,
    ),
    h("div", { class: "row" },
      h("label", { style: "min-width:110px", text: "LM Studio model" }),
      lmModelSelect,
      lmFetchBtn,
    ),
  );
}

// ── Integrations section ──────────────────────────────────────────────────────

interface IntegrationDef {
  id: string;
  name: string;
  color: string;
  fields: { key: string; label: string; placeholder: string; secret: boolean }[];
}

const INTEGRATIONS: IntegrationDef[] = [
  { id: "agent_cursor", name: "Cursor IDE", color: "#38BDF8", fields: [] },
  { id: "agent_codex", name: "Codex CLI", color: "#2DD4BF", fields: [] },
  { id: "agent_antigravity", name: "Antigravity Agent", color: "#9333EA", fields: [] },
  { id: "agent_gemini", name: "Gemini CLI", color: "#8AB4F8", fields: [] },
  { id: "integration_music", name: "Now Playing (Media)", color: "#EC4899", fields: [] },
  { id: "integration_stripe", name: "Stripe", color: "#0570DE",
    fields: [{ key: "stripe-api-key", label: "Secret key", placeholder: "sk_live_…", secret: true }] },
  { id: "integration_github", name: "GitHub", color: "#F4505E",
    fields: [{ key: "github-token", label: "Token", placeholder: "ghp_…", secret: true }] },
  { id: "integration_vercel", name: "Vercel", color: "#7C5CFF",
    fields: [{ key: "vercel-token", label: "Token", placeholder: "…", secret: true }] },
  { id: "integration_n8n", name: "n8n", color: "#F29B38",
    fields: [
      { key: "n8n-url", label: "Instance URL", placeholder: "https://n8n.example.com", secret: false },
      { key: "n8n-api-key", label: "API key", placeholder: "…", secret: true },
    ] },
  { id: "integration_resend", name: "Resend", color: "#22C55E",
    fields: [{ key: "resend-api-key", label: "API key", placeholder: "re_…", secret: true }] },
  { id: "integration_notion", name: "Notion", color: "#8C8C8C",
    fields: [{ key: "notion-api-key", label: "Integration token", placeholder: "ntn_…", secret: true }] },
  { id: "integration_calcom", name: "Cal.com", color: "#C9956A",
    fields: [{ key: "calcom-api-key", label: "API key", placeholder: "cal_…", secret: true }] },
];

const MAX_ACTIVE = 4;

function integrationsSection(present: Record<string, boolean>): HTMLElement {
  const note = h("div", { class: "hint" });
  const list = h("div", { style: "display:flex;flex-direction:column;gap:14px" });

  // Main Pinned Pill selector
  const mainPillSelect = h("select", { style: "min-width:180px" }) as HTMLSelectElement;
  const mainPillOptions = [
    { id: "integration_claude", label: "VS Code (Claude Code)" },
    { id: "agent_cursor", label: "Cursor IDE" },
    { id: "agent_codex", label: "Codex CLI" },
    { id: "agent_antigravity", label: "Antigravity Agent" },
    { id: "agent_gemini", label: "Gemini CLI" },
  ];
  for (const opt of mainPillOptions) {
    mainPillSelect.append(h("option", { value: opt.id, text: opt.label }));
  }
  mainPillSelect.value = settings.mainPill || "integration_claude";
  mainPillSelect.addEventListener("change", () => {
    settings.mainPill = mainPillSelect.value;
    void save();
    updateNote();
  });

  const mainPillRow = h(
    "div",
    { class: "row", style: "justify-content:space-between;padding-bottom:12px;border-bottom:1px solid var(--hairline)" },
    h("strong", { style: "display:flex;align-items:center;gap:6px" },
      statusDot(true),
      h("span", { text: "Primary Pinned Pill (Next to Mochi)" }),
    ),
    h("div", { class: "row", style: "gap:10px" },
      mainPillSelect,
      h("span", { class: "hint", text: "Always visible" }),
    ),
  );

  function updateNote() {
    const used = settings.activeIntegrations.length;
    note.textContent = `Pick up to ${MAX_ACTIVE} secondary pills to show alongside the main pill — ${used}/${MAX_ACTIVE} in use. Keys are stored in the Windows Credential Manager, never on disk.`;
  }

  for (const def of INTEGRATIONS) {
    const active = settings.activeIntegrations.includes(def.id);
    const sw = h("button", { class: active ? "switch on" : "switch" });
    sw.addEventListener("click", () => {
      const idx = settings.activeIntegrations.indexOf(def.id);
      if (idx >= 0) {
        settings.activeIntegrations.splice(idx, 1);
        sw.classList.remove("on");
      } else {
        if (settings.activeIntegrations.length >= MAX_ACTIVE) return;
        settings.activeIntegrations.push(def.id);
        sw.classList.add("on");
      }
      updateNote();
      void save();
    });

    const rows = h("div", { style: "display:flex;flex-direction:column;gap:8px;padding-left:36px" });
    for (const f of def.fields) {
      const isSet = present[f.key] ?? false;
      const inp = h("input", {
        type: f.secret ? "password" : "text",
        placeholder: isSet ? "•••••••••••• (stored)" : f.placeholder,
        style: "flex:1 1 auto",
      }) as HTMLInputElement;

      const saveKeyBtn = h("button", { class: "primary", text: "Save" });
      saveKeyBtn.addEventListener("click", async () => {
        const val = inp.value.trim();
        if (!val) return;
        await Bridge.secretSet(f.key, val);
        inp.value = "";
        present[f.key] = true;
        inp.placeholder = "•••••••••••• (stored)";
      });

      rows.append(h("div", { class: "row" }, statusDot(isSet), h("label", { text: f.label }), inp, saveKeyBtn));
    }

    const item = h(
      "div",
      { style: "display:flex;flex-direction:column;gap:6px" },
      h("div", { class: "row" },
        sw,
        h("i", { class: "dot", style: `background:${def.color}` }),
        h("span", { style: "font-size:12.5px", text: def.name }),
      ),
    );
    if (def.fields.length > 0) {
      item.append(rows);
    }
    list.append(item);
  }

  updateNote();
  return h(
    "section",
    {},
    h("h2", {}, h("span", { class: "section-icon" }, svg(ICONS.puzzle, 15)), h("span", { text: "Integrations & Agent Pills" })),
    mainPillRow,
    note,
    list,
  );
}

// ── General section ───────────────────────────────────────────────────────────

function generalSection(): HTMLElement {
  const volume = h("input", {
    type: "range", min: "0", max: "0.2", step: "0.005",
    value: String(settings.soundVolume),
  }) as HTMLInputElement;
  volume.addEventListener("input", () => {
    settings.soundVolume = Number(volume.value);
    void save();
  });

  const autoClose = h("input", {
    type: "number", min: "5", max: "120", step: "1",
    value: String(Math.round(settings.autoCloseInterval)),
    style: "width:72px",
  }) as HTMLInputElement;
  autoClose.addEventListener("change", () => {
    settings.autoCloseInterval = Math.max(5, Math.min(120, Number(autoClose.value) || 15));
    autoClose.value = String(settings.autoCloseInterval);
    void save();
  });

  const screen = h("select", {}) as HTMLSelectElement;
  screen.append(
    h("option", { value: "primary", text: "Main display" }),
    h("option", { value: "cursor", text: "Display under the cursor" }),
  );
  screen.value = settings.screen;
  screen.addEventListener("change", () => {
    settings.screen = screen.value as Settings["screen"];
    void save();
  });

  // Wardrobe outfit selection
  const outfitSelect = h("select", {}) as HTMLSelectElement;
  for (const o of OUTFIT_CATALOG) {
    outfitSelect.append(h("option", { value: o.id, text: `${o.emoji} ${o.label}` }));
  }
  outfitSelect.value = (settings.mochiOutfit as Outfit) || "auto";
  outfitSelect.addEventListener("change", () => {
    settings.mochiOutfit = outfitSelect.value;
    void save();
  });

  return h(
    "section",
    {},
    h("h2", {}, h("span", { class: "section-icon" }, svg(ICONS.sliders, 15, { stroke: 2 })), h("span", { text: "General & Appearance" })),
    h("div", { class: "row" },
      h("label", { text: "Sound" }),
      toggle(settings.soundEnabled, (v) => { settings.soundEnabled = v; void save(); }),
      volume,
    ),
    h("div", { class: "row" },
      h("label", { text: "Auto-close" }),
      autoClose,
      h("span", { class: "hint", text: "seconds after you leave the island" }),
    ),
    h("div", { class: "row" },
      h("label", { text: "Island lives on" }),
      screen,
    ),
    h("div", { class: "row" },
      h("label", { text: "Launch at startup" }),
      toggle(settings.autostart, (v) => { settings.autostart = v; void save(); }),
    ),
    h("div", { class: "row" },
      h("label", { text: "Mochi on desktop" }),
      toggle(settings.mochiOnDesktop, (v) => {
        settings.mochiOnDesktop = v;
        if (v) void Bridge.desktopMochiShow();
        else void Bridge.desktopMochiHide();
        void save();
      }),
      h("span", { class: "hint", text: "Floating desktop companion" }),
    ),
    h("div", { class: "row" },
      h("label", { text: "Global shortcuts" }),
      toggle(settings.globalShortcutsEnabled, (v) => {
        settings.globalShortcutsEnabled = v;
        void save();
      }),
      h("span", { class: "hint", text: "Ctrl+Alt+Space, Ctrl+Alt+A, etc." }),
    ),
    h("div", { class: "row" },
      h("label", { text: "Mochi's outfit" }),
      outfitSelect,
    ),
  );
}

// ── Mobile Sync & Android Companion Section ──────────────────────────────────

function mobileSyncSection(): HTMLElement {
  const note = h("p", {
    class: "hint",
    style: "margin-bottom:12px",
    text: "Stream sessions, approvals, and questions to Coucou on your Android phone with zero configuration over LAN. Encrypted with AES-256-GCM.",
  });

  const card = h("div", {
    class: "agent-card",
    style: "border:1px solid var(--hairline);border-radius:10px;padding:14px;background:rgba(255,255,255,0.02);display:flex;flex-direction:column;gap:12px",
  });

  const section = h("section", {},
    h("h2", {}, h("span", { class: "section-icon" }, svg(ICONS.mobile, 15)), h("span", { text: "Mobile Companion Sync (Android & iOS)" })),
    note,
    card,
  );

  async function update() {
    clear(card);
    const status = await Bridge.syncGetStatus();
    const isRunning = status?.running ?? false;

    const headDot = statusDot(isRunning);
    const topRow = h("div", { class: "row", style: "justify-content:space-between" },
      h("strong", { style: "display:flex;align-items:center;gap:6px" },
        headDot,
        h("span", { text: "LAN WebSocket Bridge & mDNS" }),
      ),
      toggle(isRunning, async (v) => {
        await Bridge.syncToggle(v);
        await update();
      }),
    );
    card.append(topRow);

    if (!isRunning) {
      card.append(h("div", { class: "hint", text: "Sync server is currently disabled. Toggle on to pair your mobile phone." }));
      return;
    }

    const pairing = await Bridge.syncGetPairingData().catch(() => null);

    const devices = status?.connectedDevices ?? [];
    const deviceList = h("div", { style: "font-size:12px;margin-top:6px;display:flex;flex-direction:column;gap:4px" });
    if (devices.length === 0) {
      deviceList.append(h("span", { class: "hint", text: "No mobile device connected yet. Scan QR code with the Coucou Android app." }));
    } else {
      for (const d of devices) {
        deviceList.append(h("div", { class: "row", style: "gap:6px" },
          statusDot(true),
          h("strong", { text: d.name }),
          h("span", { class: "hint", text: `(${d.remoteAddr})` }),
        ));
      }
    }

    const qrContainer = h("div", {
      style: "display:flex;align-items:center;justify-content:center;background:#16181D;border-radius:12px;padding:8px;width:196px;height:196px;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08)",
    });
    if (pairing?.qrSvg) {
      qrContainer.innerHTML = pairing.qrSvg;
    }

    const qrCol = h("div", { style: "display:flex;flex-direction:column;align-items:center;gap:8px" },
      qrContainer,
      h("span", { class: "hint", style: "font-size:11px", text: "Scan with Coucou Android" }),
    );

    const infoCol = h("div", { style: "display:flex;flex-direction:column;gap:8px;flex:1" },
      h("div", { class: "row" },
        h("label", { style: "min-width:70px", text: "LAN IP" }),
        h("span", { class: "path", text: `${status?.ip}:${status?.port}` }),
      ),
      h("div", { class: "row" },
        h("label", { style: "min-width:70px", text: "Discovery" }),
        h("span", { class: "hint", text: "_coucou._tcp.local (mDNS active)" }),
      ),
      h("div", { class: "row" },
        h("label", { style: "min-width:70px", text: "Secret" }),
        h("span", { class: "path", style: "font-size:10.5px;max-width:180px;overflow:hidden;text-overflow:ellipsis", text: status?.secret ?? "••••" }),
      ),
      h("div", { class: "row", style: "margin-top:6px;gap:8px" },
        h("button", {
          class: "secondary",
          text: "Regenerate Key",
          onclick: async () => {
            await Bridge.syncRegenerateSecret().catch(() => {});
            await update();
          },
        }),
        h("button", {
          class: "secondary",
          text: "Send Test Ping",
          onclick: async () => {
            await Bridge.syncSendTestEvent().catch(() => {});
          },
        }),
      ),
      deviceList,
    );

    const mainRow = h("div", { style: "display:flex;gap:18px;align-items:flex-start;margin-top:6px" },
      qrCol,
      infoCol,
    );

    card.append(mainRow);
  }

  void update();
  void onEvent("sync-devices-changed", () => { void update(); });
  return section;
}

// ── Voice Awake & Neural TTS Section ────────────────────────────────────────

function voiceSettingsSection(): HTMLElement {
  const note = h("p", {
    class: "hint",
    style: "margin-bottom:12px",
    text: "Zero-cloud local voice interaction, persistent Whisper GPU transcription, and neural speech synthesis (<50ms latency). Drives real-time mouth visemes on Mochi.",
  });

  const card = h("div", {
    class: "agent-card",
    style: "border:1px solid var(--hairline);border-radius:10px;padding:14px;background:rgba(255,255,255,0.02);display:flex;flex-direction:column;gap:12px",
  });

  const section = h("section", {},
    h("h2", {}, h("span", { class: "section-icon" }, svg(ICONS.mic, 15)), h("span", { text: "Voice Awake, Audio Core & Neural TTS" })),
    note,
    card,
  );

  async function render() {
    clear(card);

    // 1. Wake word enable toggle
    const wakeRow = h("div", { class: "row", style: "justify-content:space-between" },
      h("strong", { style: "display:flex;align-items:center;gap:6px" },
        statusDot(settings.voiceWakeWordEnabled),
        h("span", { text: "Voice Awake Detection" }),
      ),
      toggle(settings.voiceWakeWordEnabled, (v) => {
        settings.voiceWakeWordEnabled = v;
        void save();
        void render();
      }),
    );

    // 2. Wake phrase selector (English & Indonesian)
    const phraseSelect = h("select", {}) as HTMLSelectElement;
    const phrases = [
      { id: "both", label: "Both ('Hey Mochi' / 'Hai Mochi' & 'Coucou' / 'Kuku')" },
      { id: "hey_mochi", label: "'Hey Mochi' / 'Hai Mochi'" },
      { id: "coucou", label: "'Coucou' / 'Kuku'" },
    ];
    for (const p of phrases) {
      phraseSelect.append(h("option", { value: p.id, text: p.label }));
    }
    phraseSelect.value = settings.voiceWakePhrase || "both";
    phraseSelect.addEventListener("change", () => {
      settings.voiceWakePhrase = phraseSelect.value;
      void save();
    });

    const phraseRow = h("div", { class: "row" },
      h("label", { style: "min-width:120px", text: "Wake phrase" }),
      phraseSelect,
    );

    // 2b. Microphone device selector & Grant Permission Button
    const micSelect = h("select", { style: "flex:1 1 auto;min-width:180px" }) as HTMLSelectElement;
    micSelect.append(h("option", { value: "default", text: "Default System Microphone" }));

    const refreshMics = async (grant = false) => {
      let mics: MediaDeviceInfo[] = [];
      if (grant) {
        mics = await unlockAndEnumerateMicrophones();
      } else if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
        const devs = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        mics = devs.filter((d) => d.kind === "audioinput");
      }

      if (mics.length > 0) {
        clear(micSelect);
        micSelect.append(h("option", { value: "default", text: "Default System Microphone" }));
        for (const mic of mics) {
          const label = mic.label || `Microphone (${mic.deviceId.slice(0, 8)})`;
          micSelect.append(h("option", { value: mic.deviceId, text: label }));
        }
        micSelect.value = settings.voiceMicrophoneDevice || "default";
      }
    };

    void refreshMics(false);

    micSelect.addEventListener("change", () => {
      settings.voiceMicrophoneDevice = micSelect.value;
      void save();
      AudioCore.stop();
      void AudioCore.start(settings.voiceMicrophoneDevice);
    });

    const grantMicBtn = h("button", {
      class: "secondary",
      text: "Grant Permission / Refresh",
      title: "Requests browser mic permission to unlock real hardware device names (Realtek, USB, etc.)",
      onclick: async () => {
        grantMicBtn.textContent = "Detecting…";
        await refreshMics(true);
        AudioCore.stop();
        await AudioCore.start(settings.voiceMicrophoneDevice);
        grantMicBtn.textContent = "Refreshed ✓";
        setTimeout(() => { grantMicBtn.textContent = "Grant Permission / Refresh"; }, 2500);
      },
    });

    const micRow = h("div", { class: "row" },
      h("label", { style: "min-width:120px", text: "Microphone device" }),
      micSelect,
      grantMicBtn,
    );

    // 2c. Pre-amp Boost Slider (1.0x to 10.0x) with browser AGC bypassed
    const preampVal = h("span", { class: "hint", text: `${(settings.voicePreampBoost || 3.0).toFixed(1)}x` });
    const preampInput = h("input", {
      type: "range",
      min: "1.0",
      max: "10.0",
      step: "0.5",
      value: String(settings.voicePreampBoost || 3.0),
      oninput: () => {
        const val = parseFloat(preampInput.value);
        settings.voicePreampBoost = val;
        preampVal.textContent = `${val.toFixed(1)}x`;
        AudioCore.setPreampBoost(val);
        void save();
      },
    }) as HTMLInputElement;

    const preampRow = h("div", { class: "row" },
      h("label", { style: "min-width:120px", text: "Pre-amp boost" }),
      preampInput,
      preampVal,
      h("span", { class: "hint", text: "(Digital gain up to 10.0x, AGC disabled)" }),
    );

    // 2d. Real-time Animated VU Meter Bar
    const vuBar = h("div", { class: "vu-meter-bar" });
    const vuBadge = h("span", { class: "vu-meter-badge", text: "0%" });
    const vuContainer = h("div", { class: "vu-meter-container" },
      h("span", { style: "font-size:11.5px;color:var(--dim)", text: "Mic Level" }),
      h("div", { class: "vu-meter-track" }, vuBar),
      vuBadge,
    );

    const vuRow = h("div", { class: "row" },
      h("label", { style: "min-width:120px", text: "Live test mic" }),
      vuContainer,
    );

    AudioCore.onVolumeLevel = (lvl: number) => {
      const pct = Math.round(lvl * 100);
      vuBar.style.width = `${pct}%`;
      vuBadge.textContent = `${pct}%`;
    };

    // Ensure audio core is active for live VU feedback
    void AudioCore.start(settings.voiceMicrophoneDevice);
    AudioCore.setPreampBoost(settings.voicePreampBoost || 3.0);

    // 3. TTS enable toggle
    const ttsRow = h("div", { class: "row", style: "justify-content:space-between" },
      h("strong", { style: "display:flex;align-items:center;gap:6px" },
        statusDot(settings.voiceTtsEnabled),
        h("span", { text: "Neural Companion TTS" }),
      ),
      toggle(settings.voiceTtsEnabled, (v) => {
        settings.voiceTtsEnabled = v;
        void save();
        void render();
      }),
    );

    // 4. Voice selector
    const voiceSelect = h("select", {}) as HTMLSelectElement;
    voiceSelect.append(h("option", { value: "default", text: "Default (Microsoft Zira / Neural Companion)" }));
    try {
      const installed = await Bridge.voiceListVoices();
      if (installed && installed.length > 0) {
        clear(voiceSelect);
        for (const v of installed) {
          const cult = v.culture || (v as unknown as { language?: string }).language || "Local";
          voiceSelect.append(h("option", { value: v.name, text: `${v.name} (${cult})` }));
        }
      }
    } catch {
      // fallback to default
    }
    voiceSelect.value = settings.voiceTtsVoice || "default";
    voiceSelect.addEventListener("change", () => {
      settings.voiceTtsVoice = voiceSelect.value;
      void save();
    });

    const voiceRow = h("div", { class: "row" },
      h("label", { style: "min-width:120px", text: "Companion voice" }),
      voiceSelect,
    );

    // 5. Rate and Pitch sliders
    const rateVal = h("span", { class: "hint", text: `${settings.voiceTtsRate.toFixed(1)}x` });
    const rateInput = h("input", {
      type: "range",
      min: "0.5",
      max: "2.0",
      step: "0.1",
      value: String(settings.voiceTtsRate),
      oninput: () => {
        const val = parseFloat(rateInput.value);
        settings.voiceTtsRate = val;
        rateVal.textContent = `${val.toFixed(1)}x`;
        void save();
      },
    }) as HTMLInputElement;

    const rateRow = h("div", { class: "row" },
      h("label", { style: "min-width:120px", text: "Speech speed" }),
      rateInput,
      rateVal,
    );

    const pitchVal = h("span", { class: "hint", text: `${settings.voiceTtsPitch.toFixed(2)}x` });
    const pitchInput = h("input", {
      type: "range",
      min: "0.8",
      max: "1.5",
      step: "0.05",
      value: String(settings.voiceTtsPitch),
      oninput: () => {
        const val = parseFloat(pitchInput.value);
        settings.voiceTtsPitch = val;
        pitchVal.textContent = `${val.toFixed(2)}x`;
        void save();
      },
    }) as HTMLInputElement;

    const pitchRow = h("div", { class: "row" },
      h("label", { style: "min-width:120px", text: "Vocal pitch" }),
      pitchInput,
      pitchVal,
    );

    // 6. Test Voice button
    const testStatus = h("span", { class: "hint", text: "" });
    const testBtn = h("button", {
      class: "secondary",
      text: "Test Companion Voice",
      onclick: async () => {
        testStatus.textContent = "Speaking…";
        try {
          const res = await Bridge.voiceSpeakText(
            "Coucou! I am Mochi, your local desktop AI companion.",
            settings.voiceTtsVoice === "default" ? undefined : settings.voiceTtsVoice,
            settings.voiceTtsRate,
            settings.voiceTtsPitch,
          );
          testStatus.textContent = res ? "Speech played" : "Synthesis failed";
          setTimeout(() => { testStatus.textContent = ""; }, 3000);
        } catch {
          testStatus.textContent = "Error testing voice";
        }
      },
    });

    const testRow = h("div", { class: "row", style: "gap:10px;margin-top:4px" },
      testBtn,
      testStatus,
    );

    card.append(
      wakeRow,
      phraseRow,
      micRow,
      preampRow,
      vuRow,
      h("hr", { style: "border:0;border-top:1px solid var(--hairline);margin:4px 0" }),
      ttsRow,
      voiceRow,
      rateRow,
      pitchRow,
      testRow,
    );
  }

  void render();
  return section;
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function main() {
  const boot = await Bridge.boot();
  if (boot) {
    settings = { ...settings, ...boot.settings };
    version = boot.version;
  }

  const keys = [
    "anthropic-api-key", "gemini-api-key", "openai-api-key",
    "stripe-api-key", "github-token", "vercel-token",
    "n8n-url", "n8n-api-key", "resend-api-key", "notion-api-key", "calcom-api-key",
  ];
  const present: Record<string, boolean> = {};
  for (const k of keys) present[k] = (await Bridge.secretPresent(k)) ?? false;

  clear(root);
  root.append(
    h("h1", {}, h("span", { text: "Coucou Settings" }), h("span", { class: "version", text: version })),
    agentsSection(),
    mobileSyncSection(),
    voiceSettingsSection(),
    aiProvidersSection(present),
    integrationsSection(present),
    generalSection(),
    h("div", {
      class: "hint",
      text: "No telemetry. Network requests only go to the services you configure yourself.",
    }),
  );

  void onEvent<Settings>("settings-changed", (s) => {
    settings = { ...settings, ...s };
  });

  window.addEventListener("beforeunload", () => {
    AudioCore.stop();
  });
}

void main();
