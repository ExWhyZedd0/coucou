// Desktop Mochi floating window entry point — port of DesktopMochi.swift & DesktopMochiLogic.swift.

import { BotEngine } from "../mochi/engine";
import { Bridge, onEvent } from "../core/bridge";
import { Sound } from "../core/sound";
import { DEFAULT_SETTINGS, type Settings } from "../core/state";
import type { BotStateName } from "../core/layout";
import { resolveOutfit, OUTFIT_CATALOG, type Outfit } from "../mochi/outfits";

const PANEL_SIZE = 140;
const SLEEP_TIMEOUT_MS = 120_000;
const SLEEP_MOUSE_DISTANCE = 150;

async function init() {
  const container = document.getElementById("mochi-container");
  if (!container) return;

  const canvas = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(PANEL_SIZE * dpr);
  canvas.height = Math.round(PANEL_SIZE * dpr);
  canvas.style.width = `${PANEL_SIZE}px`;
  canvas.style.height = `${PANEL_SIZE}px`;
  container.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const engine = new BotEngine();
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let currentState: BotStateName = "idle";
  let isSleeping = false;
  let lastActive = performance.now();
  let mouseScreen = { x: 0, y: 0 };
  let winPos = { x: 100, y: 100 };

  // Dragging state
  let isDragging = false;
  let dragMouseStart = { x: 0, y: 0 };
  let dragOriginStart = { x: 0, y: 0 };
  let lastClickTime = 0;
  let clickTimeout: number | null = null;

  // Boot settings
  const boot = await Bridge.boot();
  if (boot) {
    settings = { ...settings, ...boot.settings };
  }
  engine.setOutfit(resolveOutfit((settings.mochiOutfit as Outfit) || "auto"), false);

  const savedPos = await Bridge.desktopMochiGetPosition();
  if (savedPos) {
    winPos = { x: savedPos[0], y: savedPos[1] };
  }

  await onEvent<Settings>("settings-changed", (s) => {
    settings = { ...settings, ...s };
    engine.setOutfit(resolveOutfit((settings.mochiOutfit as Outfit) || "auto"), true);
  });

  await onEvent<{ x: number; y: number }>("cursor", ({ x, y }) => {
    mouseScreen = { x, y };
  });

  // Track cursor within window
  window.addEventListener("mousemove", (e) => {
    mouseScreen = { x: winPos.x + e.clientX, y: winPos.y + e.clientY };
    lastActive = performance.now();
  });

  // Drag & click handling with Pointer Events for reliable boundary tracking
  container.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return; // left click only
    try {
      container.setPointerCapture(e.pointerId);
    } catch {}
    isDragging = false;
    dragMouseStart = { x: e.screenX, y: e.screenY };
    dragOriginStart = { ...winPos };
    lastActive = performance.now();
  });

  window.addEventListener("pointermove", (e) => {
    if (dragMouseStart.x === 0 && dragMouseStart.y === 0) return;
    const dx = e.screenX - dragMouseStart.x;
    const dy = e.screenY - dragMouseStart.y;
    if (!isDragging && Math.hypot(dx, dy) > 4) {
      isDragging = true;
    }
    if (isDragging) {
      const newX = dragOriginStart.x + dx;
      const newY = dragOriginStart.y + dy;
      winPos = { x: newX, y: newY };
      void Bridge.desktopMochiSetPosition(newX, newY);
    }
  });

  const handlePointerUp = (e: PointerEvent) => {
    if (e.button !== 0 && e.type !== "pointercancel") return;
    try {
      container.releasePointerCapture(e.pointerId);
    } catch {}
    const wasDragging = isDragging;
    isDragging = false;
    dragMouseStart = { x: 0, y: 0 };

    if (wasDragging) {
      // If released very close to top of screen, fly back to notch/island
      if (winPos.y < 30) {
        returnToIsland();
      }
      return;
    }

    // Handle single vs double click
    const now = performance.now();
    if (now - lastClickTime < 350) {
      // Double click -> fly home
      if (clickTimeout != null) {
        window.clearTimeout(clickTimeout);
        clickTimeout = null;
      }
      lastClickTime = 0;
      returnToIsland();
    } else {
      lastClickTime = now;
      if (clickTimeout != null) window.clearTimeout(clickTimeout);
      clickTimeout = window.setTimeout(() => {
        clickTimeout = null;
        engine.slap();
      }, 350);
    }
  };

  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", handlePointerUp);

  // Right-click cycles outfits
  container.addEventListener("contextmenu", async (e) => {
    e.preventDefault();
    Sound.play("blip");
    const current = (settings.mochiOutfit as Outfit) || "auto";
    const idx = OUTFIT_CATALOG.findIndex((o) => o.id === current);
    const nextIdx = (idx + 1) % OUTFIT_CATALOG.length;
    const nextOutfit = OUTFIT_CATALOG[nextIdx].id;
    settings.mochiOutfit = nextOutfit;
    engine.setOutfit(resolveOutfit(nextOutfit), true);
    await Bridge.saveSettings(settings);
    engine.triggerEmote("happy");
  });

  function returnToIsland() {
    Sound.play("peek");
    settings.mochiOnDesktop = false;
    void Bridge.saveSettings(settings);
    void Bridge.desktopMochiHide();
  }

  // Periodic media check for dancing
  setInterval(async () => {
    const media = await Bridge.mediaGetState();
    if (media && media.playing) {
      engine.setDancing(true);
    } else {
      engine.setDancing(false);
    }
  }, 2000);

  // Animation frame loop
  let lastFrame = performance.now();
  function loop(now: number) {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    // Center of panel in screen coordinates
    const panelCenterX = winPos.x + PANEL_SIZE / 2;
    const panelCenterY = winPos.y + PANEL_SIZE / 2;

    // Eye tracking
    engine.lookX = Math.tanh((mouseScreen.x - panelCenterX) / 260);
    engine.lookY = -Math.tanh((mouseScreen.y - panelCenterY) / 200);

    // Sleep detection
    const mouseDist = Math.hypot(mouseScreen.x - panelCenterX, mouseScreen.y - panelCenterY);
    const idleTime = now - lastActive;
    const shouldSleep = idleTime > SLEEP_TIMEOUT_MS && mouseDist >= SLEEP_MOUSE_DISTANCE;

    if (shouldSleep !== isSleeping) {
      isSleeping = shouldSleep;
      engine.setState(isSleeping ? "sleeping" : currentState);
    }

    engine.update(dt);

    if (ctx) {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, PANEL_SIZE, PANEL_SIZE);
      engine.draw(ctx, PANEL_SIZE, PANEL_SIZE);
      ctx.restore();
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

void init();
