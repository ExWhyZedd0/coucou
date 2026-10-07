// Mochi Wardrobe & Seasonal Outfits — Integrated 3D Skeletal Attached Model
// Outfits physically bind to Mochi's squircle vertices, rotating with head
// pitch/yaw/roll, deforming with squishX/squishY dynamics, and casting ambient contact shadows.

export type Outfit =
  | "auto"
  | "none"
  | "partyHat"
  | "beanie"
  | "crown"
  | "sunglasses"
  | "roundGlasses"
  | "bow"
  | "scarf"
  | "witchHat"
  | "pumpkin"
  | "santaHat"
  | "bunnyEars";

export interface OutfitDef {
  id: Outfit;
  label: string;
  emoji: string;
}

export const OUTFIT_CATALOG: OutfitDef[] = [
  { id: "auto", label: "Auto (seasons)", emoji: "✨" },
  { id: "none", label: "None", emoji: "⚪" },
  { id: "partyHat", label: "Party hat", emoji: "🎉" },
  { id: "beanie", label: "Beanie", emoji: "🧶" },
  { id: "crown", label: "Crown", emoji: "👑" },
  { id: "sunglasses", label: "Sunglasses", emoji: "🕶️" },
  { id: "roundGlasses", label: "Round glasses", emoji: "👓" },
  { id: "bow", label: "Bow", emoji: "🎀" },
  { id: "scarf", label: "Scarf", emoji: "🧣" },
  { id: "witchHat", label: "Witch hat", emoji: "🧙" },
  { id: "pumpkin", label: "Pumpkin", emoji: "🎃" },
  { id: "santaHat", label: "Santa hat", emoji: "🎅" },
  { id: "bunnyEars", label: "Bunny ears", emoji: "🐰" },
];

export interface EyeAnchor {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  visible: boolean;
}

export interface VisemeState {
  mouthShape: "neutral" | "smile" | "open" | "o" | "wide";
  jawDrop: number;     // 0.0 to 1.0
  smileAmount: number; // 0.0 to 1.0
}

export interface SkeletalAttachmentContext {
  cx: number;
  cy: number;
  R: number;           // Base radius
  rx: number;          // Horizontal squircle radius
  ry: number;          // Vertical squircle radius
  sx: number;          // Dynamic bounce squishX
  sy: number;          // Dynamic bounce squishY
  yaw: number;         // Head turn horizontal
  pitch: number;       // Head turn vertical
  roll: number;        // Head roll
  tilt: number;        // Body tilt
  morph: number;       // Box morph
  presence: number;    // Outfit fade/presence (0..1)
  apex: {
    x: number;
    y: number;
    normalAngle: number;
  };
  eyeLeft: EyeAnchor;
  eyeRight: EyeAnchor;
  neck: {
    x: number;
    y: number;
    width: number;
  };
  viseme?: VisemeState;
}

/** Meeus/Jones/Butcher algorithm to calculate Easter Sunday for year. */
function easterDate(year: number): { month: number; day: number } {
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

export function getSeasonalOutfit(date = new Date()): Outfit {
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

export function resolveOutfit(selection: Outfit, date = new Date()): Outfit {
  return selection === "auto" ? getSeasonalOutfit(date) : selection;
}

/** Draws attached outfit integrated with Mochi's dynamic squircle vertex and skeleton. */
export function drawAttachedOutfit(
  ctx: CanvasRenderingContext2D,
  outfit: Outfit,
  skel: SkeletalAttachmentContext
) {
  if (outfit === "none" || outfit === "auto" || skel.presence <= 0.01) return;

  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, skel.presence));

  switch (outfit) {
    case "partyHat":
      drawAttachedPartyHat(ctx, skel);
      break;
    case "beanie":
      drawAttachedBeanie(ctx, skel);
      break;
    case "crown":
      drawAttachedCrown(ctx, skel);
      break;
    case "sunglasses":
      drawAttachedSunglasses(ctx, skel);
      break;
    case "roundGlasses":
      drawAttachedRoundGlasses(ctx, skel);
      break;
    case "bow":
      drawAttachedBow(ctx, skel);
      break;
    case "scarf":
      drawAttachedScarf(ctx, skel);
      break;
    case "witchHat":
      drawAttachedWitchHat(ctx, skel);
      break;
    case "pumpkin":
      drawAttachedPumpkin(ctx, skel);
      break;
    case "santaHat":
      drawAttachedSantaHat(ctx, skel);
      break;
    case "bunnyEars":
      drawAttachedBunnyEars(ctx, skel);
      break;
  }

  ctx.restore();
}

