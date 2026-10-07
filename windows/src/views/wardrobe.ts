import { h, clear } from "./dom";
import { Sound } from "../core/sound";
import { State } from "../core/state";
import { Bridge } from "../core/bridge";
import { OUTFIT_CATALOG, type Outfit } from "../mochi/outfits";
import type { ViewHost } from "./views";

export function buildWardrobe(onClose: () => void): ViewHost {
  const listEl = h("div", { class: "wardrobe-grid" });

  const closeBtn = h("button", { class: "wardrobe-close-btn", text: "Done" });
  closeBtn.addEventListener("click", () => {
    Sound.play("blip");
    onClose();
  });

  const title = h("div", { class: "wardrobe-title" }, h("span", { text: "Mochi's Wardrobe" }), closeBtn);

  const card = h("div", { class: "wardrobe-card card wash" }, title, listEl);
  card.style.setProperty("--wash", "rgba(99, 102, 241, 0.45)");

  const el = h("div", { class: "view wardrobe-view" }, card);

  function sync() {
    clear(listEl);
    const current = (State.settings.mochiOutfit as Outfit) || "auto";

    for (const item of OUTFIT_CATALOG) {
      const active = item.id === current;
      const btn = h(
        "button",
        { class: `wardrobe-item ${active ? "active" : ""}` },
        h("span", { class: "wardrobe-emoji", text: item.emoji }),
        h("span", { class: "wardrobe-label", text: item.label })
      );

      btn.addEventListener("click", () => {
        State.settings.mochiOutfit = item.id;
        Sound.play("approve");
        void Bridge.saveSettings(State.settings);
        State.notify();
        sync();
      });

      listEl.append(btn);
    }
  }

  sync();

  return {
    el,
    sync,
  };
}
