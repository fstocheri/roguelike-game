import { describe, expect, it } from "vitest";
import { createHero } from "../src/entities/hero.js";
import { HEAVY_BLOW } from "../src/entities/move.js";
import { UPGRADE_POOL } from "../src/upgrades/pool.js";
import { offerUpgrades } from "../src/upgrades/offer.js";
import { learnOrReplaceMove, MAX_MOVES } from "../src/upgrades/moves.js";
import { makeRng } from "../src/util/rng.js";

describe("offerUpgrades", () => {
  it("returns the requested number of distinct upgrades", () => {
    const offered = offerUpgrades(makeRng(42), "warrior", 3);
    expect(offered).toHaveLength(3);
    const ids = new Set(offered.map((u) => u.id));
    expect(ids.size).toBe(3);
  });

  it("only offers upgrades that exist in the pool", () => {
    const poolIds = new Set(UPGRADE_POOL.map((u) => u.id));
    const offered = offerUpgrades(makeRng(7), "warrior", 3);
    for (const upgrade of offered) {
      expect(poolIds.has(upgrade.id)).toBe(true);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = offerUpgrades(makeRng(123), "warrior", 3).map((u) => u.id);
    const b = offerUpgrades(makeRng(123), "warrior", 3).map((u) => u.id);
    expect(a).toEqual(b);
  });

  it("never offers a move exclusive to a different class", () => {
    for (let seed = 0; seed < 30; seed++) {
      const offered = offerUpgrades(makeRng(seed), "wizard", 3);
      for (const upgrade of offered) {
        if (upgrade.classRestriction) {
          expect(upgrade.classRestriction).toContain("wizard");
        }
      }
    }
  });
});

describe("upgrade.apply", () => {
  it("returns a new hero object rather than mutating the input", () => {
    const hero = createHero("Test Hero");
    const heroAttackBefore = hero.attack;
    const sharpenedBlade = UPGRADE_POOL.find((u) => u.id === "sharpened-blade")!;

    const upgraded = sharpenedBlade.apply(hero);

    expect(upgraded).not.toBe(hero);
    expect(hero.attack).toBe(heroAttackBefore); // original untouched
    expect(upgraded.attack).toBe(heroAttackBefore + 3);
  });

  it("tradeoff upgrades apply both the gain and the cost", () => {
    const hero = createHero("Test Hero");
    const berserkersFury = UPGRADE_POOL.find((u) => u.id === "berserkers-fury")!;

    const upgraded = berserkersFury.apply(hero);

    expect(upgraded.attack).toBe(hero.attack + 6);
    expect(upgraded.defense).toBe(hero.defense - 1);
  });

  it("defense tradeoffs never drop below zero", () => {
    const hero = createHero("Test Hero");
    hero.defense = 0;
    const berserkersFury = UPGRADE_POOL.find((u) => u.id === "berserkers-fury")!;

    const upgraded = berserkersFury.apply(hero);

    expect(upgraded.defense).toBe(0);
  });

  it("stacking the same category gives diminishing returns", () => {
    const sharpenedBlade = UPGRADE_POOL.find((u) => u.id === "sharpened-blade")!;
    let hero = createHero("Test Hero");

    const gains: number[] = [];
    for (let i = 0; i < 5; i++) {
      const before = hero.attack;
      hero = sharpenedBlade.apply(hero);
      gains.push(hero.attack - before);
    }

    // each successive pick in the same category should be worth no more than the last
    for (let i = 1; i < gains.length; i++) {
      expect(gains[i]).toBeLessThanOrEqual(gains[i - 1]);
    }
    expect(gains[0]).toBeGreaterThan(gains[gains.length - 1]);
  });

  it("field rations heal without granting permanent power", () => {
    const hero = createHero("Test Hero");
    hero.hp = 10;
    const fieldRations = UPGRADE_POOL.find((u) => u.id === "field-rations")!;

    const healed = fieldRations.apply(hero);

    expect(healed.hp).toBeGreaterThan(10);
    expect(healed.attack).toBe(hero.attack);
    expect(healed.defense).toBe(hero.defense);
  });

  it("blood pact trades attack for a real cost", () => {
    const hero = createHero("Test Hero");
    const bloodPact = UPGRADE_POOL.find((u) => u.id === "blood-pact")!;

    const cursed = bloodPact.apply(hero);

    expect(cursed.attack).toBe(hero.attack + 12);
    expect(cursed.maxHp).toBeLessThan(hero.maxHp);
  });

  it("a move-granting upgrade teaches the move", () => {
    const hero = createHero("Test Hero");
    const learnHeavyBlow = UPGRADE_POOL.find((u) => u.id === "learn-heavy-blow")!;

    const taught = learnHeavyBlow.apply(hero);

    expect(taught.moves.map((m) => m.id)).toContain("heavy-blow");
    expect(hero.moves.map((m) => m.id)).not.toContain("heavy-blow"); // original untouched
  });
});

describe("learnOrReplaceMove", () => {
  it("appends the move when there's room", () => {
    const hero = createHero("Test Hero");
    const updated = learnOrReplaceMove(hero, HEAVY_BLOW);
    expect(updated.moves).toHaveLength(2);
    expect(updated.moves[1].id).toBe("heavy-blow");
  });

  it("is a no-op if the move is already known", () => {
    const hero = createHero("Test Hero"); // starts knowing exactly its class's starting move
    const updated = learnOrReplaceMove(hero, hero.moves[0]);
    expect(updated.moves).toHaveLength(1);
  });

  it("replaces the weakest move by default once the moveset is full", () => {
    let hero = createHero("Test Hero");
    for (let i = 0; i < MAX_MOVES - 1; i++) {
      hero = learnOrReplaceMove(hero, { ...HEAVY_BLOW, id: `filler-${i}`, power: 2 + i });
    }
    expect(hero.moves).toHaveLength(MAX_MOVES);

    const brandNewMove = { ...HEAVY_BLOW, id: "new-move", power: 10 };
    const updated = learnOrReplaceMove(hero, brandNewMove);

    expect(updated.moves).toHaveLength(MAX_MOVES);
    expect(updated.moves.map((m) => m.id)).toContain("new-move");
    expect(updated.moves.map((m) => m.id)).not.toContain("strike"); // "Strike" (power 1) was weakest
  });

  it("replaces a specific move when replaceId is given", () => {
    let hero = createHero("Test Hero");
    for (let i = 0; i < MAX_MOVES - 1; i++) {
      hero = learnOrReplaceMove(hero, { ...HEAVY_BLOW, id: `filler-${i}`, power: 2 + i });
    }

    const brandNewMove = { ...HEAVY_BLOW, id: "new-move", power: 1 };
    const updated = learnOrReplaceMove(hero, brandNewMove, "filler-1");

    expect(updated.moves.map((m) => m.id)).not.toContain("filler-1");
    expect(updated.moves.map((m) => m.id)).toContain("new-move");
  });
});