/** Backwards-compatible standalone draw function. */
export function drawOutfit(
  ctx: CanvasRenderingContext2D,
  outfit: Outfit,
  cx: number,
  cy: number,
  r: number,
  tilt = 0,
  bounce = 0
) {
  if (outfit === "none" || outfit === "auto") return;
  const rx = r * 1.14;
  const ry = r * 0.88;
  const skel: SkeletalAttachmentContext = {
    cx,
    cy: cy + bounce,
    R: r,
    rx,
    ry,
    sx: 1,
    sy: 1,
    yaw: 0,
    pitch: 0,
    roll: 0,
    tilt,
    morph: 0,
    presence: 1,
    apex: { x: 0, y: -ry, normalAngle: 0 },
    eyeLeft: { x: -r * 0.37, y: -r * 0.12, scaleX: 1, scaleY: 1, visible: true },
    eyeRight: { x: r * 0.37, y: -r * 0.12, scaleX: 1, scaleY: 1, visible: true },
    neck: { x: 0, y: ry * 0.65, width: rx * 1.4 },
  };

  ctx.save();
  ctx.translate(cx, cy + bounce);
  ctx.rotate(tilt);
  drawAttachedOutfit(ctx, outfit, skel);
  ctx.restore();
}

// ── Contact Shadow Helper ─────────────────────────────────────────────────────

function drawContactShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 0.22
) {
  ctx.save();
  const grad = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h));
  grad.addColorStop(0, `rgba(18, 14, 28, ${alpha})`);
  grad.addColorStop(0.65, `rgba(22, 18, 32, ${alpha * 0.45})`);
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(1, w), Math.max(1, h), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Headwear Implementations ──────────────────────────────────────────────────

