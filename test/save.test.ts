import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHero } from "../src/entities/hero.js";
import {
  applyPermanentBonuses,
  computeLegacyPointsEarned,
  loadSave,
  recordRun,
} from "../src/persistence/save.js";
import type { RunSummary } from "../src/run/run.js";

const SAVE_PATH = path.join(process.cwd(), "save.json");

function makeSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    outcome: "died",
    floorsCleared: 2,
    enemiesDefeated: 8,
    finalHero: createHero("Test Hero"),
    log: [],
    ...overrides,
  };
}

describe("persistence/save", () => {
  beforeEach(() => {
    if (existsSync(SAVE_PATH)) rmSync(SAVE_PATH);
  });
  afterEach(() => {
    if (existsSync(SAVE_PATH)) rmSync(SAVE_PATH);
  });

  it("loadSave returns sensible defaults when no save file exists", () => {
    const save = loadSave();
    expect(save.legacyPoints).toBe(0);
    expect(save.bestFloor).toBe(0);
    expect(save.totalRuns).toBe(0);
    expect(save.permanentBonuses).toEqual({ attack: 0, defense: 0, maxHp: 0, speed: 0 });
  });

  it("computeLegacyPointsEarned rewards enemies defeated, floors cleared, and banked gold", () => {
    const hero = createHero("Test Hero");
    hero.gold = 25;
    const points = computeLegacyPointsEarned(
      makeSummary({ floorsCleared: 3, enemiesDefeated: 30, finalHero: hero }),
    );
    expect(points).toBe(30 * 3 + 3 * 10 + Math.floor(25 / 5));
  });

  it("a run that dies without clearing a floor still earns points for enemies it beat", () => {
    const hero = createHero("Test Hero");
    hero.gold = 0;
    const points = computeLegacyPointsEarned(makeSummary({ floorsCleared: 0, enemiesDefeated: 4, finalHero: hero }));
    expect(points).toBeGreaterThan(0);
  });

  it("recordRun persists progress across a fresh loadSave call", () => {
    const save = loadSave();
    recordRun(save, makeSummary({ floorsCleared: 4 }));

    const reloaded = loadSave();
    expect(reloaded.bestFloor).toBe(4);
    expect(reloaded.totalRuns).toBe(1);
    expect(reloaded.legacyPoints).toBeGreaterThan(0);
  });

  it("recordRun keeps the highest floor reached across multiple runs", () => {
    const save = loadSave();
    recordRun(save, makeSummary({ floorsCleared: 5 }));
    recordRun(save, makeSummary({ floorsCleared: 2 }));

    expect(save.bestFloor).toBe(5);
    expect(save.totalRuns).toBe(2);
  });

  it("applyPermanentBonuses adds flat stats without touching other fields", () => {
    const hero = createHero("Test Hero");
    const boosted = applyPermanentBonuses(hero, { attack: 3, defense: 1, maxHp: 10, speed: 2 });

    expect(boosted.attack).toBe(hero.attack + 3);
    expect(boosted.defense).toBe(hero.defense + 1);
    expect(boosted.maxHp).toBe(hero.maxHp + 10);
    expect(boosted.hp).toBe(hero.hp + 10);
    expect(boosted.speed).toBe(hero.speed + 2);
  });
});
