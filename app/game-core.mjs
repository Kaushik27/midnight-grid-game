export const WORLD = Object.freeze({ width: 2400, height: 1800 });

export const ROAD_BANDS = Object.freeze({
  horizontal: [330, 850, 1370],
  vertical: [420, 990, 1590, 2130],
  width: 170,
});

export const OBSTACLES = Object.freeze([
  { x: 42, y: 42, w: 300, h: 196, label: "PALM MOTEL", accent: "#ff4fa3" },
  { x: 520, y: 46, w: 355, h: 188, label: "LUX MART", accent: "#37e8ff" },
  { x: 1090, y: 40, w: 395, h: 196, label: "NOVA FM", accent: "#ffd84d" },
  { x: 1710, y: 48, w: 330, h: 184, label: "KITE CLUB", accent: "#a77bff" },
  { x: 2230, y: 54, w: 126, h: 174, label: "24H", accent: "#63f5a6" },

  { x: 50, y: 438, w: 286, h: 298, label: "TIDAL AUTO", accent: "#f97755" },
  { x: 528, y: 446, w: 340, h: 286, label: "VOID ARCADE", accent: "#a77bff" },
  { x: 1095, y: 444, w: 386, h: 288, label: "CHANNEL 8", accent: "#37e8ff" },
  { x: 1712, y: 446, w: 324, h: 286, label: "SAKURA", accent: "#ff4fa3" },
  { x: 2228, y: 450, w: 128, h: 278, label: "D-12", accent: "#ffd84d" },

  { x: 48, y: 958, w: 290, h: 294, label: "MERCURY", accent: "#37e8ff" },
  { x: 526, y: 964, w: 344, h: 284, label: "LOWLINE", accent: "#63f5a6" },
  { x: 1090, y: 958, w: 392, h: 292, label: "CINDER", accent: "#f97755" },
  { x: 1710, y: 960, w: 330, h: 286, label: "PIER 9", accent: "#ffd84d" },
  { x: 2230, y: 966, w: 124, h: 278, label: "ICE", accent: "#37e8ff" },

  { x: 46, y: 1482, w: 294, h: 270, label: "DOCKWORKS", accent: "#f97755" },
  { x: 524, y: 1484, w: 348, h: 268, label: "SEAWALL", accent: "#37e8ff" },
  { x: 1092, y: 1484, w: 390, h: 268, label: "CARGO 6", accent: "#ffd84d" },
  { x: 1712, y: 1484, w: 328, h: 268, label: "NIGHT FERRY", accent: "#a77bff" },
  { x: 2230, y: 1484, w: 124, h: 268, label: "PORT", accent: "#63f5a6" },
]);

export const PARKED_CARS = Object.freeze([
  { id: "comet", x: 420, y: 650, angle: Math.PI / 2, color: "#ffca59", name: "Comet" },
  { id: "razor", x: 1130, y: 330, angle: 0, color: "#45d7e8", name: "Razor" },
  { id: "vanta", x: 1590, y: 690, angle: Math.PI / 2, color: "#ff5d8f", name: "Vanta" },
  { id: "monarch", x: 2130, y: 1110, angle: Math.PI / 2, color: "#a88cff", name: "Monarch" },
  { id: "drift", x: 760, y: 1370, angle: 0, color: "#75e49b", name: "Drift" },
]);

export const LANDMARKS = Object.freeze({
  safehouse: { x: 420, y: 565 },
  pickup: { x: 1590, y: 1370 },
  garage: { x: 990, y: 330 },
});

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function vehiclesOverlap(a, b, halfLength = 27, halfWidth = 14) {
  const bounds = (vehicle) => ({
    halfX: Math.abs(Math.cos(vehicle.angle)) * halfLength + Math.abs(Math.sin(vehicle.angle)) * halfWidth,
    halfY: Math.abs(Math.sin(vehicle.angle)) * halfLength + Math.abs(Math.cos(vehicle.angle)) * halfWidth,
  });
  const first = bounds(a);
  const second = bounds(b);
  return (
    Math.abs(a.x - b.x) < first.halfX + second.halfX &&
    Math.abs(a.y - b.y) < first.halfY + second.halfY
  );
}