function drawAttachedPartyHat(ctx: CanvasRenderingContext2D, skel: SkeletalAttachmentContext) {
  const { R, apex, yaw } = skel;
  const ax = apex.x;
  const ay = apex.y;
  const hatH = R * 1.05;
  const baseW = R * 0.44;

  // Contact shadow on Mochi's squircle head
  drawContactShadow(ctx, ax, ay + R * 0.04, baseW * 0.95, R * 0.12, 0.28);

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(apex.normalAngle + yaw * 0.18);

  // 3D perspective skew
  const skewX = Math.sin(yaw) * R * 0.16;
  const topY = -hatH;

  // Hat cone
  ctx.beginPath();
  ctx.moveTo(skewX, topY);
  ctx.lineTo(baseW, 0);
  ctx.quadraticCurveTo(0, R * 0.06, -baseW, 0);
  ctx.closePath();

  const hatGrad = ctx.createLinearGradient(-baseW, 0, baseW, 0);
  hatGrad.addColorStop(0, "#EF4444");
  hatGrad.addColorStop(0.4, "#F87171");
  hatGrad.addColorStop(1, "#DC2626");
  ctx.fillStyle = hatGrad;
  ctx.fill();

  // Pattern stripes clipped to cone
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "#FDE047";
  ctx.lineWidth = R * 0.11;
  ctx.beginPath();
  ctx.moveTo(-R, topY + hatH * 0.28);
  ctx.lineTo(R, topY + hatH * 0.48);
  ctx.moveTo(-R, topY + hatH * 0.55);
  ctx.lineTo(R, topY + hatH * 0.75);
  ctx.stroke();

  ctx.strokeStyle = "#60A5FA";
  ctx.lineWidth = R * 0.05;
  ctx.beginPath();
  ctx.moveTo(-R, topY + hatH * 0.42);
  ctx.lineTo(R, topY + hatH * 0.62);
  ctx.stroke();
  ctx.restore();

  // Rim accent
  ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Fluffy Pom-Pom on top
  const pomR = R * 0.12;
  const pomX = skewX;
  const pomY = topY;
  const pomGrad = ctx.createRadialGradient(pomX - pomR * 0.3, pomY - pomR * 0.3, 0, pomX, pomY, pomR);
  pomGrad.addColorStop(0, "#FEF08A");
  pomGrad.addColorStop(0.7, "#EAB308");
  pomGrad.addColorStop(1, "#CA8A04");
  ctx.fillStyle = pomGrad;
  ctx.beginPath();
  ctx.arc(pomX, pomY, pomR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawAttachedBeanie(ctx: CanvasRenderingContext2D, skel: SkeletalAttachmentContext) {
  const { R, apex, yaw } = skel;
  const ax = apex.x;
  const ay = apex.y;
  const w = R * 0.64;
  const h = R * 0.52;

  // Soft ambient contact shadow hugging the squircle crown
  drawContactShadow(ctx, ax, ay + R * 0.05, w * 1.05, R * 0.16, 0.32);

  ctx.save();
  ctx.translate(ax, ay + R * 0.02);
  ctx.rotate(apex.normalAngle + yaw * 0.15);

  // Beanie knit dome
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.quadraticCurveTo(-w * 0.9, -h * 1.05, 0, -h * 1.08);
  ctx.quadraticCurveTo(w * 0.9, -h * 1.05, w, 0);
  ctx.closePath();

  const domeGrad = ctx.createLinearGradient(-w, 0, w, 0);
  domeGrad.addColorStop(0, "#1E40AF");
  domeGrad.addColorStop(0.35, "#3B82F6");
  domeGrad.addColorStop(0.75, "#2563EB");
  domeGrad.addColorStop(1, "#1D4ED8");
  ctx.fillStyle = domeGrad;
  ctx.fill();

  // Folded Ribbed Brim
  const brimH = R * 0.22;
  const brimW = w * 1.06;
  ctx.beginPath();
  ctx.roundRect(-brimW, -brimH * 0.65, brimW * 2, brimH, R * 0.09);
  const brimGrad = ctx.createLinearGradient(-brimW, 0, brimW, 0);
  brimGrad.addColorStop(0, "#172554");
  brimGrad.addColorStop(0.5, "#1D4ED8");
  brimGrad.addColorStop(1, "#1E3A8A");
  ctx.fillStyle = brimGrad;
  ctx.fill();

  // Knit ribs texture
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1.4;
  for (let i = -brimW + R * 0.1; i < brimW; i += R * 0.12) {
    ctx.beginPath();
    ctx.moveTo(i, -brimH * 0.55);
    ctx.lineTo(i, brimH * 0.3);
    ctx.stroke();
  }

  // Fluffy Pom-Pom on top
  const pomR = R * 0.15;
  const pomY = -h * 1.08 - pomR * 0.6;
  ctx.beginPath();
  ctx.arc(0, pomY, pomR, 0, Math.PI * 2);
  const pomGrad = ctx.createRadialGradient(-pomR * 0.25, pomY - pomR * 0.25, 0, 0, pomY, pomR);
  pomGrad.addColorStop(0, "#FFFFFF");
  pomGrad.addColorStop(0.7, "#DBEAFE");
  pomGrad.addColorStop(1, "#93C5FD");
  ctx.fillStyle = pomGrad;
  ctx.fill();

  ctx.restore();
}

function drawAttachedCrown(ctx: CanvasRenderingContext2D, skel: SkeletalAttachmentContext) {
  const { R, apex, yaw } = skel;
  const ax = apex.x;
  const ay = apex.y;
  const w = R * 0.56;
  const h = R * 0.46;

  drawContactShadow(ctx, ax, ay + R * 0.03, w * 0.9, R * 0.12, 0.25);

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(apex.normalAngle + yaw * 0.12);

  // Crown base and peaks
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.lineTo(-w * 0.92, -h * 0.75);
  ctx.lineTo(-w * 0.46, -h * 0.38);
  ctx.lineTo(0, -h * 1.02);
  ctx.lineTo(w * 0.46, -h * 0.38);
  ctx.lineTo(w * 0.92, -h * 0.75);
  ctx.lineTo(w, 0);
  ctx.quadraticCurveTo(0, R * 0.05, -w, 0);
  ctx.closePath();

  const goldGrad = ctx.createLinearGradient(-w, 0, w, 0);
  goldGrad.addColorStop(0, "#D97706");
  goldGrad.addColorStop(0.35, "#FDE047");
  goldGrad.addColorStop(0.7, "#F59E0B");
  goldGrad.addColorStop(1, "#B45309");
  ctx.fillStyle = goldGrad;
  ctx.fill();

  ctx.strokeStyle = "#92400E";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Central Ruby jewel
  const rubyR = R * 0.07;
  ctx.beginPath();
  ctx.arc(0, -h * 0.24, rubyR, 0, Math.PI * 2);
  ctx.fillStyle = "#EF4444";
  ctx.fill();
  ctx.strokeStyle = "#7F1D1D";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Emerald side jewels
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * w * 0.5, -h * 0.18, rubyR * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = "#10B981";
    ctx.fill();
    ctx.strokeStyle = "#064E3B";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

function drawAttachedWitchHat(ctx: CanvasRenderingContext2D, skel: SkeletalAttachmentContext) {
  const { R, apex, yaw } = skel;
  const ax = apex.x;
  const ay = apex.y;
  const brimW = R * 0.88;
  const brimH = R * 0.24;
  const topH = R * 1.25;

  drawContactShadow(ctx, ax, ay + R * 0.05, brimW * 0.95, brimH * 0.9, 0.38);

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(apex.normalAngle + yaw * 0.14);

  // Wide Elliptical Brim
  ctx.beginPath();
  ctx.ellipse(0, 0, brimW, brimH * 0.55, 0, 0, Math.PI * 2);
  const brimGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, brimW);
  brimGrad.addColorStop(0, "#312E81");
  brimGrad.addColorStop(0.85, "#1E1B4B");
  brimGrad.addColorStop(1, "#0F172A");
  ctx.fillStyle = brimGrad;
  ctx.fill();

  // Witch Hat Cone with curled tip
  const coneTipX = R * 0.28 + yaw * R * 0.2;
  const coneTipY = -topH;

  ctx.beginPath();
  ctx.moveTo(-brimW * 0.44, 0);
  ctx.quadraticCurveTo(-R * 0.1, -topH * 0.55, coneTipX, coneTipY);
  ctx.quadraticCurveTo(R * 0.12, -topH * 0.45, brimW * 0.44, 0);
  ctx.closePath();

  const coneGrad = ctx.createLinearGradient(-brimW * 0.44, 0, brimW * 0.44, 0);
  coneGrad.addColorStop(0, "#1E1B4B");
  coneGrad.addColorStop(0.5, "#3730A3");
  coneGrad.addColorStop(1, "#1E1B4B");
  ctx.fillStyle = coneGrad;
  ctx.fill();

  // Golden Hat Band & Buckle
  ctx.beginPath();
  ctx.ellipse(0, -brimH * 0.15, brimW * 0.42, R * 0.08, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#F59E0B";
  ctx.fill();

  // Buckle
  ctx.strokeStyle = "#FEF08A";
  ctx.lineWidth = 2;
  ctx.strokeRect(-R * 0.08, -brimH * 0.25, R * 0.16, R * 0.16);

  ctx.restore();
}

function drawAttachedPumpkin(ctx: CanvasRenderingContext2D, skel: SkeletalAttachmentContext) {
  const { R, apex, yaw } = skel;
  const ax = apex.x;
  const ay = apex.y;
  const pR = R * 0.44;

  drawContactShadow(ctx, ax, ay + R * 0.04, pR * 1.1, R * 0.14, 0.28);

  ctx.save();
  ctx.translate(ax, ay - pR * 0.7);
  ctx.rotate(apex.normalAngle + yaw * 0.16);

  // Side lobes
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * pR * 0.38, 0, pR * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = s < 0 ? "#EA580C" : "#C2410C";
    ctx.fill();
  }

  // Center lobe
  ctx.beginPath();
  ctx.arc(0, 0, pR * 0.82, 0, Math.PI * 2);
  const pumpGrad = ctx.createRadialGradient(-pR * 0.2, -pR * 0.2, 0, 0, 0, pR);
  pumpGrad.addColorStop(0, "#FB923C");
  pumpGrad.addColorStop(0.65, "#EA580C");
  pumpGrad.addColorStop(1, "#9A3412");
  ctx.fillStyle = pumpGrad;
  ctx.fill();

  // Green stem
  ctx.beginPath();
  ctx.roundRect(-R * 0.06, -pR * 1.15, R * 0.12, R * 0.28, R * 0.04);
  ctx.fillStyle = "#16A34A";
  ctx.fill();

  ctx.restore();
}

function drawAttachedSantaHat(ctx: CanvasRenderingContext2D, skel: SkeletalAttachmentContext) {
  const { R, apex, yaw } = skel;
  const ax = apex.x;
  const ay = apex.y;
  const brimW = R * 0.62;
  const topH = R * 1.1;

  drawContactShadow(ctx, ax, ay + R * 0.05, brimW * 1.05, R * 0.16, 0.3);

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(apex.normalAngle + yaw * 0.14);

  // Red cap curved over to the side
  const tipX = brimW * 1.05 + yaw * R * 0.25;
  const tipY = -topH * 0.62;

  ctx.beginPath();
  ctx.moveTo(-brimW, 0);
  ctx.quadraticCurveTo(-R * 0.1, -topH * 1.35, tipX, tipY);
  ctx.quadraticCurveTo(0, -topH * 0.95, brimW, 0);
  ctx.closePath();

  const redGrad = ctx.createLinearGradient(-brimW, 0, brimW, 0);
  redGrad.addColorStop(0, "#991B1B");
  redGrad.addColorStop(0.4, "#EF4444");
  redGrad.addColorStop(1, "#DC2626");
  ctx.fillStyle = redGrad;
  ctx.fill();

  // White fluffy fur brim
  const brimH = R * 0.22;
  ctx.beginPath();
  ctx.roundRect(-brimW * 1.08, -brimH * 0.6, brimW * 2.16, brimH, R * 0.1);
  const furGrad = ctx.createLinearGradient(0, -brimH, 0, brimH);
  furGrad.addColorStop(0, "#FFFFFF");
  furGrad.addColorStop(1, "#E2E8F0");
  ctx.fillStyle = furGrad;
  ctx.fill();

  // Hanging fluffy pom-pom ball
  const ballR = R * 0.16;
  ctx.beginPath();
  ctx.arc(tipX, tipY, ballR, 0, Math.PI * 2);
  ctx.fillStyle = "#F8FAFC";
  ctx.fill();

  ctx.restore();
}

function drawAttachedBunnyEars(ctx: CanvasRenderingContext2D, skel: SkeletalAttachmentContext) {
  const { R, apex, yaw } = skel;
  const ax = apex.x;
  const ay = apex.y;
  const earW = R * 0.18;
  const earH = R * 0.85;
  const spacing = R * 0.34;

  drawContactShadow(ctx, ax - spacing, ay + R * 0.02, earW * 1.2, R * 0.08, 0.2);
  drawContactShadow(ctx, ax + spacing, ay + R * 0.02, earW * 1.2, R * 0.08, 0.2);

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(apex.normalAngle + yaw * 0.15);

  for (const s of [-1, 1]) {
    const ex = s * spacing;
    const twitch = Math.sin(performance.now() * 0.003 + s) * 0.04;

    ctx.save();
    ctx.translate(ex, 0);
    ctx.rotate(s * 0.14 + twitch);

    // Outer white ear
    ctx.beginPath();
    ctx.ellipse(0, -earH * 0.52, earW, earH * 0.55, 0, 0, Math.PI * 2);
    const earGrad = ctx.createLinearGradient(-earW, 0, earW, 0);
    earGrad.addColorStop(0, "#E2E8F0");
    earGrad.addColorStop(0.5, "#FFFFFF");
    earGrad.addColorStop(1, "#CBD5E1");
    ctx.fillStyle = earGrad;
    ctx.fill();

    // Inner pink ear
    ctx.beginPath();
    ctx.ellipse(0, -earH * 0.52, earW * 0.55, earH * 0.42, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#F472B6";
    ctx.fill();

    ctx.restore();
  }

  ctx.restore();
}

// ── Eyewear Implementations ───────────────────────────────────────────────────

function drawAttachedSunglasses(ctx: CanvasRenderingContext2D, skel: SkeletalAttachmentContext) {
  const { R, eyeLeft, eyeRight, pitch } = skel;
  if (!eyeLeft.visible && !eyeRight.visible) return;

  const lx = eyeLeft.x;
  const ly = eyeLeft.y;
  const rx = eyeRight.x;
  const ry = eyeRight.y;

  const leftW = R * 0.42 * eyeLeft.scaleX;
  const leftH = R * 0.28 * eyeLeft.scaleY;
  const rightW = R * 0.42 * eyeRight.scaleX;
  const rightH = R * 0.28 * eyeRight.scaleY;

  // Contact shadow on face underneath glasses
  if (eyeLeft.visible) {
    drawContactShadow(ctx, lx, ly + leftH * 0.2, leftW * 1.1, leftH * 0.5, 0.28);
  }
  if (eyeRight.visible) {
    drawContactShadow(ctx, rx, ry + rightH * 0.2, rightW * 1.1, rightH * 0.5, 0.28);
  }

  ctx.save();

  // Bridge connecting both eye spheres
  if (eyeLeft.visible && eyeRight.visible) {
    const bridgeY = (ly + ry) / 2 - Math.max(leftH, rightH) * 0.15;
    ctx.strokeStyle = "#0F172A";
    ctx.lineWidth = R * 0.06;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lx + leftW * 0.4, ly - leftH * 0.15);
    ctx.quadraticCurveTo((lx + rx) / 2, bridgeY - R * 0.04, rx - rightW * 0.4, ry - rightH * 0.15);
    ctx.stroke();
  }

  // Lenses centered directly on Left & Right eye projection spheres
  const lenses = [
    { x: lx, y: ly, w: leftW, h: leftH, visible: eyeLeft.visible },
    { x: rx, y: ry, w: rightW, h: rightH, visible: eyeRight.visible },
  ];

  for (const lens of lenses) {
    if (!lens.visible) continue;
    const lensW = lens.w;
    const lensH = lens.h;

    ctx.save();
    ctx.translate(lens.x, lens.y);
    ctx.rotate(pitch * 0.2);

    // Frame
    ctx.fillStyle = "#0F172A";
    ctx.beginPath();
    ctx.roundRect(-lensW / 2, -lensH / 2, lensW, lensH, [R * 0.06, R * 0.06, R * 0.16, R * 0.16]);
    ctx.fill();

    // Dark tint lens
    const tintGrad = ctx.createLinearGradient(0, -lensH / 2, 0, lensH / 2);
    tintGrad.addColorStop(0, "#1E293B");
    tintGrad.addColorStop(1, "#020617");
    ctx.fillStyle = tintGrad;
    ctx.beginPath();
    ctx.roundRect(-lensW * 0.46, -lensH * 0.44, lensW * 0.92, lensH * 0.88, [R * 0.05, R * 0.05, R * 0.14, R * 0.14]);
    ctx.fill();

    // Specular gloss reflection slant
    ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
    ctx.lineWidth = R * 0.035;
    ctx.beginPath();
    ctx.moveTo(-lensW * 0.35, -lensH * 0.25);
    ctx.lineTo(lensW * 0.15, lensH * 0.25);
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();
}

function drawAttachedRoundGlasses(ctx: CanvasRenderingContext2D, skel: SkeletalAttachmentContext) {
  const { R, eyeLeft, eyeRight } = skel;
  if (!eyeLeft.visible && !eyeRight.visible) return;

  const lx = eyeLeft.x;
  const ly = eyeLeft.y;
  const rx = eyeRight.x;
  const ry = eyeRight.y;
  const radL = R * 0.23 * eyeLeft.scaleX;
  const radR = R * 0.23 * eyeRight.scaleX;

  if (eyeLeft.visible) {
    drawContactShadow(ctx, lx, ly + radL * 0.4, radL * 1.1, radL * 0.4, 0.22);
  }
  if (eyeRight.visible) {
    drawContactShadow(ctx, rx, ry + radR * 0.4, radR * 1.1, radR * 0.4, 0.22);
  }

  ctx.save();
  ctx.strokeStyle = "#475569";
  ctx.lineWidth = R * 0.045;

  // Left circle
  if (eyeLeft.visible) {
    ctx.beginPath();
    ctx.arc(lx, ly, radL, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Right circle
  if (eyeRight.visible) {
    ctx.beginPath();
    ctx.arc(rx, ry, radR, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Arched bridge
  if (eyeLeft.visible && eyeRight.visible) {
    const midX = (lx + rx) / 2;
    const midY = (ly + ry) / 2 - Math.max(radL, radR) * 0.4;
    ctx.beginPath();
    ctx.moveTo(lx + radL * 0.95, ly - radL * 0.2);
    ctx.quadraticCurveTo(midX, midY, rx - radR * 0.95, ry - radR * 0.2);
    ctx.stroke();
  }

  // Lens glass shine
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = R * 0.025;
  if (eyeLeft.visible) {
    ctx.beginPath();
    ctx.arc(lx, ly, radL * 0.72, -Math.PI * 0.75, -Math.PI * 0.35);
    ctx.stroke();
  }
  if (eyeRight.visible) {
    ctx.beginPath();
    ctx.arc(rx, ry, radR * 0.72, -Math.PI * 0.75, -Math.PI * 0.35);
    ctx.stroke();
  }

  ctx.restore();
}

// ── Neckwear Implementations ──────────────────────────────────────────────────

function drawAttachedScarf(ctx: CanvasRenderingContext2D, skel: SkeletalAttachmentContext) {
  const { R, neck, rx, yaw } = skel;
  const nx = neck.x;
  const ny = neck.y;
  const w = rx * 0.95;
  const h = R * 0.26;

  // Contact shadow under scarf onto squircle lower body
  drawContactShadow(ctx, nx, ny + h * 0.5, w * 1.05, h * 0.5, 0.35);

  ctx.save();
  ctx.translate(nx, ny);
  ctx.rotate(yaw * 0.08);

  // Main scarf loop wrapping squircle bottom curve
  ctx.beginPath();
  ctx.roundRect(-w, -h * 0.5, w * 2, h, R * 0.13);
  const scarfGrad = ctx.createLinearGradient(-w, 0, w, 0);
  scarfGrad.addColorStop(0, "#991B1B");
  scarfGrad.addColorStop(0.35, "#EF4444");
  scarfGrad.addColorStop(0.7, "#DC2626");
  scarfGrad.addColorStop(1, "#B91C1C");
  ctx.fillStyle = scarfGrad;
  ctx.fill();

  // Hanging scarf tail on the right side
  const tailX = w * 0.25;
  const tailW = R * 0.32;
  const tailH = R * 0.65;
  ctx.beginPath();
  ctx.roundRect(tailX, h * 0.3, tailW, tailH, [0, 0, R * 0.08, R * 0.08]);
  ctx.fillStyle = "#DC2626";
  ctx.fill();

  // Scarf fringe details
  ctx.fillStyle = "#991B1B";
  ctx.fillRect(tailX, h * 0.3 + tailH - R * 0.08, tailW, R * 0.08);

  ctx.restore();
}

function drawAttachedBow(ctx: CanvasRenderingContext2D, skel: SkeletalAttachmentContext) {
  const { R, apex, rx, ry } = skel;
  // Positioned neatly as a hair ribbon at top right or collar
  const bx = apex.x + rx * 0.42;
  const by = apex.y + ry * 0.18;
  const bSize = R * 0.26;

  drawContactShadow(ctx, bx, by + R * 0.04, bSize * 1.1, bSize * 0.4, 0.22);

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(0.18);

  const pinkGrad = ctx.createLinearGradient(-bSize, 0, bSize, 0);
  pinkGrad.addColorStop(0, "#DB2777");
  pinkGrad.addColorStop(0.5, "#F472B6");
  pinkGrad.addColorStop(1, "#E11D48");
  ctx.fillStyle = pinkGrad;

  // Left wing
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-bSize, -bSize * 0.65);
  ctx.lineTo(-bSize, bSize * 0.65);
  ctx.closePath();
  ctx.fill();

  // Right wing
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(bSize, -bSize * 0.65);
  ctx.lineTo(bSize, bSize * 0.65);
  ctx.closePath();
  ctx.fill();

  // Knot center
  ctx.beginPath();
  ctx.arc(0, 0, bSize * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = "#BE185D";
  ctx.fill();

  ctx.restore();
}
