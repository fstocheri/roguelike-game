import { describe, expect, it } from "vitest";
import { resolveRound, runBattle } from "../src/combat/battle.js";
import type { Combatant } from "../src/combat/combatant.js";
import type { Move } from "../src/entities/move.js";

const noCritRng = () => 1; // rng() always returns 1, so `rng() < critChance` is always false

const STRIKE: Move = { id: "strike", name: "Strike", flavor: "", power: 1, target: "single-enemy" };

function makeCombatant(overrides: Partial<Combatant> = {}): Combatant {
  return {
    id: "test",
    team: "player",
    name: "Test",
    stats: { maxHp: 20, hp: 20, attack: 8, defense: 0, speed: 5 },
    critChance: 0,
    lifesteal: 0,
    thorns: 0,
    executeThreshold: 0,
    reviveCharges: 0,
    moves: [STRIKE],
    ...overrides,
  };
}

describe("resolveRound", () => {
  it("higher speed acts first", () => {
    const hero = makeCombatant({ id: "hero", team: "player", stats: { maxHp: 20, hp: 20, attack: 8, defense: 0, speed: 10 } });
    const enemy = makeCombatant({ id: "enemy-1", team: "enemy", stats: { maxHp: 20, hp: 20, attack: 5, defense: 0, speed: 1 } });
    const actions = [
      { actorId: "hero", move: STRIKE, targetId: "enemy-1" },
      { actorId: "enemy-1", move: STRIKE, targetId: "hero" },
    ];

    const result = resolveRound([hero], [enemy], actions, noCritRng);
    const moveEvents = result.events.filter((e) => e.type === "move");

    expect(moveEvents[0]).toMatchObject({ actorId: "hero" });
  });

  it("a combatant defeated earlier in the round does not still act", () => {
    const hero = makeCombatant({ id: "hero", stats: { maxHp: 20, hp: 20, attack: 100, defense: 0, speed: 10 } });
    const enemy = makeCombatant({ id: "enemy-1", team: "enemy", stats: { maxHp: 5, hp: 5, attack: 5, defense: 0, speed: 1 } });
    const actions = [
      { actorId: "hero", move: STRIKE, targetId: "enemy-1" },
      { actorId: "enemy-1", move: STRIKE, targetId: "hero" },
    ];

    const result = resolveRound([hero], [enemy], actions, noCritRng);

    expect(result.events.filter((e) => e.type === "move" && e.actorId === "enemy-1")).toHaveLength(0);
    expect(result.events.some((e) => e.type === "victory")).toBe(true);
  });

  it("a self-target heal move heals the user and deals no damage", () => {
    const hero = makeCombatant({ id: "hero", stats: { maxHp: 20, hp: 5, attack: 8, defense: 0, speed: 5 } });
    const enemy = makeCombatant({ id: "enemy-1", team: "enemy" });
    const healMove: Move = { id: "heal", name: "Heal", flavor: "", power: 0, target: "self", selfHealFraction: 0.5 };

    const result = resolveRound([hero], [enemy], [{ actorId: "hero", move: healMove, targetId: "hero" }], noCritRng);

    expect(result.events.some((e) => e.type === "heal")).toBe(true);
    expect(result.events.some((e) => e.type === "move")).toBe(false);
    expect(result.playerParty[0].stats.hp).toBe(15); // 5 + 50% of maxHp(20)
  });

  it("an all-enemies move hits every living enemy", () => {
    const hero = makeCombatant({ id: "hero" });
    const enemy1 = makeCombatant({ id: "enemy-1", team: "enemy" });
    const enemy2 = makeCombatant({ id: "enemy-2", team: "enemy" });
    const aoe: Move = { id: "aoe", name: "AOE", flavor: "", power: 1, target: "all-enemies" };

    const result = resolveRound([hero], [enemy1, enemy2], [{ actorId: "hero", move: aoe, targetId: "enemy-1" }], noCritRng);

    expect(result.events.filter((e) => e.type === "move")).toHaveLength(2);
  });

  it("a single-enemy move only hits the requested target, leaving others untouched", () => {
    const hero = makeCombatant({ id: "hero" });
    const enemy1 = makeCombatant({ id: "enemy-1", team: "enemy" });
    const enemy2 = makeCombatant({ id: "enemy-2", team: "enemy" });

    const result = resolveRound([hero], [enemy1, enemy2], [{ actorId: "hero", move: STRIKE, targetId: "enemy-2" }], noCritRng);

    expect(result.enemyParty.find((c) => c.id === "enemy-1")!.stats.hp).toBe(20);
    expect(result.enemyParty.find((c) => c.id === "enemy-2")!.stats.hp).toBeLessThan(20);
  });

  it("retargets automatically if the requested target already died earlier this round", () => {
    const fastHero = makeCombatant({ id: "hero", stats: { maxHp: 20, hp: 20, attack: 100, defense: 0, speed: 10 } });
    const weakEnemy = makeCombatant({ id: "enemy-1", team: "enemy", stats: { maxHp: 1, hp: 1, attack: 0, defense: 0, speed: 1 } });
    const otherEnemy = makeCombatant({ id: "enemy-2", team: "enemy", stats: { maxHp: 20, hp: 20, attack: 0, defense: 0, speed: 1 } });

    const actions = [
      { actorId: "hero", move: STRIKE, targetId: "enemy-1" },
      // A (hypothetical) second player-side actor targeting the same
      // already-dead enemy should fall back to the still-alive one instead
      // of doing nothing.
      { actorId: "hero", move: STRIKE, targetId: "enemy-1" },
    ];

    const result = resolveRound([fastHero], [weakEnemy, otherEnemy], actions, noCritRng);

    expect(result.enemyParty.find((c) => c.id === "enemy-2")!.stats.hp).toBeLessThan(20);
  });

  it("does not mutate the input party arrays", () => {
    const hero = makeCombatant({ id: "hero" });
    const enemy = makeCombatant({ id: "enemy-1", team: "enemy" });
    const heroHpBefore = hero.stats.hp;

    resolveRound([hero], [enemy], [{ actorId: "hero", move: STRIKE, targetId: "enemy-1" }], noCritRng);

    expect(hero.stats.hp).toBe(heroHpBefore);
  });

  it("a revive charge saves a combatant from an otherwise-lethal hit", () => {
    const hero = makeCombatant({
      id: "hero",
      reviveCharges: 1,
      stats: { maxHp: 1, hp: 1, attack: 5, defense: 0, speed: 1 },
    });
    const enemy = makeCombatant({
      id: "enemy-1",
      team: "enemy",
      stats: { maxHp: 20, hp: 20, attack: 50, defense: 0, speed: 10 },
    });
    const actions = [
      { actorId: "hero", move: STRIKE, targetId: "enemy-1" },
      { actorId: "enemy-1", move: STRIKE, targetId: "hero" },
    ];

    const result = resolveRound([hero], [enemy], actions, noCritRng);

    expect(result.playerParty[0].stats.hp).toBe(1);
    expect(result.playerParty[0].reviveCharges).toBe(0);
    expect(result.events.some((e) => e.type === "revive")).toBe(true);
  });

  it("thorns reflects damage back onto whoever landed the hit", () => {
    const hero = makeCombatant({ id: "hero", stats: { maxHp: 20, hp: 20, attack: 5, defense: 0, speed: 5 } });
    const enemy = makeCombatant({
      id: "enemy-1",
      team: "enemy",
      thorns: 1,
      stats: { maxHp: 20, hp: 20, attack: 3, defense: 0, speed: 1 },
    });

    const result = resolveRound([hero], [enemy], [{ actorId: "hero", move: STRIKE, targetId: "enemy-1" }], noCritRng);

    expect(result.events.some((e) => e.type === "thorns")).toBe(true);
  });

  it("execute finishes off a target at/below the threshold", () => {
    const hero = makeCombatant({
      id: "hero",
      executeThreshold: 0.5,
      stats: { maxHp: 20, hp: 20, attack: 2, defense: 0, speed: 5 },
    });
    const enemy = makeCombatant({ id: "enemy-1", team: "enemy", stats: { maxHp: 20, hp: 11, attack: 0, defense: 0, speed: 1 } });

    const result = resolveRound([hero], [enemy], [{ actorId: "hero", move: STRIKE, targetId: "enemy-1" }], noCritRng);

    expect(result.events.some((e) => e.type === "execute")).toBe(true);
  });
});

