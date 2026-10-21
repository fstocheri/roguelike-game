// Shared across BattleView instances (a new one is constructed per combat),
// so the speed choice needs to live outside any single instance.
const STORAGE_KEY = "roguelike-anim-speed";
export const SPEED_OPTIONS = [1, 2, 4] as const;
export type SpeedOption = (typeof SPEED_OPTIONS)[number];

let currentSpeed: SpeedOption = loadSpeed();

function loadSpeed(): SpeedOption {
  try {
    const raw = Number(localStorage.getItem(STORAGE_KEY));
    return (SPEED_OPTIONS as readonly number[]).includes(raw) ? (raw as SpeedOption) : 1;
  } catch {
    return 1;
  }
}

export function getAnimationSpeed(): SpeedOption {
  return currentSpeed;
}

export function setAnimationSpeed(speed: SpeedOption): void {
  currentSpeed = speed;
  try {
    localStorage.setItem(STORAGE_KEY, String(speed));
  } catch {
    // per-viewer convenience only, fine to lose on private browsing
  }
}

export function cycleAnimationSpeed(): SpeedOption {
  const idx = SPEED_OPTIONS.indexOf(currentSpeed);
  const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
  setAnimationSpeed(next);
  return next;
}
