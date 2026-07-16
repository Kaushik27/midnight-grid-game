"use client";

import { useEffect, useRef, useState } from "react";
import {
  LANDMARKS,
  OBSTACLES,
  PARKED_CARS,
  ROAD_BANDS,
  WORLD,
  advanceMission,
  circleHitsObstacles,
  clamp,
  createSeededRng,
  distance,
  formatTime,
  moveCircleWithCollisions,
  normalizedVector,
  objectiveForMission,
  safeExitPoint,
  shortestAngle,
  updateEscapeProgress,
  vehiclesOverlap,
} from "./game-core.mjs";

type Mission =
  | "intro"
  | "find-car"
  | "pickup"
  | "escape"
  | "deliver"
  | "complete"
  | "failed";

type Overlay = "intro" | "pause" | "complete" | "failed" | null;

type Player = {
  x: number;
  y: number;
  angle: number;
  health: number;
  vehicleId: string | null;
};

type Vehicle = {
  id: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  color: string;
  name: string;
  health: number;
  driven: boolean;
};

type Police = {
  id: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  spin: number;
};

type TrafficCar = {
  id: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  axis: "h" | "v";
  direction: 1 | -1;
  color: string;
};

type Pedestrian = {
  x: number;
  y: number;
  angle: number;
  speed: number;
  color: string;
  turnIn: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

type Skid = { x: number; y: number; angle: number; life: number };

type GameState = {
  mission: Mission;
  paused: boolean;
  muted: boolean;
  player: Player;
  vehicles: Vehicle[];
  police: Police[];
  traffic: TrafficCar[];
  pedestrians: Pedestrian[];
  particles: Particle[];
  skids: Skid[];
  timer: number;
  escapeProgress: number;
  wanted: number;
  cash: number;
  score: number;
  best: number;
  camera: { x: number; y: number; shake: number };
  impactCooldown: number;
  toast: { text: string; until: number } | null;
};

type Hud = {
  mission: Mission;
  eyebrow: string;
  title: string;
  detail: string;
  timer: number;
  health: number;
  speed: number;
  wanted: number;
  escapeProgress: number;
  cash: number;
  score: number;
  best: number;
  vehicle: string | null;
  prompt: string;
  muted: boolean;
  toast: string | null;
};

type EngineActions = {
  start: () => void;
  restart: () => void;
  pause: () => void;
  toggleMute: () => void;
  press: (code: string) => void;
  release: (code: string) => void;
};

type GameDebug = {
  getState: () => Record<string, unknown>;
  setScenario: (scenario: "pickup" | "escape" | "deliver" | "fail") => void;
};

const ESCAPE_REQUIRED = 6;
const POLICE_SAFE_DISTANCE = 520;
const MISSION_SECONDS = 90;
const CAR_RADIUS = 25;
const PLAYER_RADIUS = 12;

const EMPTY_ACTIONS: EngineActions = {
  start() {},
  restart() {},
  pause() {},
  toggleMute() {},
  press() {},
  release() {},
};

function createTraffic(): TrafficCar[] {
  return [
    { id: "t1", x: 80, y: 294, angle: 0, speed: 92, axis: "h", direction: 1, color: "#506072" },
    { id: "t2", x: 1840, y: 366, angle: Math.PI, speed: 74, axis: "h", direction: -1, color: "#7d4b62" },
    { id: "t3", x: 1380, y: 814, angle: 0, speed: 88, axis: "h", direction: 1, color: "#576d5d" },
    { id: "t4", x: 2250, y: 1406, angle: Math.PI, speed: 104, axis: "h", direction: -1, color: "#665d80" },
    { id: "t5", x: 384, y: 1080, angle: -Math.PI / 2, speed: 78, axis: "v", direction: -1, color: "#81654b" },
    { id: "t6", x: 1026, y: 140, angle: Math.PI / 2, speed: 84, axis: "v", direction: 1, color: "#486b78" },
    { id: "t7", x: 1554, y: 1220, angle: -Math.PI / 2, speed: 96, axis: "v", direction: -1, color: "#784a4a" },
    { id: "t8", x: 2166, y: 680, angle: Math.PI / 2, speed: 70, axis: "v", direction: 1, color: "#4f745e" },
  ];
}

function createPedestrians(): Pedestrian[] {
  const random = createSeededRng(4021);
  const colors = ["#edc78f", "#df7e8c", "#73c6d4", "#b58de3", "#f0b05f", "#7dcb91"];
  const pedestrians: Pedestrian[] = [];

  while (pedestrians.length < 24) {
    const horizontal = random() > 0.5;
    const band = horizontal
      ? ROAD_BANDS.horizontal[Math.floor(random() * ROAD_BANDS.horizontal.length)]
      : ROAD_BANDS.vertical[Math.floor(random() * ROAD_BANDS.vertical.length)];
    const x = horizontal ? 35 + random() * (WORLD.width - 70) : band + (random() > 0.5 ? 103 : -103);
    const y = horizontal ? band + (random() > 0.5 ? 103 : -103) : 35 + random() * (WORLD.height - 70);
    if (!circleHitsObstacles(x, y, 10)) {
      pedestrians.push({
        x,
        y,
        angle: random() * Math.PI * 2,
        speed: 16 + random() * 18,
        color: colors[Math.floor(random() * colors.length)],
        turnIn: 0.8 + random() * 3,
      });
    }
  }
  return pedestrians;
}

function createGameState(best = 0, muted = false): GameState {
  return {
    mission: "intro",
    paused: true,
    muted,
    player: { ...LANDMARKS.safehouse, angle: Math.PI / 2, health: 100, vehicleId: null },
    vehicles: PARKED_CARS.map((car) => ({ ...car, speed: 0, health: 100, driven: false })),
    police: [],
    traffic: createTraffic(),
    pedestrians: createPedestrians(),
    particles: [],
    skids: [],
    timer: MISSION_SECONDS,
    escapeProgress: 0,
    wanted: 0,
    cash: 0,
    score: 0,
    best,
    camera: { x: LANDMARKS.safehouse.x, y: LANDMARKS.safehouse.y, shake: 0 },
    impactCooldown: 0,
    toast: null,
  };
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawVehicle(
  context: CanvasRenderingContext2D,
  vehicle: { x: number; y: number; angle: number; color: string },
  options: { police?: boolean; headlights?: boolean; damaged?: boolean } = {},
  pulse = 0,
) {
  context.save();
  context.translate(vehicle.x, vehicle.y);
  context.rotate(vehicle.angle);

  context.fillStyle = "rgba(0,0,0,.38)";
  drawRoundedRect(context, -25, -12, 55, 29, 8);
  context.fill();

  if (options.headlights) {
    const glow = context.createLinearGradient(20, 0, 80, 0);
    glow.addColorStop(0, "rgba(255,244,190,.24)");
    glow.addColorStop(1, "rgba(255,244,190,0)");
    context.fillStyle = glow;
    context.beginPath();
    context.moveTo(20, -10);
    context.lineTo(86, -24);
    context.lineTo(86, 24);
    context.lineTo(20, 10);
    context.closePath();
    context.fill();
  }

  context.fillStyle = options.damaged ? "#4d4348" : vehicle.color;
  drawRoundedRect(context, -27, -14, 54, 28, 7);
  context.fill();

  context.fillStyle = "#162430";
  drawRoundedRect(context, -10, -11, 24, 22, 5);
  context.fill();
  context.fillStyle = "rgba(110,193,219,.42)";
  context.fillRect(-7, -9, 7, 18);
  context.fillRect(4, -9, 7, 18);

  context.fillStyle = "#f8edc5";
  context.fillRect(21, -10, 4, 7);
  context.fillRect(21, 3, 4, 7);
  context.fillStyle = "#ff4b63";
  context.fillRect(-26, -10, 3, 7);
  context.fillRect(-26, 3, 3, 7);

  context.fillStyle = "#0c1015";
  context.fillRect(-18, -17, 12, 4);
  context.fillRect(9, -17, 12, 4);
  context.fillRect(-18, 13, 12, 4);
  context.fillRect(9, 13, 12, 4);

  if (options.police) {
    context.fillStyle = "#e8edf2";
    context.fillRect(-22, -14, 16, 28);
    context.fillStyle = pulse > 0 ? "#ff385c" : "#3a73ff";
    context.shadowBlur = 14;
    context.shadowColor = context.fillStyle;
    context.fillRect(-3, -14, 6, 12);
    context.fillStyle = pulse > 0 ? "#3a73ff" : "#ff385c";
    context.shadowColor = context.fillStyle;
    context.fillRect(-3, 2, 6, 12);
    context.shadowBlur = 0;
  }

  context.restore();
}

function drawMarker(
  context: CanvasRenderingContext2D,
  point: { x: number; y: number },
  color: string,
  label: string,
  now: number,
) {
  const pulse = (Math.sin(now * 0.004) + 1) / 2;
  context.save();
  context.translate(point.x, point.y);
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.globalAlpha = 0.24 + pulse * 0.25;
  context.beginPath();
  context.arc(0, 0, 42 + pulse * 18, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 0.92;
  context.fillStyle = `${color}2d`;
  context.beginPath();
  context.arc(0, 0, 35, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = color;
  context.beginPath();
  context.arc(0, 0, 26, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(0, -54 - pulse * 6);
  context.lineTo(-9, -69 - pulse * 6);
  context.lineTo(9, -69 - pulse * 6);
  context.closePath();
  context.fill();
  context.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textAlign = "center";
  context.fillText(label, 0, 63);
  context.restore();
}

function drawCity(context: CanvasRenderingContext2D, now: number) {
  context.fillStyle = "#10151a";
  context.fillRect(0, 0, WORLD.width, WORLD.height);

  const roadWidth = ROAD_BANDS.width;
  context.fillStyle = "#171e24";
  for (const y of ROAD_BANDS.horizontal) context.fillRect(0, y - roadWidth / 2, WORLD.width, roadWidth);
  for (const x of ROAD_BANDS.vertical) context.fillRect(x - roadWidth / 2, 0, roadWidth, WORLD.height);

  context.save();
  context.setLineDash([20, 23]);
  context.lineWidth = 2;
  context.strokeStyle = "rgba(233,219,160,.18)";
  for (const y of ROAD_BANDS.horizontal) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(WORLD.width, y);
    context.stroke();
  }
  for (const x of ROAD_BANDS.vertical) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, WORLD.height);
    context.stroke();
  }
  context.restore();

  context.fillStyle = "rgba(215,232,231,.18)";
  for (const x of ROAD_BANDS.vertical) {
    for (const y of ROAD_BANDS.horizontal) {
      for (let stripe = -56; stripe <= 56; stripe += 16) {
        context.fillRect(x - 68, y + stripe - 4, 18, 6);
        context.fillRect(x + 50, y + stripe - 4, 18, 6);
      }
    }
  }

  for (const building of OBSTACLES) {
    context.fillStyle = "rgba(0,0,0,.42)";
    drawRoundedRect(context, building.x + 11, building.y + 15, building.w, building.h, 12);
    context.fill();

    const roof = context.createLinearGradient(building.x, building.y, building.x, building.y + building.h);
    roof.addColorStop(0, "#252e35");
    roof.addColorStop(1, "#192127");
    context.fillStyle = roof;
    drawRoundedRect(context, building.x, building.y, building.w, building.h, 10);
    context.fill();
    context.strokeStyle = "rgba(255,255,255,.055)";
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = "#11181d";
    for (let wx = building.x + 22; wx < building.x + building.w - 16; wx += 42) {
      for (let wy = building.y + 25; wy < building.y + building.h - 18; wy += 38) {
        context.globalAlpha = ((wx + wy) / 38) % 3 === 0 ? 0.42 : 0.16;
        context.fillRect(wx, wy, 17, 10);
      }
    }
    context.globalAlpha = 1;

    const signWidth = Math.min(building.w - 32, 150);
    context.fillStyle = "rgba(8,12,16,.86)";
    drawRoundedRect(context, building.x + 16, building.y + building.h - 44, signWidth, 28, 4);
    context.fill();
    context.fillStyle = building.accent;
    context.shadowBlur = 9 + Math.sin(now * 0.002 + building.x) * 2;
    context.shadowColor = building.accent;
    context.font = "700 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "left";
    context.fillText(building.label, building.x + 26, building.y + building.h - 25);
    context.shadowBlur = 0;

    context.fillStyle = "#11171c";
    context.fillRect(building.x + building.w - 52, building.y + 22, 30, 22);
    context.strokeStyle = "rgba(255,255,255,.09)";
    context.strokeRect(building.x + building.w - 52, building.y + 22, 30, 22);
  }

  context.fillStyle = "rgba(68,197,219,.08)";
  context.fillRect(0, 1760, WORLD.width, 40);
  context.strokeStyle = "rgba(79,218,236,.16)";
  for (let x = 0; x < WORLD.width; x += 58) {
    context.beginPath();
    context.moveTo(x, 1770 + Math.sin(now * 0.002 + x) * 4);
    context.lineTo(x + 36, 1770 + Math.cos(now * 0.002 + x) * 4);
    context.stroke();
  }

  for (const x of ROAD_BANDS.vertical) {
    for (const y of [110, 540, 1080, 1560]) {
      const glow = context.createRadialGradient(x - 62, y, 0, x - 62, y, 40);
      glow.addColorStop(0, "rgba(255,218,126,.14)");
      glow.addColorStop(1, "rgba(255,218,126,0)");
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x - 62, y, 40, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#ffd98a";
      context.beginPath();
      context.arc(x - 62, y, 2.5, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function objectivePoint(mission: Mission) {
  if (mission === "find-car") return PARKED_CARS[0];
  if (mission === "pickup") return LANDMARKS.pickup;
  if (mission === "deliver") return LANDMARKS.garage;
  return null;
}

const initialObjective = objectiveForMission("intro");
const initialHud: Hud = {
  mission: "intro",
  ...initialObjective,
  timer: MISSION_SECONDS,
  health: 100,
  speed: 0,
  wanted: 0,
  escapeProgress: 0,
  cash: 0,
  score: 0,
  best: 0,
  vehicle: null,
  prompt: "PRESS START TO ENTER THE GRID",
  muted: false,
  toast: null,
};

export default function MidnightGridGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<EngineActions>(EMPTY_ACTIONS);
  const [hud, setHud] = useState<Hud>(initialHud);
  const [overlay, setOverlay] = useState<Overlay>("intro");

  useEffect(() => {
    const canvas = canvasRef.current;
    const minimap = minimapRef.current;
    const shell = shellRef.current;
    if (!canvas || !minimap || !shell) return;

    const context = canvas.getContext("2d");
    const minimapContext = minimap.getContext("2d");
    if (!context || !minimapContext) return;

    const random = createSeededRng(9019);
    let storedBest = 0;
    try {
      storedBest = Number(localStorage.getItem("midnight-grid-best") ?? 0) || 0;
    } catch {
      storedBest = 0;
    }

    let state = createGameState(storedBest);
    const keys = new Set<string>();
    const impulses = new Map<string, number>();
    const viewport = { width: 1280, height: 720, dpr: 1 };
    let animationFrame = 0;
    let lastFrame = performance.now();
    let hudAccumulator = 0;
    let audio:
      | {
          context: AudioContext;
          engine: OscillatorNode;
          engineGain: GainNode;
          siren: OscillatorNode;
          sirenGain: GainNode;
        }
      | null = null;

    const currentVehicle = () => state.vehicles.find((vehicle) => vehicle.id === state.player.vehicleId) ?? null;

    const ensureAudio = () => {
      if (audio) {
        void audio.context.resume();
        return;
      }
      try {
        const AudioContextClass = window.AudioContext;
        const audioContext = new AudioContextClass();
        const engine = audioContext.createOscillator();
        const engineGain = audioContext.createGain();
        const siren = audioContext.createOscillator();
        const sirenGain = audioContext.createGain();
        engine.type = "sawtooth";
        engine.frequency.value = 52;
        engineGain.gain.value = 0;
        siren.type = "sine";
        siren.frequency.value = 620;
        sirenGain.gain.value = 0;
        engine.connect(engineGain).connect(audioContext.destination);
        siren.connect(sirenGain).connect(audioContext.destination);
        engine.start();
        siren.start();
        audio = { context: audioContext, engine, engineGain, siren, sirenGain };
      } catch {
        audio = null;
      }
    };

    const playTone = (frequency: number, duration = 0.12, volume = 0.05) => {
      if (state.muted) return;
      ensureAudio();
      if (!audio) return;
      const oscillator = audio.context.createOscillator();
      const gain = audio.context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = "triangle";
      gain.gain.setValueAtTime(volume, audio.context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.context.currentTime + duration);
      oscillator.connect(gain).connect(audio.context.destination);
      oscillator.start();
      oscillator.stop(audio.context.currentTime + duration);
    };

    const toast = (text: string) => {
      state.toast = { text, until: performance.now() + 2800 };
      hudAccumulator = 1;
    };

    const resize = () => {
      const rect = shell.getBoundingClientRect();
      viewport.width = Math.max(320, rect.width);
      viewport.height = Math.max(420, rect.height);
      viewport.dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(viewport.width * viewport.dpr);
      canvas.height = Math.round(viewport.height * viewport.dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const mapRect = minimap.getBoundingClientRect();
      minimap.width = Math.max(1, Math.round(mapRect.width * viewport.dpr));
      minimap.height = Math.max(1, Math.round(mapRect.height * viewport.dpr));
    };

    const nearestVehicle = () => {
      let nearest: Vehicle | null = null;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const vehicle of state.vehicles) {
        const candidateDistance = distance(state.player, vehicle);
        if (candidateDistance < nearestDistance && vehicle.health > 0) {
          nearest = vehicle;
          nearestDistance = candidateDistance;
        }
      }
      return { vehicle: nearest, distance: nearestDistance };
    };

    const syncHud = () => {
      const vehicle = currentVehicle();
      const objective = objectiveForMission(state.mission);
      const nearest = nearestVehicle();
      const prompt = vehicle
        ? "E  EXIT VEHICLE   •   SPACE  HANDBRAKE"
        : nearest.distance <= 90
          ? `E  ENTER ${nearest.vehicle?.name.toUpperCase() ?? "VEHICLE"}`
          : "WASD  MOVE   •   SHIFT  SPRINT";
      setHud({
        mission: state.mission,
        ...objective,
        timer: state.timer,
        health: vehicle?.health ?? state.player.health,
        speed: Math.round(Math.abs(vehicle?.speed ?? 0) * 0.32),
        wanted: state.wanted,
        escapeProgress: state.escapeProgress,
        cash: state.cash,
        score: state.score,
        best: state.best,
        vehicle: vehicle?.name ?? null,
        prompt,
        muted: state.muted,
        toast: state.toast && state.toast.until > performance.now() ? state.toast.text : null,
      });
    };

    const burst = (x: number, y: number, color: string, count: number, force = 80) => {
      for (let index = 0; index < count; index += 1) {
        const angle = random() * Math.PI * 2;
        const speed = force * (0.35 + random() * 0.65);
        state.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0.35 + random() * 0.5,
          maxLife: 0.85,
          size: 2 + random() * 4,
          color,
        });
      }
      if (state.particles.length > 180) state.particles.splice(0, state.particles.length - 180);
    };

    const spawnPolice = () => {
      state.police = [
        { id: "unit-7", x: 1000, y: 1370, angle: 0, speed: 180, spin: 1 },
        { id: "unit-12", x: 2130, y: 900, angle: Math.PI / 2, speed: 180, spin: -1 },
      ];
    };

    const transition = (event: string) => {
      const next = advanceMission(state.mission, event) as Mission;
      if (next === state.mission) return;
      state.mission = next;
      if (next === "pickup") {
        toast("Ride acquired • Pier 9 marked");
        playTone(520);
      } else if (next === "escape") {
        state.timer = MISSION_SECONDS;
        state.wanted = 2;
        state.escapeProgress = 0;
        spawnPolice();
        toast("Package secured • Police incoming");
        playTone(260, 0.28, 0.07);
      } else if (next === "deliver") {
        state.wanted = 0;
        state.police = [];
        state.escapeProgress = ESCAPE_REQUIRED;
        toast("Tail lost • Garage is open");
        playTone(740, 0.22, 0.06);
      } else if (next === "complete") {
        const vehicle = currentVehicle();
        state.score = Math.round(1500 + state.timer * 22 + (vehicle?.health ?? 0) * 12);
        state.cash += state.score;
        state.best = Math.max(state.best, state.score);
        try {
          localStorage.setItem("midnight-grid-best", String(state.best));
        } catch {
          // Device storage is an optional convenience only.
        }
        state.paused = true;
        setOverlay("complete");
        burst(state.player.x, state.player.y, "#ffd65a", 30, 130);
        playTone(880, 0.5, 0.07);
      } else if (next === "failed") {
        state.paused = true;
        state.wanted = 0;
        state.police = [];
        setOverlay("failed");
        playTone(150, 0.45, 0.07);
      }
      syncHud();
    };

    const enterOrExitVehicle = () => {
      if (state.paused || state.mission === "intro" || state.mission === "complete" || state.mission === "failed") return;
      const active = currentVehicle();
      if (active) {
        if (Math.abs(active.speed) > 42) {
          toast("Slow down before exiting");
          return;
        }
        const exit = safeExitPoint(active);
        if (!exit) {
          toast("No safe space to exit");
          return;
        }
        state.player.vehicleId = null;
        state.player.x = exit.x;
        state.player.y = exit.y;
        state.player.angle = active.angle;
        active.speed = 0;
        playTone(330, 0.08, 0.03);
      } else {
        const nearest = nearestVehicle();
        if (!nearest.vehicle || nearest.distance > 90) {
          toast("Move closer to a vehicle");
          return;
        }
        state.player.vehicleId = nearest.vehicle.id;
        state.player.x = nearest.vehicle.x;
        state.player.y = nearest.vehicle.y;
        state.player.angle = nearest.vehicle.angle;
        nearest.vehicle.driven = true;
        if (state.mission === "find-car") transition("enterCar");
        playTone(420, 0.09, 0.035);
      }
      syncHud();
    };

    const startRun = () => {
      const best = state.best;
      const muted = state.muted;
      state = createGameState(best, muted);
      state.mission = "find-car";
      state.paused = false;
      keys.clear();
      impulses.clear();
      setOverlay(null);
      ensureAudio();
      toast("Find a ride and reach Pier 9");
      syncHud();
      canvas.focus();
    };

    const togglePause = () => {
      if (state.mission === "intro" || state.mission === "complete" || state.mission === "failed") return;
      state.paused = !state.paused;
      keys.clear();
      setOverlay(state.paused ? "pause" : null);
      syncHud();
    };

    const toggleMute = () => {
      state.muted = !state.muted;
      syncHud();
    };

    const press = (code: string) => {
      keys.add(code);
      impulses.set(code, 0.2);
      if (code === "KeyE") enterOrExitVehicle();
      if (code === "KeyP" || code === "Escape") togglePause();
      if (code === "KeyM") toggleMute();
      if (code === "KeyR" && (state.mission === "complete" || state.mission === "failed")) startRun();
    };

    const release = (code: string) => {
      keys.delete(code);
    };

    actionsRef.current = {
      start: startRun,
      restart: startRun,
      pause: togglePause,
      toggleMute,
      press,
      release,
    };

    const held = (...codes: string[]) => codes.some((code) => keys.has(code) || (impulses.get(code) ?? 0) > 0);

    const updatePedestrians = (delta: number) => {
      const focus = currentVehicle() ?? state.player;
      for (const person of state.pedestrians) {
        person.turnIn -= delta;
        const danger = distance(person, focus);
        if (danger < 105 && currentVehicle()) {
          person.angle = Math.atan2(person.y - focus.y, person.x - focus.x);
          person.speed = 74;
          person.turnIn = 0.35;
        } else if (person.turnIn <= 0) {
          person.angle += (random() - 0.5) * 1.7;
          person.speed = 16 + random() * 19;
          person.turnIn = 1.5 + random() * 3;
        }
        const moved = moveCircleWithCollisions(
          person,
          { x: Math.cos(person.angle) * person.speed * delta, y: Math.sin(person.angle) * person.speed * delta },
          7,
        );
        person.x = moved.x;
        person.y = moved.y;
        if (moved.collidedX || moved.collidedY) {
          person.angle += Math.PI * (0.6 + random() * 0.8);
          person.turnIn = 0.3;
        }
      }
    };

    const updateTraffic = (delta: number) => {
      for (const traffic of state.traffic) {
        if (traffic.axis === "h") {
          traffic.x += traffic.speed * traffic.direction * delta;
          if (traffic.direction > 0 && traffic.x > WORLD.width + 70) traffic.x = -70;
          if (traffic.direction < 0 && traffic.x < -70) traffic.x = WORLD.width + 70;
        } else {
          traffic.y += traffic.speed * traffic.direction * delta;
          if (traffic.direction > 0 && traffic.y > WORLD.height + 70) traffic.y = -70;
          if (traffic.direction < 0 && traffic.y < -70) traffic.y = WORLD.height + 70;
        }

        if (!currentVehicle() && distance(state.player, traffic) < 30) {
          damagePlayer(16, true);
          const away = normalizedVector(state.player.x - traffic.x, state.player.y - traffic.y);
          const moved = moveCircleWithCollisions(
            state.player,
            { x: away.x * 24, y: away.y * 24 },
            PLAYER_RADIUS,
          );
          state.player.x = moved.x;
          state.player.y = moved.y;
        }
      }
    };

    const damageVehicle = (amount: number, vehicle: Vehicle, collision = false) => {
      if (state.impactCooldown > 0 && collision) return;
      vehicle.health = clamp(vehicle.health - amount, 0, 100);
      if (collision) {
        state.impactCooldown = 0.25;
        state.camera.shake = Math.min(12, state.camera.shake + amount * 0.65);
        burst(vehicle.x, vehicle.y, "#ffc465", Math.ceil(amount / 2), 95);
        playTone(110, 0.08, 0.035);
      }
    };

    const damagePlayer = (amount: number, collision = false) => {
      if (state.impactCooldown > 0 && collision) return;
      state.player.health = clamp(state.player.health - amount, 0, 100);
      if (collision) {
        state.impactCooldown = 0.35;
        state.camera.shake = Math.min(10, state.camera.shake + amount * 0.45);
        burst(state.player.x, state.player.y, "#ff6f7f", 7, 72);
        playTone(95, 0.09, 0.03);
      }
    };

    const updateOnFoot = (delta: number) => {
      const horizontal = Number(held("KeyD", "ArrowRight")) - Number(held("KeyA", "ArrowLeft"));
      const vertical = Number(held("KeyS", "ArrowDown")) - Number(held("KeyW", "ArrowUp"));
      const direction = normalizedVector(horizontal, vertical);
      const moving = direction.x !== 0 || direction.y !== 0;
      const speed = held("ShiftLeft", "ShiftRight") ? 235 : 150;
      if (moving) state.player.angle = Math.atan2(direction.y, direction.x);
      const moved = moveCircleWithCollisions(
        state.player,
        { x: direction.x * speed * delta, y: direction.y * speed * delta },
        PLAYER_RADIUS,
      );
      state.player.x = moved.x;
      state.player.y = moved.y;
    };

    const updatePlayerVehicle = (delta: number, vehicle: Vehicle) => {
      const throttle = Number(held("KeyW", "ArrowUp")) - Number(held("KeyS", "ArrowDown"));
      const steering = Number(held("KeyD", "ArrowRight")) - Number(held("KeyA", "ArrowLeft"));
      const handbrake = held("Space");
      if (throttle > 0) vehicle.speed += 320 * delta;
      if (throttle < 0) vehicle.speed -= (vehicle.speed > 20 ? 510 : 225) * delta;
      const drag = handbrake ? 3.8 : throttle === 0 ? 1.35 : 0.38;
      vehicle.speed *= Math.max(0, 1 - drag * delta);
      vehicle.speed = clamp(vehicle.speed, -135, 385);

      if (steering && Math.abs(vehicle.speed) > 5) {
        const turnStrength = (handbrake ? 2.35 : 1.62) * clamp(Math.abs(vehicle.speed) / 120, 0.28, 1.25);
        vehicle.angle += steering * turnStrength * Math.sign(vehicle.speed) * delta;
      }

      const travel = vehicle.speed * delta;
      const steps = Math.max(1, Math.ceil(Math.abs(travel) / 12));
      let collided = false;
      for (let step = 0; step < steps; step += 1) {
        const moved = moveCircleWithCollisions(
          vehicle,
          {
            x: (Math.cos(vehicle.angle) * travel) / steps,
            y: (Math.sin(vehicle.angle) * travel) / steps,
          },
          CAR_RADIUS,
        );
        vehicle.x = moved.x;
        vehicle.y = moved.y;
        collided ||= moved.collidedX || moved.collidedY;
        if (collided) break;
      }

      if (collided) {
        const severity = clamp(Math.abs(vehicle.speed) / 22, 2, 13);
        damageVehicle(severity, vehicle, true);
        vehicle.speed *= -0.22;
      }

      for (const traffic of state.traffic) {
        const relativeSpeed = Math.abs(vehicle.speed) + traffic.speed;
        if (vehiclesOverlap(vehicle, traffic) && relativeSpeed > 35) {
          damageVehicle(clamp(relativeSpeed / 30, 2, 12), vehicle, true);
          vehicle.speed *= -0.25;
          break;
        }
      }

      if (handbrake && Math.abs(vehicle.speed) > 120 && Math.abs(steering) > 0) {
        state.skids.push({ x: vehicle.x, y: vehicle.y, angle: vehicle.angle, life: 1 });
        if (state.skids.length > 120) state.skids.splice(0, state.skids.length - 120);
        if (random() > 0.58) burst(vehicle.x - Math.cos(vehicle.angle) * 20, vehicle.y - Math.sin(vehicle.angle) * 20, "#9ba6ac", 1, 24);
      }

      state.player.x = vehicle.x;
      state.player.y = vehicle.y;
      state.player.angle = vehicle.angle;
    };

    const updatePolice = (delta: number) => {
      const target = currentVehicle() ?? state.player;
      for (const unit of state.police) {
        const desired = Math.atan2(target.y - unit.y, target.x - unit.x);
        const turn = clamp(shortestAngle(unit.angle, desired), -2.4 * delta, 2.4 * delta);
        unit.angle += turn;
        unit.speed = clamp(unit.speed + 210 * delta, 90, 315);
        const moved = moveCircleWithCollisions(
          unit,
          { x: Math.cos(unit.angle) * unit.speed * delta, y: Math.sin(unit.angle) * unit.speed * delta },
          CAR_RADIUS,
        );
        unit.x = moved.x;
        unit.y = moved.y;
        if (moved.collidedX || moved.collidedY) {
          unit.angle += unit.spin * (0.9 + random() * 0.6);
          unit.speed *= 0.45;
        }

        const targetVehicle = currentVehicle();
        if (targetVehicle && distance(unit, targetVehicle) < 46) {
          damageVehicle(8 * delta, targetVehicle);
          state.camera.shake = Math.max(state.camera.shake, 2.5);
        } else if (!targetVehicle && distance(unit, state.player) < 39) {
          damagePlayer(14 * delta);
          state.camera.shake = Math.max(state.camera.shake, 2);
        }
      }

      if (state.police.length > 1 && distance(state.police[0], state.police[1]) < 52) {
        state.police[0].angle -= 0.7 * delta;
        state.police[1].angle += 0.7 * delta;
      }
    };

    const updateMission = (delta: number) => {
      const vehicle = currentVehicle();
      if (!["intro", "complete", "failed"].includes(state.mission) && state.player.health <= 0) {
        transition("fail");
        return;
      }

      if (state.mission === "pickup" && vehicle && distance(vehicle, LANDMARKS.pickup) < 76) {
        transition("collect");
      }

      if (["escape", "deliver"].includes(state.mission)) {
        state.timer = Math.max(0, state.timer - delta);
        const outOfHealth = vehicle ? vehicle.health <= 0 : state.player.health <= 0;
        if (state.timer <= 0 || outOfHealth) {
          transition("fail");
          return;
        }
      }

      if (state.mission === "escape") {
        const focus = vehicle ?? state.player;
        const allFar = state.police.every((unit) => distance(unit, focus) > POLICE_SAFE_DISTANCE);
        const escape = updateEscapeProgress(state.escapeProgress, allFar, delta, ESCAPE_REQUIRED);
        state.escapeProgress = escape.progress;
        if (escape.cleared) transition("evade");
      }

      if (state.mission === "deliver" && vehicle && distance(vehicle, LANDMARKS.garage) < 76) {
        transition("deliver");
      }
    };

    const updateParticles = (delta: number) => {
      for (const particle of state.particles) {
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.vx *= 1 - delta * 2.2;
        particle.vy *= 1 - delta * 2.2;
        particle.life -= delta;
      }
      state.particles = state.particles.filter((particle) => particle.life > 0);
      for (const skid of state.skids) skid.life -= delta * 0.18;
      state.skids = state.skids.filter((skid) => skid.life > 0);
    };

    const updateAudio = (now: number) => {
      if (!audio) return;
      const vehicle = currentVehicle();
      const engineLevel = !state.muted && vehicle && !state.paused ? 0.012 + Math.abs(vehicle.speed) / 18000 : 0;
      audio.engine.frequency.setTargetAtTime(50 + Math.abs(vehicle?.speed ?? 0) * 0.34, audio.context.currentTime, 0.06);
      audio.engineGain.gain.setTargetAtTime(engineLevel, audio.context.currentTime, 0.08);
      const sirenLevel = !state.muted && state.wanted > 0 && !state.paused ? 0.022 : 0;
      audio.siren.frequency.setTargetAtTime(660 + Math.sin(now * 0.008) * 170, audio.context.currentTime, 0.04);
      audio.sirenGain.gain.setTargetAtTime(sirenLevel, audio.context.currentTime, 0.1);
    };

    const update = (delta: number, now: number) => {
      for (const [code, time] of impulses) {
        const next = time - delta;
        if (next <= 0) impulses.delete(code);
        else impulses.set(code, next);
      }

      if (!state.paused) {
        state.impactCooldown = Math.max(0, state.impactCooldown - delta);
        const vehicle = currentVehicle();
        if (vehicle) updatePlayerVehicle(delta, vehicle);
        else updateOnFoot(delta);
        updateTraffic(delta);
        updatePedestrians(delta);
        if (state.wanted > 0) updatePolice(delta);
        updateMission(delta);
        updateParticles(delta);
      }

      const focus = currentVehicle() ?? state.player;
      const halfWidth = viewport.width / 2;
      const halfHeight = viewport.height / 2;
      const targetX = clamp(focus.x, halfWidth, WORLD.width - halfWidth);
      const targetY = clamp(focus.y, halfHeight, WORLD.height - halfHeight);
      const cameraEase = 1 - Math.pow(0.001, delta);
      state.camera.x += (targetX - state.camera.x) * cameraEase;
      state.camera.y += (targetY - state.camera.y) * cameraEase;
      state.camera.shake *= Math.max(0, 1 - delta * 8);
      if (state.toast && state.toast.until <= now) state.toast = null;
      updateAudio(now);

      hudAccumulator += delta;
      if (hudAccumulator >= 0.1) {
        hudAccumulator = 0;
        syncHud();
      }
    };

    const drawMinimap = () => {
      const width = minimap.width / viewport.dpr;
      const height = minimap.height / viewport.dpr;
      minimapContext.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);
      minimapContext.clearRect(0, 0, width, height);
      minimapContext.fillStyle = "#0d1318";
      minimapContext.fillRect(0, 0, width, height);
      const scaleX = width / WORLD.width;
      const scaleY = height / WORLD.height;
      minimapContext.fillStyle = "#263039";
      for (const y of ROAD_BANDS.horizontal) minimapContext.fillRect(0, (y - ROAD_BANDS.width / 2) * scaleY, width, ROAD_BANDS.width * scaleY);
      for (const x of ROAD_BANDS.vertical) minimapContext.fillRect((x - ROAD_BANDS.width / 2) * scaleX, 0, ROAD_BANDS.width * scaleX, height);
      minimapContext.fillStyle = "#141b21";
      for (const obstacle of OBSTACLES) minimapContext.fillRect(obstacle.x * scaleX, obstacle.y * scaleY, obstacle.w * scaleX, obstacle.h * scaleY);

      const target = objectivePoint(state.mission);
      if (target) {
        minimapContext.fillStyle = state.mission === "deliver" ? "#ffd85c" : "#40e1ec";
        minimapContext.beginPath();
        minimapContext.arc(target.x * scaleX, target.y * scaleY, 4, 0, Math.PI * 2);
        minimapContext.fill();
      }
      minimapContext.fillStyle = "#ff486f";
      for (const unit of state.police) {
        minimapContext.beginPath();
        minimapContext.arc(unit.x * scaleX, unit.y * scaleY, 3, 0, Math.PI * 2);
        minimapContext.fill();
      }
      minimapContext.save();
      minimapContext.translate(state.player.x * scaleX, state.player.y * scaleY);
      minimapContext.rotate(state.player.angle);
      minimapContext.fillStyle = "#f4f7f6";
      minimapContext.beginPath();
      minimapContext.moveTo(7, 0);
      minimapContext.lineTo(-5, -4);
      minimapContext.lineTo(-3, 0);
      minimapContext.lineTo(-5, 4);
      minimapContext.closePath();
      minimapContext.fill();
      minimapContext.restore();
    };

    const draw = (now: number) => {
      const dpr = viewport.dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, viewport.width, viewport.height);
      context.fillStyle = "#080b0e";
      context.fillRect(0, 0, viewport.width, viewport.height);

      const shakeX = state.camera.shake ? (random() - 0.5) * state.camera.shake : 0;
      const shakeY = state.camera.shake ? (random() - 0.5) * state.camera.shake : 0;
      context.save();
      context.translate(
        Math.round(viewport.width / 2 - state.camera.x + shakeX),
        Math.round(viewport.height / 2 - state.camera.y + shakeY),
      );
      drawCity(context, now);

      const target = objectivePoint(state.mission);
      if (target) drawMarker(context, target, state.mission === "deliver" ? "#ffd85c" : "#40e1ec", state.mission === "deliver" ? "GARAGE" : state.mission === "find-car" ? "RIDE" : "PICKUP", now);

      context.strokeStyle = "rgba(17,18,20,.52)";
      context.lineWidth = 3;
      for (const skid of state.skids) {
        context.globalAlpha = skid.life * 0.7;
        context.save();
        context.translate(skid.x, skid.y);
        context.rotate(skid.angle);
        context.beginPath();
        context.moveTo(-16, -12);
        context.lineTo(16, -12);
        context.moveTo(-16, 12);
        context.lineTo(16, 12);
        context.stroke();
        context.restore();
      }
      context.globalAlpha = 1;

      for (const person of state.pedestrians) {
        context.save();
        context.translate(person.x, person.y);
        context.rotate(person.angle);
        context.fillStyle = "rgba(0,0,0,.34)";
        context.beginPath();
        context.ellipse(3, 6, 8, 5, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = person.color;
        context.beginPath();
        context.arc(0, 0, 6, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#2b3035";
        context.fillRect(-4, 4, 8, 7);
        context.restore();
      }

      for (const traffic of state.traffic) drawVehicle(context, traffic, { headlights: true });
      for (const vehicle of state.vehicles) {
        drawVehicle(context, vehicle, {
          headlights: vehicle.driven,
          damaged: vehicle.health <= 20,
        });
      }
      for (const unit of state.police) drawVehicle(context, { ...unit, color: "#24364a" }, { police: true, headlights: true }, Math.sin(now * 0.016) * unit.spin);

      if (!state.player.vehicleId) {
        context.save();
        context.translate(state.player.x, state.player.y);
        context.rotate(state.player.angle);
        context.fillStyle = "rgba(0,0,0,.34)";
        context.beginPath();
        context.ellipse(3, 7, 11, 7, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#f1c38d";
        context.beginPath();
        context.arc(0, -4, 6, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#f0ece3";
        drawRoundedRect(context, -7, 1, 14, 14, 4);
        context.fill();
        context.fillStyle = "#fd4f84";
        context.fillRect(3, 2, 4, 10);
        context.restore();
      }

      for (const particle of state.particles) {
        context.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      context.restore();

      const vignette = context.createRadialGradient(
        viewport.width / 2,
        viewport.height / 2,
        Math.min(viewport.width, viewport.height) * 0.18,
        viewport.width / 2,
        viewport.height / 2,
        Math.max(viewport.width, viewport.height) * 0.7,
      );
      vignette.addColorStop(0, "rgba(0,0,0,0)");
      vignette.addColorStop(1, "rgba(0,0,0,.48)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, viewport.width, viewport.height);

      context.strokeStyle = "rgba(131,206,222,.09)";
      context.lineWidth = 1;
      for (let index = 0; index < 34; index += 1) {
        const x = ((index * 193 + now * 0.18) % (viewport.width + 140)) - 70;
        const y = (index * 71 + now * 0.34) % viewport.height;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x - 9, y + 18);
        context.stroke();
      }

      drawMinimap();
    };

    const frame = (now: number) => {
      const rawDelta = (now - lastFrame) / 1000;
      lastFrame = now;
      const delta = clamp(rawDelta, 0, 0.033);
      update(delta, now);
      draw(now);
      animationFrame = requestAnimationFrame(frame);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
      if (!event.repeat) press(event.code);
      else keys.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => release(event.code);
    const onBlur = () => {
      keys.clear();
      impulses.clear();
      if (!state.paused && !["complete", "failed", "intro"].includes(state.mission)) togglePause();
    };

    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    resize();
    syncHud();
    animationFrame = requestAnimationFrame(frame);

    const debugWindow = window as Window & { __midnightGridDebug?: GameDebug };
    const debugEnabled = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const setDebugScenario: GameDebug["setScenario"] = (scenario) => {
      if (!debugEnabled) return;
      if (state.mission === "intro") startRun();
      let vehicle = currentVehicle();
      if (!vehicle) {
        vehicle = state.vehicles[0];
        state.player.vehicleId = vehicle.id;
        vehicle.driven = true;
      }
      if (scenario === "pickup") {
        state.mission = "pickup";
        vehicle.x = LANDMARKS.pickup.x - 60;
        vehicle.y = LANDMARKS.pickup.y;
      } else if (scenario === "escape") {
        state.mission = "escape";
        state.wanted = 2;
        state.timer = 75;
        vehicle.x = LANDMARKS.pickup.x;
        vehicle.y = LANDMARKS.pickup.y;
        spawnPolice();
      } else if (scenario === "deliver") {
        state.mission = "deliver";
        state.wanted = 0;
        state.timer = 48;
        state.police = [];
        vehicle.x = LANDMARKS.garage.x - 60;
        vehicle.y = LANDMARKS.garage.y;
      } else {
        state.mission = "escape";
        state.wanted = 2;
        state.timer = 0.01;
        spawnPolice();
      }
      state.player.x = vehicle.x;
      state.player.y = vehicle.y;
      state.paused = false;
      setOverlay(null);
      syncHud();
    };

    if (debugEnabled) {
      debugWindow.__midnightGridDebug = {
        getState: () => ({
          mission: state.mission,
          paused: state.paused,
          player: { ...state.player },
          vehicle: currentVehicle() ? { ...currentVehicle() } : null,
          timer: state.timer,
          wanted: state.wanted,
          escapeProgress: state.escapeProgress,
          policeCount: state.police.length,
          particleCount: state.particles.length,
          score: state.score,
        }),
        setScenario: setDebugScenario,
      };

      const queryScenario = new URLSearchParams(window.location.search).get("scenario");
      if (["pickup", "escape", "deliver", "fail"].includes(queryScenario ?? "")) {
        setDebugScenario(queryScenario as Parameters<GameDebug["setScenario"]>[0]);
      }
    }

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      delete debugWindow.__midnightGridDebug;
      actionsRef.current = EMPTY_ACTIONS;
      if (audio) {
        audio.engine.stop();
        audio.siren.stop();
        void audio.context.close();
      }
    };
  }, []);

  const touchDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const code = event.currentTarget.dataset.code;
    if (!code) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    actionsRef.current.press(code);
  };

  const touchUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const code = event.currentTarget.dataset.code;
    if (code) actionsRef.current.release(code);
  };

  const touchActivate = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0) return;
    const code = event.currentTarget.dataset.code;
    if (!code) return;
    actionsRef.current.press(code);
    window.setTimeout(() => actionsRef.current.release(code), 180);
  };

  const start = () => actionsRef.current.start();
  const restart = () => actionsRef.current.restart();

  return (
    <main className="game-shell" ref={shellRef} data-testid="game-shell">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        tabIndex={overlay ? -1 : 0}
        role="application"
        aria-hidden={Boolean(overlay)}
        aria-label="Midnight Grid top-down city game. Use WASD to move and drive."
        data-testid="game-canvas"
      />

      <div
        className={`hud ${overlay === "intro" ? "hud--quiet" : ""}`}
        aria-hidden={Boolean(overlay)}
        inert={overlay ? true : undefined}
      >
        <header className="hud-top">
          <div className="mini-brand" aria-label="Midnight Grid">
            <span className="mini-brand__mark">MG</span>
            <span>
              <b>MIDNIGHT</b>
              <em>GRID</em>
            </span>
          </div>

          <div className="objective-card">
            <div className="objective-copy" role="status" aria-live="polite" aria-atomic="true">
              <span>{hud.eyebrow}</span>
              <strong>{hud.title}</strong>
              <small>{hud.detail}</small>
            </div>
            {hud.mission === "escape" && (
              <div className="escape-meter" aria-label={`Escape progress ${Math.round((hud.escapeProgress / ESCAPE_REQUIRED) * 100)} percent`}>
                <i style={{ width: `${(hud.escapeProgress / ESCAPE_REQUIRED) * 100}%` }} />
              </div>
            )}
          </div>

          <div className="run-stats">
            <div>
              <span>RUN CLOCK</span>
              <b className={hud.timer < 15 ? "danger" : ""}>{formatTime(hud.timer)}</b>
            </div>
            <div>
              <span>CASH</span>
              <b>${hud.cash.toLocaleString()}</b>
            </div>
          </div>
        </header>

        <div className="wanted" aria-label={`${hud.wanted} star wanted level`}>
          <span>HEAT</span>
          {[0, 1, 2, 3, 4].map((star) => (
            <i key={star} className={star < hud.wanted ? "active" : ""}>★</i>
          ))}
        </div>

        <div className="hud-actions">
          <button type="button" onClick={() => actionsRef.current.toggleMute()} aria-label={hud.muted ? "Turn sound on" : "Mute sound"}>
            {hud.muted ? "SOUND OFF" : "SOUND ON"}
          </button>
          <button type="button" onClick={() => actionsRef.current.pause()} aria-label="Pause game">PAUSE</button>
        </div>

        <aside className="minimap-wrap" aria-label="City minimap">
          <div className="minimap-label"><span>PORT MERCY</span><b>01:42 AM</b></div>
          <canvas ref={minimapRef} className="minimap" aria-hidden="true" />
        </aside>

        <div className="vitals">
          <div className="vitals__header">
            <span>{hud.vehicle ? hud.vehicle.toUpperCase() : "ON FOOT"}</span>
            <b>{hud.vehicle ? `${hud.speed} MPH` : "100%"}</b>
          </div>
          <div className="vitals__bar"><i style={{ width: `${hud.health}%` }} /></div>
          <small>{hud.vehicle ? "VEHICLE INTEGRITY" : "HEALTH"}</small>
        </div>

        {!overlay && <div className="interaction-prompt">{hud.prompt}</div>}
        {hud.toast && !overlay && <div className="mission-toast" role="status" aria-live="polite">{hud.toast}</div>}
      </div>

      {overlay === "intro" && (
        <section className="intro-overlay" role="dialog" aria-modal="true" aria-labelledby="game-title">
          <div className="intro-scanlines" />
          <div className="intro-content">
            <div className="edition-tag">ORIGINAL BROWSER GAME <i /> PORT MERCY EDITION</div>
            <h1 id="game-title"><span>MIDNIGHT</span><em>GRID</em></h1>
            <p className="intro-kicker">HARBOR HEAT</p>
            <p className="intro-copy">
              One package. Two patrol cars. Ninety seconds to disappear into a city that never sleeps.
            </p>
            <div className="mission-route" aria-label="Mission steps">
              <div><span>01</span><b>TAKE A RIDE</b><small>Find wheels</small></div>
              <i />
              <div><span>02</span><b>HIT THE PIER</b><small>Secure cargo</small></div>
              <i />
              <div><span>03</span><b>LOSE THE HEAT</b><small>Break pursuit</small></div>
            </div>
            <button className="primary-button" type="button" onClick={start} data-testid="start-game" autoFocus>
              <span>START THE RUN</span><i>↗</i>
            </button>
            <p className="intro-note">A focused open-city action experience • No copyrighted assets</p>
          </div>
          <div className="controls-card">
            <span className="controls-card__label">CONTROLS</span>
            <div><kbd>WASD</kbd><span>Move / drive</span></div>
            <div><kbd>SHIFT</kbd><span>Sprint</span></div>
            <div><kbd>E</kbd><span>Enter / exit</span></div>
            <div><kbd>SPACE</kbd><span>Handbrake</span></div>
            <div><kbd>P</kbd><span>Pause</span></div>
          </div>
        </section>
      )}

      {overlay === "pause" && (
        <section className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <div className="modal-card modal-card--pause">
            <span className="modal-eyebrow">THE CITY IS WAITING</span>
            <h2 id="pause-title">Run paused</h2>
            <p>Take a breath. The clock and every patrol car are frozen.</p>
            <button className="primary-button" type="button" onClick={() => actionsRef.current.pause()} autoFocus>RESUME RUN</button>
            <button className="text-button" type="button" onClick={restart}>RESTART FROM SAFEHOUSE</button>
          </div>
        </section>
      )}

      {(overlay === "complete" || overlay === "failed") && (
        <section className={`modal-overlay ${overlay === "complete" ? "modal-overlay--success" : ""}`} role="dialog" aria-modal="true" aria-labelledby="result-title">
          <div className="modal-card result-card">
            <span className="modal-eyebrow">{overlay === "complete" ? "PORT MERCY • 01:47 AM" : "DISPATCH CLOSED THE NET"}</span>
            <h2 id="result-title">{overlay === "complete" ? "Clean getaway." : "Run burned."}</h2>
            <p>{overlay === "complete" ? "Package delivered. Heat gone. Nobody gets your name." : "The harbor will still be there when you come back faster."}</p>
            {overlay === "complete" && (
              <div className="score-grid">
                <div><span>RUN SCORE</span><b>{hud.score.toLocaleString()}</b></div>
                <div><span>BEST</span><b>{hud.best.toLocaleString()}</b></div>
                <div><span>TIME LEFT</span><b>{formatTime(hud.timer)}</b></div>
              </div>
            )}
            <button className="primary-button" type="button" onClick={restart} autoFocus>{overlay === "complete" ? "RUN IT AGAIN" : "RETRY THE RUN"}</button>
            <small>Press R to restart instantly</small>
          </div>
        </section>
      )}

      <div className="touch-controls" aria-label="Touch controls" aria-hidden={Boolean(overlay)} inert={overlay ? true : undefined}>
        <div className="touch-pad">
          <button type="button" aria-label="Move up" data-code="KeyW" onPointerDown={touchDown} onPointerUp={touchUp} onPointerCancel={touchUp} onPointerLeave={touchUp} onClick={touchActivate}>▲</button>
          <button type="button" aria-label="Move left" data-code="KeyA" onPointerDown={touchDown} onPointerUp={touchUp} onPointerCancel={touchUp} onPointerLeave={touchUp} onClick={touchActivate}>◀</button>
          <button type="button" aria-label="Move down" data-code="KeyS" onPointerDown={touchDown} onPointerUp={touchUp} onPointerCancel={touchUp} onPointerLeave={touchUp} onClick={touchActivate}>▼</button>
          <button type="button" aria-label="Move right" data-code="KeyD" onPointerDown={touchDown} onPointerUp={touchUp} onPointerCancel={touchUp} onPointerLeave={touchUp} onClick={touchActivate}>▶</button>
        </div>
        <div className="touch-actions">
          <button type="button" aria-label="Sprint" data-code="ShiftLeft" onPointerDown={touchDown} onPointerUp={touchUp} onPointerCancel={touchUp} onPointerLeave={touchUp} onClick={touchActivate}>RUN</button>
          <button type="button" aria-label="Enter or exit vehicle" data-code="KeyE" onPointerDown={touchDown} onPointerUp={touchUp} onPointerCancel={touchUp} onPointerLeave={touchUp} onClick={touchActivate}>E</button>
          <button type="button" aria-label="Handbrake" data-code="Space" onPointerDown={touchDown} onPointerUp={touchUp} onPointerCancel={touchUp} onPointerLeave={touchUp} onClick={touchActivate}>BRAKE</button>
        </div>
      </div>
    </main>
  );
}