describe("runBattle", () => {
  it("resolves a full battle by repeatedly calling pickMove until one side is wiped", async () => {
    const hero = makeCombatant({ id: "hero", stats: { maxHp: 50, hp: 50, attack: 20, defense: 5, speed: 10 } });
    const enemy = makeCombatant({ id: "enemy-1", team: "enemy", stats: { maxHp: 10, hp: 10, attack: 1, defense: 0, speed: 1 } });

    const outcome = await runBattle([hero], [enemy], {
      rng: noCritRng,
      pickMove: (state) => ({ move: state.playerParty[0].moves[0], targetId: "enemy-1" }),
    });

    expect(outcome.victory).toBe(true);
  });

  it("calls onRound after every round with that round's events", async () => {
    const hero = makeCombatant({ id: "hero", stats: { maxHp: 50, hp: 50, attack: 3, defense: 0, speed: 10 } });
    const enemy = makeCombatant({ id: "enemy-1", team: "enemy", stats: { maxHp: 30, hp: 30, attack: 0, defense: 0, speed: 1 } });
    let roundsSeen = 0;

    await runBattle([hero], [enemy], {
      rng: noCritRng,
      pickMove: (state) => ({ move: state.playerParty[0].moves[0], targetId: "enemy-1" }),
      onRound: (events) => {
        roundsSeen++;
        expect(events.length).toBeGreaterThan(0);
      },
    });

    expect(roundsSeen).toBeGreaterThan(1);
  });
});
