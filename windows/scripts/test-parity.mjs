// Verification test script matching DiffEngineTests.swift assertions
import assert from "node:assert";

// 1. Test diff parsing & step formatting
const DIFF_STEP_MARKER = "\u{E001}";

function isDiffStep(text) {
  return text.startsWith(DIFF_STEP_MARKER);
}

function parseDiffStep(text) {
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

function makeDiffStep(filename, added, removed, diffId) {
  return `${DIFF_STEP_MARKER}${filename}\t${added}:${removed}:${diffId}`;
}

// Round-trip test
const step = makeDiffStep("main.rs", 12, 4, 42);
const parsed = parseDiffStep(step);
assert.deepStrictEqual(parsed, { filename: "main.rs", added: 12, removed: 4, diffId: 42 });
assert.strictEqual(parseDiffStep("Normal Step"), null);
assert.strictEqual(parseDiffStep(`${DIFF_STEP_MARKER}malformed`), null);

// 2. Easter / Seasonal outfit date test
function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function getSeasonalOutfit(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();

  if ((month === 12 && day === 31) || (month === 1 && day <= 2)) return "partyHat";
  if (month === 12 && day <= 26) return "santaHat";
  if (month === 10 || (month === 11 && day === 1)) return "witchHat";

  const easter = easterDate(year);
  const easterTime = new Date(year, easter.month - 1, easter.day).getTime();
  const todayTime = new Date(year, month - 1, day).getTime();
  const diffDays = Math.round((todayTime - easterTime) / (86400 * 1000));
  if (diffDays >= -2 && diffDays <= 1) return "bunnyEars";
  if ((month === 6 && day >= 21) || month === 7 || month === 8) return "sunglasses";

  return "none";
}

assert.strictEqual(getSeasonalOutfit(new Date(2026, 11, 25)), "santaHat");
assert.strictEqual(getSeasonalOutfit(new Date(2026, 11, 31)), "partyHat");
assert.strictEqual(getSeasonalOutfit(new Date(2026, 0, 1)), "partyHat");
assert.strictEqual(getSeasonalOutfit(new Date(2026, 9, 31)), "witchHat");
assert.strictEqual(getSeasonalOutfit(new Date(2026, 6, 15)), "sunglasses");

console.log("All parity unit tests passed!");
