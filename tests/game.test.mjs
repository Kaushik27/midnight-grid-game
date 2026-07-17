import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  OBSTACLES,
  WORLD,
  advanceMission,
  circleHitsObstacles,
  createSeededRng,
  formatTime,
  moveCircleWithCollisions,
  normalizedVector,
  safeExitPoint,
  updateEscapeProgress,
  vehiclesOverlap,
} from "../app/game-core.mjs";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Midnight Grid — Harbor Heat<\/title>/i);
  assert.match(html, /data-testid="game-shell"/);
  assert.match(html, /data-testid="game-canvas"/);
  assert.match(html, /START THE RUN/);
  assert.match(html, /HARBOR HEAT/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("normalizes diagonal input without a speed boost", () => {
  const vector = normalizedVector(1, 1);
  assert.ok(Math.abs(Math.hypot(vector.x, vector.y) - 1) < 1e-10);
  assert.deepEqual(normalizedVector(0, 0), { x: 0, y: 0 });
});

test("slides along obstacles and stays inside world bounds", () => {
  const building = OBSTACLES[0];
  const start = { x: building.x - 20, y: building.y + building.h / 2 };
  const moved = moveCircleWithCollisions(start, { x: 50, y: 26 }, 12);
  assert.equal(moved.collidedX, true);
  assert.ok(moved.y > start.y);
  assert.equal(circleHitsObstacles(moved.x, moved.y, 12), false);

  const bounded = moveCircleWithCollisions({ x: 15, y: 15 }, { x: -100, y: -100 }, 12);
  assert.equal(bounded.x, 12);
  assert.equal(bounded.y, 12);
  assert.ok(bounded.x <= WORLD.width && bounded.y <= WORLD.height);
});

test("chooses a safe vehicle exit point", () => {
  const exit = safeExitPoint({ x: 420, y: 650, angle: Math.PI / 2 });
  assert.ok(exit);
  assert.equal(circleHitsObstacles(exit.x, exit.y, 18), false);

  const edgeVehicle = { x: 25, y: 850, angle: Math.PI / 2 };
  const edgeExit = safeExitPoint(edgeVehicle);
  assert.ok(edgeExit);
  assert.ok(distanceBetween(edgeVehicle, edgeExit) >= 58);
});

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

test("enforces mission order and one-way completion", () => {
  let mission = advanceMission("intro", "start");
  assert.equal(mission, "find-car");
  assert.equal(advanceMission(mission, "fail"), "failed");
  assert.equal(advanceMission(mission, "collect"), "find-car");
  mission = advanceMission(mission, "enterCar");
  mission = advanceMission(mission, "collect");
  assert.equal(mission, "escape");
  assert.equal(advanceMission(mission, "deliver"), "escape");
  mission = advanceMission(mission, "evade");
  mission = advanceMission(mission, "deliver");
  assert.equal(mission, "complete");
});

test("detects real vehicle contact without adjacent-lane phantom hits", () => {
  const parked = { x: 420, y: 650, angle: Math.PI / 2 };
  const adjacentLane = { x: 384, y: 650, angle: Math.PI / 2 };
  const overlapping = { x: 399, y: 650, angle: Math.PI / 2 };
  assert.equal(vehiclesOverlap(parked, adjacentLane), false);
  assert.equal(vehiclesOverlap(parked, overlapping), true);
});

test("escape progress resets when police reacquire the player", () => {
  const started = updateEscapeProgress(0, true, 2, 6);
  assert.equal(started.progress, 2);
  const reset = updateEscapeProgress(started.progress, false, 0.1, 6);
  assert.equal(reset.progress, 0);
  const complete = updateEscapeProgress(5.8, true, 0.3, 6);
  assert.equal(complete.cleared, true);
  assert.equal(complete.progress, 6);
});

test("seeded world details and clock formatting are deterministic", () => {
  const first = createSeededRng(42);
  const second = createSeededRng(42);
  assert.deepEqual([first(), first(), first()], [second(), second(), second()]);
  assert.equal(formatTime(90), "1:30");
  assert.equal(formatTime(-10), "0:00");
});

test("keeps the starter preview removed from the product", async () => {
  const [page, layout, styles, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /MidnightGridGame/);
  assert.match(layout, /Midnight Grid — Harbor Heat/);
  assert.match(styles, /\.touch-controls/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page + layout, /codex-preview|_sites-preview/);
});

test("builds a GitHub Pages artifact with the repository base path", async () => {
  const [html, packageJson, workflow] = await Promise.all([
    readFile(new URL("../dist-pages/index.html", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(
      new URL("../.github/workflows/deploy-pages.yml", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(html, /\/midnight-grid-game\/assets\//);
  assert.match(packageJson, /"build:pages": "vite build --config vite\.pages\.config\.ts"/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /path: dist-pages/);
});