export function normalizedVector(x, y) {
  const magnitude = Math.hypot(x, y);
  if (!magnitude) return { x: 0, y: 0 };
  return { x: x / magnitude, y: y / magnitude };
}

export function circleIntersectsRect(x, y, radius, rect) {
  const closestX = clamp(x, rect.x, rect.x + rect.w);
  const closestY = clamp(y, rect.y, rect.y + rect.h);
  return Math.hypot(x - closestX, y - closestY) < radius;
}

export function circleHitsObstacles(x, y, radius, obstacles = OBSTACLES) {
  return obstacles.some((rect) => circleIntersectsRect(x, y, radius, rect));
}

export function moveCircleWithCollisions(
  position,
  delta,
  radius,
  obstacles = OBSTACLES,
  bounds = WORLD,
) {
  const next = { x: position.x, y: position.y, collidedX: false, collidedY: false };
  const candidateX = clamp(position.x + delta.x, radius, bounds.width - radius);
  if (!circleHitsObstacles(candidateX, next.y, radius, obstacles)) {
    next.x = candidateX;
  } else {
    next.collidedX = true;
  }

  const candidateY = clamp(position.y + delta.y, radius, bounds.height - radius);
  if (!circleHitsObstacles(next.x, candidateY, radius, obstacles)) {
    next.y = candidateY;
  } else {
    next.collidedY = true;
  }

  if (candidateX !== position.x + delta.x) next.collidedX = true;
  if (candidateY !== position.y + delta.y) next.collidedY = true;
  return next;
}

export function safeExitPoint(vehicle, obstacles = OBSTACLES, bounds = WORLD) {
  const sideX = Math.cos(vehicle.angle + Math.PI / 2);
  const sideY = Math.sin(vehicle.angle + Math.PI / 2);
  const forwardX = Math.cos(vehicle.angle);
  const forwardY = Math.sin(vehicle.angle);
  const offsets = [
    { x: sideX * 58, y: sideY * 58 },
    { x: -sideX * 58, y: -sideY * 58 },
    { x: -forwardX * 66, y: -forwardY * 66 },
    { x: forwardX * 66, y: forwardY * 66 },
  ];

  for (const offset of offsets) {
    const x = vehicle.x + offset.x;
    const y = vehicle.y + offset.y;
    if (x < 18 || x > bounds.width - 18 || y < 18 || y > bounds.height - 18) continue;
    if (!circleHitsObstacles(x, y, 18, obstacles)) return { x, y };
  }
  return null;
}

export function shortestAngle(from, to) {
  let difference = (to - from + Math.PI) % (Math.PI * 2) - Math.PI;
  if (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

export function createSeededRng(seed = 1337) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function advanceMission(mission, event) {
  const transitions = {
    intro: { start: "find-car" },
    "find-car": { enterCar: "pickup", fail: "failed" },
    pickup: { collect: "escape", fail: "failed" },
    escape: { evade: "deliver", fail: "failed" },
    deliver: { deliver: "complete", fail: "failed" },
    complete: { restart: "find-car" },
    failed: { restart: "find-car" },
  };
  return transitions[mission]?.[event] ?? mission;
}

export function updateEscapeProgress(progress, allPoliceFar, deltaSeconds, required = 6) {
  const next = allPoliceFar ? Math.min(required, progress + deltaSeconds) : 0;
  return { progress: next, cleared: next >= required };
}

export function objectiveForMission(mission) {
  return {
    intro: { eyebrow: "A MIDNIGHT GRID STORY", title: "Harbor Heat", detail: "A clean pickup. A dirty exit." },
    "find-car": { eyebrow: "STEP 01", title: "Find a ride", detail: "Get close to a parked car and press E." },
    pickup: { eyebrow: "STEP 02", title: "Collect the package", detail: "Drive to the cyan marker at Pier 9." },
    escape: { eyebrow: "STEP 03", title: "Lose the tail", detail: "Create distance and stay unseen for 6 seconds." },
    deliver: { eyebrow: "FINAL STEP", title: "Reach the garage", detail: "Deliver the package to the amber marker." },
    complete: { eyebrow: "RUN COMPLETE", title: "Harbor secured", detail: "The city never saw you coming." },
    failed: { eyebrow: "RUN FAILED", title: "The grid closed in", detail: "Reset and run it cleaner." },
  }[mission];
}
