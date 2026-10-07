// Diff Engine — TypeScript port of DiffEngine.swift from CoucouKit.

export type DiffLineKind = "context" | "added" | "removed";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  origLine: number; // 1-based, -1 for added
  newLine: number;  // 1-based, -1 for removed
}

export interface DiffHunk {
  origStart: number;
  newStart: number;
  lines: DiffLine[];
}

export interface FileDiff {
  id: number;
  path: string;
  name: string;
  added: number;
  removed: number;
  hunks: DiffHunk[];
  tooLarge: boolean;
  isNewFile: boolean;
}

export const DIFF_STEP_MARKER = "\u{E001}";

export function isDiffStep(text: string): boolean {
  return text.startsWith(DIFF_STEP_MARKER);
}

export interface ParsedDiffStep {
  filename: string;
  added: number;
  removed: number;
  diffId: number;
}

export function parseDiffStep(text: string): ParsedDiffStep | null {
  if (!isDiffStep(text)) return null;
  const body = text.slice(DIFF_STEP_MARKER.length);
  const tabIdx = body.indexOf("\t");
  if (tabIdx === -1) return null;
  const filename = body.slice(0, tabIdx);
  const rest = body.slice(tabIdx + 1);
  const parts = rest.split(":");
  if (parts.length !== 3) return null;
  const added = parseInt(parts[0], 10);
  const removed = parseInt(parts[1], 10);
  const diffId = parseInt(parts[2], 10);
  if (isNaN(added) || isNaN(removed) || isNaN(diffId)) return null;
  return { filename, added, removed, diffId };
}

export function makeDiffStep(filename: string, added: number, removed: number, diffId: number): string {
  return `${DIFF_STEP_MARKER}${filename}\t${added}:${removed}:${diffId}`;
}

const MAX_BYTES = 200 * 1024;
const MAX_LINES = 4000;

function splitLines(text: string): string[] {
  const norm = text.replace(/\r\n/g, "\n");
  const parts = norm.split("\n");
  if (parts.length > 0 && parts[parts.length - 1] === "") {
    parts.pop();
  }
  return parts;
}

function fileNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export const DiffEngine = {
  fromEdit(oldStr: string, newStr: string, path: string, diffId = 0): FileDiff {
    const name = fileNameFromPath(path);
    if (oldStr.length + newStr.length > MAX_BYTES) {
      return countFallback(oldStr, newStr, path, name, true, diffId);
    }
    const oldLines = splitLines(oldStr);
    const newLines = splitLines(newStr);
    if (oldLines.length + newLines.length > MAX_LINES) {
      return countFallback(oldStr, newStr, path, name, true, diffId);
    }
    if (oldLines.length * newLines.length > 1_000_000) {
      return countFallback(oldStr, newStr, path, name, true, diffId);
    }

    const flat = buildDiffLines(oldLines, newLines);
    const hunks = buildHunks(flat, 3);
    const added = flat.filter((l) => l.kind === "added").length;
    const removed = flat.filter((l) => l.kind === "removed").length;

    return {
      id: diffId,
      path,
      name,
      added,
      removed,
      hunks,
      tooLarge: false,
      isNewFile: false,
    };
  },

  fromNew(content: string, path: string, diffId = 0): FileDiff {
    const name = fileNameFromPath(path);
    if (content.length > MAX_BYTES) {
      const lineCount = content.split("\n").length;
      return {
        id: diffId,
        path,
        name,
        added: lineCount,
        removed: 0,
        hunks: [],
        tooLarge: true,
        isNewFile: true,
      };
    }
    const lines = splitLines(content);
    if (lines.length > MAX_LINES) {
      return {
        id: diffId,
        path,
        name,
        added: lines.length,
        removed: 0,
        hunks: [],
        tooLarge: true,
        isNewFile: true,
      };
    }
    const diffLines: DiffLine[] = lines.map((text, i) => ({
      kind: "added",
      text,
      origLine: -1,
      newLine: i + 1,
    }));
    const hunks: DiffHunk[] = diffLines.length > 0
      ? [{ origStart: 0, newStart: 1, lines: diffLines }]
      : [];

    return {
      id: diffId,
      path,
      name,
      added: diffLines.length,
      removed: 0,
      hunks,
      tooLarge: false,
      isNewFile: true,
    };
  },

  toOneLine(text: string, maxChars = 200): string {
    const lines = text.split("\n");
    for (const rawLine of lines) {
      let l = rawLine.trim();
      if (!l || l.startsWith("#") || l.startsWith("|") || l.startsWith("---") || l.startsWith("***")) {
        continue;
      }
      l = l.replace(/\*\*/g, "").replace(/__/g, "").replace(/`/g, "");
      l = l.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "");
      l = l.trim();
      if (l) {
        return l.slice(0, maxChars);
      }
    }
    return "";
  },
};

function countFallback(
  oldStr: string,
  newStr: string,
  path: string,
  name: string,
  tooLarge: boolean,
  id: number
): FileDiff {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const added = newLines.filter((l) => l && !oldSet.has(l)).length;
  const removed = oldLines.filter((l) => l && !newSet.has(l)).length;
  return {
    id,
    path,
    name,
    added,
    removed,
    hunks: [],
    tooLarge,
    isNewFile: false,
  };
}

function buildDiffLines(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;

  // DP table for LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const matches: [number, number][] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      matches.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  matches.reverse();

  const result: DiffLine[] = [];
  let prevOld = -1;
  let prevNew = -1;

  for (const [oi, ni] of matches) {
    for (let k = prevOld + 1; k < oi; k++) {
      result.push({ kind: "removed", text: oldLines[k], origLine: k + 1, newLine: -1 });
    }
    for (let k = prevNew + 1; k < ni; k++) {
      result.push({ kind: "added", text: newLines[k], origLine: -1, newLine: k + 1 });
    }
    result.push({ kind: "context", text: oldLines[oi], origLine: oi + 1, newLine: ni + 1 });
    prevOld = oi;
    prevNew = ni;
  }

  for (let k = prevOld + 1; k < m; k++) {
    result.push({ kind: "removed", text: oldLines[k], origLine: k + 1, newLine: -1 });
  }
  for (let k = prevNew + 1; k < n; k++) {
    result.push({ kind: "added", text: newLines[k], origLine: -1, newLine: k + 1 });
  }

  return result;
}

function buildHunks(lines: DiffLine[], context: number): DiffHunk[] {
  if (lines.length === 0) return [];

  const changedIndices: number[] = [];
  for (let idx = 0; idx < lines.length; idx++) {
    if (lines[idx].kind !== "context") {
      changedIndices.push(idx);
    }
  }
  if (changedIndices.length === 0) return [];

  const ranges: [number, number][] = changedIndices.map((ci) => [
    Math.max(0, ci - context),
    Math.min(lines.length - 1, ci + context),
  ]);

  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], r[1]);
    } else {
      merged.push([r[0], r[1]]);
    }
  }

  const hunks: DiffHunk[] = [];
  for (const [start, end] of merged) {
    const hunkLines = lines.slice(start, end + 1);
    const origStart = hunkLines.find((l) => l.origLine > 0)?.origLine ?? 1;
    const newStart = hunkLines.find((l) => l.newLine > 0)?.newLine ?? 1;
    hunks.push({ origStart, newStart, lines: hunkLines });
  }

  return hunks;
}
