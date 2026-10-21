import type { Hero } from "../entities/types.js";
import type { RunSummary } from "../run/run.js";

// Pure, environment-agnostic pieces of the meta-progression system, shared
// between the Node CLI (src/persistence/save.ts, backed by a JSON file) and
// the browser build (src/web/localSave.ts, backed by localStorage). Neither
// storage mechanism belongs here.
export interface PermanentBonuses {
  attack: number;
  defense: number;
  maxHp: number;
  speed: number;
}

export interface SaveData {
  legacyPoints: number;
  bestFloor: number;
  totalRuns: number;
  permanentBonuses: PermanentBonuses;
}

export function defaultSave(): SaveData {
  return {
    legacyPoints: 0,
    bestFloor: 0,
    totalRuns: 0,
    permanentBonuses: { attack: 0, defense: 0, maxHp: 0, speed: 0 },
  };
}

export function normalizeSave(raw: unknown): SaveData {
  const r = (raw ?? {}) as Partial<SaveData>;
  return {
    ...defaultSave(),
    ...r,
    permanentBonuses: { ...defaultSave().permanentBonuses, ...r.permanentBonuses },
  };
}

export function applyPermanentBonuses(hero: Hero, bonuses: PermanentBonuses): Hero {
  return {
    ...hero,
    attack: hero.attack + bonuses.attack,
    defense: hero.defense + bonuses.defense,
    maxHp: hero.maxHp + bonuses.maxHp,
    hp: hero.hp + bonuses.maxHp,
    speed: hero.speed + bonuses.speed,
  };
}

// A run always ends in death (or hitting a simulation's floor cap) by
// design - this is what a permadeath run "cashes out" into for next time.
// Points come from every enemy beaten (not just full floor clears) so a
// tough early death still buys real progress - otherwise a run that's too
// hard to clear floor 1 earns almost nothing, and a player can never
// permanently get stronger to break out of that. floorsCleared adds a
// bonus on top for actually finishing a floor (which already includes a
// boss kill counted in enemiesDefeated).
export function computeLegacyPointsEarned(result: RunSummary): number {
  return result.enemiesDefeated * 3 + result.floorsCleared * 10 + Math.floor(result.finalHero.gold / 5);
}

export function recordRunInto(save: SaveData, result: RunSummary): number {
  const earned = computeLegacyPointsEarned(result);
  save.legacyPoints += earned;
  save.bestFloor = Math.max(save.bestFloor, result.floorsCleared);
  save.totalRuns += 1;
  return earned;
}

export const SHOP_PRICES = {
  attack: 5, // legacy points per +1 Attack
  defense: 5, // legacy points per +1 Defense
  speed: 8, // legacy points per +1 Speed
  maxHp: 2, // legacy points per +5 Max HP
} as const;
