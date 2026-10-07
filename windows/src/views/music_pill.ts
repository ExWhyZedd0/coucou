import { h, svg } from "./dom";
import { ICONS } from "./icons";
import { Bridge } from "../core/bridge";
import { Sound } from "../core/sound";
import { State } from "../core/state";
import type { ViewHost } from "./views";

export function buildMusicPill(): ViewHost {
  const titleEl = h("span", { class: "music-title", text: "Nothing playing" });
  const artistEl = h("span", { class: "music-artist", text: "" });

  const playPauseBtn = h("button", { class: "music-ctrl-btn", title: "Play / Pause" }, svg(ICONS.play, 10));
  const nextBtn = h("button", { class: "music-ctrl-btn", title: "Next" }, svg(ICONS.next, 10));

  const infoCol = h("div", { class: "music-info-col" }, titleEl, artistEl);
  const actionsRow = h("div", { class: "music-actions-row" }, playPauseBtn, nextBtn);

  const card = h("div", { class: "card wash music-card" }, infoCol, actionsRow);
  card.style.setProperty("--wash", "rgba(236, 72, 153, 0.4)");

  const el = h("div", { class: "view music-view" }, card);

  let lastFetch = 0;

  async function refresh() {
    const info = await Bridge.mediaGetState();
    if (!info) {
      titleEl.textContent = "Nothing playing";
      artistEl.textContent = "";
      return;
    }
    titleEl.textContent = info.title || "Unknown title";
    artistEl.textContent = info.artist || "";

    if (info.playing && State.focusTask?.id === "integration_music") {
      State.stateOverride = "dance";
    } else if (State.stateOverride === "dance") {
      State.stateOverride = null;
    }

    playPauseBtn.innerHTML = "";
    playPauseBtn.append(svg(info.playing ? ICONS.pause : ICONS.play, 10));
  }

  playPauseBtn.addEventListener("click", async () => {
    Sound.play("blip");
    await Bridge.mediaPlayPause();
    window.setTimeout(() => void refresh(), 150);
  });

  nextBtn.addEventListener("click", async () => {
    Sound.play("blip");
    await Bridge.mediaNext();
    window.setTimeout(() => void refresh(), 250);
  });

  return {
    el,
    sync() {
      const now = performance.now();
      if (now - lastFetch > 1500) {
        lastFetch = now;
        void refresh();
      }
    },
    tick(nowMs: number) {
      if (nowMs - lastFetch > 2000) {
        lastFetch = nowMs;
        void refresh();
      }
    },
  };
}
