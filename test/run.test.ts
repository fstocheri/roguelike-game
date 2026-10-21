import { describe, expect, it } from "vitest";
import type { BattleState } from "../src/combat/battle.js";
import type { Ally } from "../src/entities/ally.js";
import { createHero } from "../src/entities/hero.js";
import type { FloorMap, FloorNode } from "../src/run/floorMap.js";
import { simulateRun, type CombatContext } from "../src/run/run.js";
import { makeRng } from "../src/util/rng.js";
import type { Upgrade } from "../src/upgrades/types.js";

const pickFirst = (offered: Upgrade[]) => offered[0];

// Always prefers a fight node so these tests exercise combat, not the
// shop/companion detour paths (those get their own dedicated tests).
const pickFightNode = (_map: FloorMap, available: FloorNode[]) => available.find((n) => n.type === "fight") ?? available[0];

const declineShopPurchase = () => null;
const declineCompanion = () => null;

// Always swings with the hero's first known move at whichever enemy is
// still standing - deterministic enough for these tests without needing
// the full chooseAiMove heuristic.
const pickFirstMove = (state: BattleState, _context: CombatContext) => {
  const hero = state.playerParty.find((c) => c.id === "hero")!;
  const enemy = state.enemyParty.find((c) => c.stats.hp > 0) ?? state.enemyParty[0];
  return { move: hero.moves[0], targetId: enemy.id };
};

