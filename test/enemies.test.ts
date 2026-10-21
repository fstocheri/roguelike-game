import { describe, expect, it } from "vitest";
import { generateEnemyParty } from "../src/content/enemies.js";
import { makeRng } from "../src/util/rng.js";

describe("generateEnemyParty", () => {
  it("floor 1 regular encounters are always solo", () => {
    for (let seed = 0; seed < 30; seed++) {
      const party = generateEnemyParty(1, false, makeRng(seed));
      expect(party).toHaveLength(1);
    }
  });

  it("floor 1-3 bosses are always solo", () => {
    for (let seed = 0; seed < 30; seed++) {
      const party = generateEnemyParty(2, true, makeRng(seed));
      expect(party).toHaveLength(1);
    }
  });

  it("never exceeds the 3-enemy party cap", () => {
    for (let seed = 0; seed < 100; seed++) {
      const party = generateEnemyParty(10, false, makeRng(seed));
      expect(party.length).toBeLessThanOrEqual(3);
    }
  });

  it("deep endless floors sometimes produce multi-enemy parties", () => {
    const sizes = new Set<number>();
    for (let seed = 0; seed < 200; seed++) {
      sizes.add(generateEnemyParty(10, false, makeRng(seed)).length);
    }
    expect(sizes.size).toBeGreaterThan(1); // both solo and multi-enemy parties occur
  });

  it("is deterministic for a given seed", () => {
    const a = generateEnemyParty(5, false, makeRng(42)).map((e) => e.name);
    const b = generateEnemyParty(5, false, makeRng(42)).map((e) => e.name);
    expect(a).toEqual(b);
  });

  it("every generated enemy has at least one move", () => {
    const party = generateEnemyParty(6, true, makeRng(7));
    for (const enemy of party) {
      expect(enemy.moves.length).toBeGreaterThan(0);
    }
  });
});
