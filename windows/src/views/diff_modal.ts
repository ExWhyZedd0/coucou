import { h, svg, clear } from "./dom";
import { ICONS } from "./icons";
import { Sound } from "../core/sound";
import { Bridge } from "../core/bridge";
import type { FileDiff, DiffLine } from "../core/diff";

export interface DiffModalHost {
  el: HTMLElement;
  show(diff: FileDiff, onBack: () => void): void;
  hide(): void;
  isOpen(): boolean;
}

export function buildDiffModal(): DiffModalHost {
  const titleText = h("span", { class: "diff-title-text" });
  const countAdd = h("span", { class: "diff-count-add" });
  const countDel = h("span", { class: "diff-count-del" });
  const backBtn = h("button", { class: "diff-back-btn", title: "Back" }, svg(ICONS.chevronLeft, 12));
  const openEditorBtn = h("button", { class: "diff-action-btn", title: "Open in VS Code" }, svg(ICONS.arrowUpRight, 11));
  const copyBtn = h("button", { class: "diff-action-btn", title: "Copy diff" }, svg(ICONS.clipboard, 11));

  const header = h(
    "div",
    { class: "diff-header" },
    h("div", { class: "diff-header-left" }, backBtn, titleText),
    h("div", { class: "diff-header-right" }, countAdd, countDel, openEditorBtn, copyBtn)
  );

  const body = h("div", { class: "diff-body" });
  const card = h("div", { class: "diff-card card wash" }, header, body);
  card.style.setProperty("--wash", "rgba(30, 32, 40, 0.95)");

  const el = h("div", { class: "diff-modal-overlay" }, card);
  el.style.display = "none";

  let currentDiff: FileDiff | null = null;
  let closeCallback: (() => void) | null = null;

  function close() {
    el.style.display = "none";
    currentDiff = null;
    Sound.play("blip");
    if (closeCallback) {
      const cb = closeCallback;
      closeCallback = null;
      cb();
    }
  }

  backBtn.addEventListener("click", close);

  openEditorBtn.addEventListener("click", () => {
    if (currentDiff) {
      void Bridge.openInVSCode(currentDiff.path);
    }
  });

  copyBtn.addEventListener("click", () => {
    if (!currentDiff) return;
    const lines = currentDiff.hunks.flatMap((hunk) => hunk.lines);
    const text = lines
      .map((l) => (l.kind === "added" ? `+ ${l.text}` : l.kind === "removed" ? `- ${l.text}` : `  ${l.text}`))
      .join("\n");
    void navigator.clipboard.writeText(text);
    Sound.play("approve");
  });

  function renderLine(line: DiffLine): HTMLElement {
    const isAdd = line.kind === "added";
    const isDel = line.kind === "removed";
    const prefix = isAdd ? "+" : isDel ? "-" : " ";

    const lineNum = h(
      "span",
      { class: "diff-line-num" },
      line.origLine > 0 ? String(line.origLine) : line.newLine > 0 ? String(line.newLine) : ""
    );

    const prefixEl = h("span", { class: "diff-line-prefix" }, prefix);
    const textEl = h("span", { class: "diff-line-text", text: line.text });

    const row = h(
      "div",
      { class: `diff-line-row ${line.kind}` },
      lineNum,
      prefixEl,
      textEl
    );
    return row;
  }

  return {
    el,
    show(diff: FileDiff, onBack: () => void) {
      currentDiff = diff;
      closeCallback = onBack;
      titleText.textContent = diff.name;

      countAdd.textContent = diff.added > 0 ? `+${diff.added}` : "";
      countAdd.style.display = diff.added > 0 ? "" : "none";

      countDel.textContent = diff.removed > 0 ? `−${diff.removed}` : "";
      countDel.style.display = diff.removed > 0 ? "" : "none";

      clear(body);
      if (diff.tooLarge) {
        body.append(h("div", { class: "diff-message", text: "File diff is too large to preview." }));
      } else if (diff.hunks.length === 0) {
        body.append(h("div", { class: "diff-message", text: "No changes." }));
      } else {
        for (const hunk of diff.hunks) {
          const hunkHeader = h(
            "div",
            { class: "diff-hunk-header" },
            h("span", { text: `@@ -${hunk.origStart} +${hunk.newStart} @@` })
          );
          body.append(hunkHeader);
          for (const line of hunk.lines) {
            body.append(renderLine(line));
          }
        }
      }

      el.style.display = "flex";
      Sound.play("open");
    },
    hide() {
      close();
    },
    isOpen() {
      return el.style.display !== "none";
    },
  };
}
