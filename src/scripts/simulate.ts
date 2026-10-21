import { chooseAiMove } from "../combat/ai.js";
import type { Ally } from "../entities/ally.js";
import { createHero } from "../entities/hero.js";
import { HERO_CLASSES, type HeroClassId } from "../entities/heroClass.js";
import type { Hero } from "../entities/types.js";
import type { FloorMap, FloorNode } from "../run/floorMap.js";
import { simulateRun, type FloorContext } from "../run/run.js";
import { priceFor } from "../upgrades/shop.js";
import type { Upgrade } from "../upgrades/types.js";
import { makeRng } from "../util/rng.js";

// A simple stand-in "AI" for picking rewards until there's a real UI to
// choose from. Combat-power categories are scored by how much they raise
// overall power; sustain is scored by how badly hurt the hero currently is;
// treasure gets a small flat score so it's picked when nothing else is
// appealing. Swap this out for an interactive prompt or a UI callback later
// without touching the run/combat engine at all.
function powerScore(hero: Hero): number {
  return (
    hero.attack * 1.2 +
    hero.defense * 1.5 +
    hero.maxHp * 0.2 +
    hero.speed * 0.8 +
    hero.critChance * 25 +
    hero.lifesteal * 20 +
    hero.thorns * 15 +
    hero.executeThreshold * 30 +
    hero.reviveCharges * 15 +
    hero.moves.length * 10 +
    (hero.guaranteedFirstStrikeCrit ? 5 : 0)
  );
}

function scoreUpgrade(upgrade: Upgrade, hero: Hero): number {
  if (upgrade.category === "sustain") {
    const missingHpFraction = 1 - hero.hp / hero.maxHp;
    return missingHpFraction * 50;
  }
  return powerScore(upgrade.apply(hero)) - powerScore(hero);
}

function pickBestUpgrade(offered: Upgrade[], hero: Hero): Upgrade {
  let best = offered[0];
  let bestScore = -Infinity;
  for (const upgrade of offered) {
    const score = scoreUpgrade(upgrade, hero);
    if (score > bestScore) {
      bestScore = score;
      best = upgrade;
    }
  }
  return best;
}

// Bot always prefers a fight node when one's available (keeps this an
// AI-vs-AI balance-testing harness centered on combat, not a smart shopper).
function pickFloorNode(_map: FloorMap, available: FloorNode[], _hero: Hero, _context: FloorContext): FloorNode {
  return available.find((n) => n.type === "fight") ?? available[0];
}

// Buys the best-scoring affordable item, if any - not a savvy shopper, just
// enough to exercise the shop path in unattended runs.
function pickShopPurchase(offered: Upgrade[], hero: Hero): Upgrade | null {
  const affordable = offered.filter((u) => hero.gold >= priceFor(u));
  if (affordable.length === 0) return null;
  return pickBestUpgrade(affordable, hero);
}

// Always recruits the first offered companion - exercises the companion
// path in unattended runs without needing to be a savvy recruiter.
function pickCompanion(offered: Ally[], _hero: Hero): Ally | null {
  return offered[0] ?? null;
}

const seed = Number(process.argv[2]) || Date.now() % 1_000_000;
console.log(`Simulating run with seed ${seed}\n`);

const rng = makeRng(seed);
const classIds: HeroClassId[] = Object.keys(HERO_CLASSES) as HeroClassId[];
const heroClass = classIds[seed % classIds.length];
console.log(`Class: ${HERO_CLASSES[heroClass].name}\n`);

const result = await simulateRun({
  hero: createHero("Sir Codealot", heroClass),
  rng,
  pickFloorNode,
  pickUpgrade: pickBestUpgrade,
  pickShopPurchase,
  pickCompanion,
  // The hero's move each round is chosen by the same AI heuristic used for
  // enemies - this is a headless "bot plays itself" harness, not a stand-in
  // for real play.
  pickMove: (state, _context) => {
    const hero = state.playerParty.find((c) => c.id === "hero")!;
    const action = chooseAiMove(hero, state.playerParty, state.enemyParty, rng);
    return { move: action.move, targetId: action.targetId };
  },
  maxFloors: 8, // 3 campaign floors + a few endless floors for a demo run
  onEvent: (line) => console.log(line),
});

console.log("\n=== Run Summary ===");
console.log(`Outcome: ${result.outcome}`);
console.log(`Floors cleared: ${result.floorsCleared}`);
console.log(
  `Final hero: HP ${result.finalHero.hp}/${result.finalHero.maxHp}, ATK ${result.finalHero.attack}, DEF ${result.finalHero.defense}, SPD ${result.finalHero.speed}, CRIT ${(result.finalHero.critChance * 100).toFixed(0)}%, LIFESTEAL ${(result.finalHero.lifesteal * 100).toFixed(0)}%, THORNS ${(result.finalHero.thorns * 100).toFixed(0)}%, GOLD ${result.finalHero.gold}`,
);
console.log(`Moves known: ${result.finalHero.moves.map((m) => m.name).join(", ")}`);
console.log(`Allies: ${result.finalHero.allies.map((a) => a.name).join(", ") || "none"}`);
console.log(`Upgrades taken (${result.finalHero.upgrades.length}): ${result.finalHero.upgrades.join(", ")}`);