describe("simulateRun", () => {
  it("ends with either death or hitting the floor cap, never silently stalling", async () => {
    const result = await simulateRun({
      hero: createHero("Test Hero"),
      rng: makeRng(1),
      pickFloorNode: pickFightNode,
      pickUpgrade: pickFirst,
      pickShopPurchase: declineShopPurchase,
      pickCompanion: declineCompanion,
      pickMove: pickFirstMove,
      maxFloors: 4,
    });

    expect(["died", "reached-floor-cap"]).toContain(result.outcome);
    expect(result.log.length).toBeGreaterThan(0);
  });

  it("floorsCleared never exceeds maxFloors", async () => {
    const result = await simulateRun({
      hero: createHero("Test Hero"),
      rng: makeRng(99),
      pickFloorNode: pickFightNode,
      pickUpgrade: pickFirst,
      pickShopPurchase: declineShopPurchase,
      pickCompanion: declineCompanion,
      pickMove: pickFirstMove,
      maxFloors: 2,
    });

    expect(result.floorsCleared).toBeLessThanOrEqual(2);
  });

  it("a stronger starting hero clears more floors on the same seed", async () => {
    const weakResult = await simulateRun({
      hero: createHero("Weak Hero"),
      rng: makeRng(5),
      pickFloorNode: pickFightNode,
      pickUpgrade: pickFirst,
      pickShopPurchase: declineShopPurchase,
      pickCompanion: declineCompanion,
      pickMove: pickFirstMove,
      maxFloors: 5,
    });

    const strongHero = createHero("Strong Hero");
    strongHero.attack = 100;
    strongHero.defense = 50;
    strongHero.maxHp = 500;
    strongHero.hp = 500;

    const strongResult = await simulateRun({
      hero: strongHero,
      rng: makeRng(5),
      pickFloorNode: pickFightNode,
      pickUpgrade: pickFirst,
      pickShopPurchase: declineShopPurchase,
      pickCompanion: declineCompanion,
      pickMove: pickFirstMove,
      maxFloors: 5,
    });

    expect(strongResult.floorsCleared).toBeGreaterThanOrEqual(weakResult.floorsCleared);
  });

  it("supports an async pickMove and pickUpgrade (as a real UI/CLI would use)", async () => {
    const asyncPickMove = async (state: BattleState, _context: CombatContext) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return pickFirstMove(state, _context);
    };
    const asyncPickUpgrade = async (offered: Upgrade[]) => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      return offered[0];
    };

    const result = await simulateRun({
      hero: createHero("Test Hero"),
      rng: makeRng(3),
      pickFloorNode: pickFightNode,
      pickUpgrade: asyncPickUpgrade,
      pickShopPurchase: declineShopPurchase,
      pickCompanion: declineCompanion,
      pickMove: asyncPickMove,
      maxFloors: 2,
    });

    expect(["died", "reached-floor-cap"]).toContain(result.outcome);
  });

  it("choosing shop nodes over fights forgoes the enemy kills those steps would have given", async () => {
    const pickShopWhenAvailable = (_map: FloorMap, available: FloorNode[]) =>
      available.find((n) => n.type === "shop") ?? available.find((n) => n.type === "fight") ?? available[0];

    // Deliberately overpowered so neither run can die - isolates the node-
    // choice mechanic from survival luck (a mortal "always fight" hero can
    // die early and rack up *fewer* kills than one who ducks into shops and
    // lives longer, which would make this comparison flaky/backwards).
    function invincibleHero(name: string) {
      const h = createHero(name);
      h.attack = 500;
      h.defense = 200;
      h.maxHp = 5000;
      h.hp = 5000;
      return h;
    }

    const fightRun = await simulateRun({
      hero: invincibleHero("Fighter"),
      rng: makeRng(11),
      pickFloorNode: pickFightNode,
      pickUpgrade: pickFirst,
      pickShopPurchase: declineShopPurchase,
      pickCompanion: declineCompanion,
      pickMove: pickFirstMove,
      maxFloors: 1,
    });

    const shopRun = await simulateRun({
      hero: invincibleHero("Shopper"),
      rng: makeRng(11),
      pickFloorNode: pickShopWhenAvailable,
      pickUpgrade: pickFirst,
      pickShopPurchase: declineShopPurchase,
      pickCompanion: declineCompanion,
      pickMove: pickFirstMove,
      maxFloors: 1,
    });

    expect(fightRun.floorsCleared).toBe(1);
    expect(shopRun.floorsCleared).toBe(1);
    expect(fightRun.enemiesDefeated).toBeGreaterThanOrEqual(shopRun.enemiesDefeated);
  });

  it("actually spending gold at shop nodes never drives gold negative", async () => {
    const pickShopWhenAvailable = (_map: FloorMap, available: FloorNode[]) =>
      available.find((n) => n.type === "shop") ?? available.find((n) => n.type === "fight") ?? available[0];
    // Always buy the first offered item - run.ts itself re-checks affordability
    // and refuses the purchase (with no gold deducted) if it can't be afforded.
    const buyFirstItem = (offered: Upgrade[]) => offered[0];

    const result = await simulateRun({
      hero: createHero("Shopper"),
      rng: makeRng(23),
      pickFloorNode: pickShopWhenAvailable,
      pickUpgrade: pickFirst,
      pickShopPurchase: buyFirstItem,
      pickCompanion: declineCompanion,
      pickMove: pickFirstMove,
      maxFloors: 2,
    });

    expect(result.finalHero.gold).toBeGreaterThanOrEqual(0);
  });

  it("recruiting at a companion node adds an ally who fights in subsequent battles", async () => {
    const pickCompanionWhenAvailable = (_map: FloorMap, available: FloorNode[]) =>
      available.find((n) => n.type === "companion") ?? available.find((n) => n.type === "fight") ?? available[0];
    const recruitFirst = (offered: Ally[]) => offered[0];

    const result = await simulateRun({
      hero: createHero("Test Hero"),
      rng: makeRng(2),
      pickFloorNode: pickCompanionWhenAvailable,
      pickUpgrade: pickFirst,
      pickShopPurchase: declineShopPurchase,
      pickCompanion: recruitFirst,
      pickMove: pickFirstMove,
      maxFloors: 1,
    });

    expect(result.finalHero.allies.length).toBeGreaterThan(0);
    expect(result.finalHero.allies.length).toBeLessThanOrEqual(2);
  });
});
