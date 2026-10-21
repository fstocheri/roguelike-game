import { describe, expect, it } from "vitest";
import { allyToCombatant } from "../src/combat/combatant.js";
import { ALLY_CAP, ALLY_TEMPLATES } from "../src/entities/ally.js";
import { createHero } from "../src/entities/hero.js";
import { HERO_CLASSES } from "../src/entities/heroClass.js";

describe("createHero with a class", () => {
  it("applies that class's base stats and starting move", () => {
    for (const id of Object.keys(HERO_CLASSES) as Array<keyof typeof HERO_CLASSES>) {
      const def = HERO_CLASSES[id];
      const hero = createHero("Test Hero", id);

      expect(hero.heroClass).toBe(id);
      expect(hero.maxHp).toBe(def.baseStats.maxHp);
      expect(hero.hp).toBe(def.baseStats.maxHp);
      expect(hero.attack).toBe(def.baseStats.attack);
      expect(hero.defense).toBe(def.baseStats.defense);
      expect(hero.speed).toBe(def.baseStats.speed);
      expect(hero.critChance).toBe(def.baseStats.critChance);
      expect(hero.moves).toEqual([def.startingMove]);
    }
  });

  it("different classes produce meaningfully different heroes", () => {
    const warrior = createHero("W", "warrior");
    const wizard = createHero("W", "wizard");

    expect(warrior.maxHp).not.toBe(wizard.maxHp);
    expect(warrior.attack).not.toBe(wizard.attack);
    expect(warrior.moves[0].id).not.toBe(wizard.moves[0].id);
  });

  it("starts with no allies", () => {
    const hero = createHero("Test Hero");
    expect(hero.allies).toEqual([]);
  });
});

describe("allyToCombatant", () => {
  it("scales stats up with floor the same way enemies do", () => {
    const template = ALLY_TEMPLATES[0];
    const floor1 = allyToCombatant(template, "ally-1", 1);
    const floor5 = allyToCombatant(template, "ally-1", 5);

    expect(floor5.stats.maxHp).toBeGreaterThan(floor1.stats.maxHp);
    expect(floor5.stats.attack).toBeGreaterThan(floor1.stats.attack);
  });

  it("always starts at full HP regardless of floor", () => {
    const template = ALLY_TEMPLATES[0];
    const combatant = allyToCombatant(template, "ally-1", 7);
    expect(combatant.stats.hp).toBe(combatant.stats.maxHp);
  });

  it("carries the template's moves onto the combatant", () => {
    const template = ALLY_TEMPLATES[0];
    const combatant = allyToCombatant(template, "ally-1", 1);
    expect(combatant.moves).toEqual(template.moves);
  });

  it("is on the player team", () => {
    const combatant = allyToCombatant(ALLY_TEMPLATES[0], "ally-1", 1);
    expect(combatant.team).toBe("player");
  });
});

describe("ally roster", () => {
  it("has more templates than the ally cap, so recruitment is a real choice", () => {
    expect(ALLY_TEMPLATES.length).toBeGreaterThan(ALLY_CAP);
  });

  it("every template has at least one move", () => {
    for (const template of ALLY_TEMPLATES) {
      expect(template.moves.length).toBeGreaterThan(0);
    }
  });
});
