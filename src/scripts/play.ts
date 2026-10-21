import { createInterface } from "node:readline/promises";
import type { BattleState } from "../combat/battle.js";
import type { CombatContext } from "../run/run.js";
import type { Ally } from "../entities/ally.js";
import { createHero } from "../entities/hero.js";
import { HERO_CLASSES, type HeroClassId } from "../entities/heroClass.js";
import type { Move } from "../entities/move.js";
import type { Hero } from "../entities/types.js";
import {
  applyPermanentBonuses,
  loadSave,
  recordRun,
  SHOP_PRICES,
  type SaveData,
} from "../persistence/save.js";
import type { FloorMap, FloorNode, NodeType } from "../run/floorMap.js";
import { simulateRun, type FloorContext } from "../run/run.js";
import { learnOrReplaceMove, MAX_MOVES } from "../upgrades/moves.js";
import { priceFor } from "../upgrades/shop.js";
import type { Upgrade } from "../upgrades/types.js";
import { makeRng } from "../util/rng.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function askNumber(prompt: string, min: number, max: number): Promise<number> {
  for (;;) {
    const answer = (await rl.question(prompt)).trim();
    const n = Number.parseInt(answer, 10);
    if (Number.isInteger(n) && n >= min && n <= max) return n;
    console.log(`Please enter a number between ${min} and ${max}.`);
  }
}

async function runShop(save: SaveData): Promise<void> {
  console.log(`\n=== Legacy Shop === (${save.legacyPoints} legacy points available)`);
  console.log("Spend points on permanent bonuses that apply to every future run.");

  for (;;) {
    console.log(
      `\n1. +1 Attack (permanent: ${save.permanentBonuses.attack}) - ${SHOP_PRICES.attack} pts\n` +
        `2. +1 Defense (permanent: ${save.permanentBonuses.defense}) - ${SHOP_PRICES.defense} pts\n` +
        `3. +1 Speed (permanent: ${save.permanentBonuses.speed}) - ${SHOP_PRICES.speed} pts\n` +
        `4. +5 Max HP (permanent: ${save.permanentBonuses.maxHp}) - ${SHOP_PRICES.maxHp} pts\n` +
        `5. Done shopping, start the run (${save.legacyPoints} pts remaining)`,
    );
    const choice = await askNumber("Choose (1-5): ", 1, 5);

    if (choice === 5) return;

    const purchases: Record<number, { cost: number; apply: () => void }> = {
      1: { cost: SHOP_PRICES.attack, apply: () => (save.permanentBonuses.attack += 1) },
      2: { cost: SHOP_PRICES.defense, apply: () => (save.permanentBonuses.defense += 1) },
      3: { cost: SHOP_PRICES.speed, apply: () => (save.permanentBonuses.speed += 1) },
      4: { cost: SHOP_PRICES.maxHp, apply: () => (save.permanentBonuses.maxHp += 5) },
    };
    const purchase = purchases[choice];
    if (save.legacyPoints < purchase.cost) {
      console.log("Not enough legacy points.");
      continue;
    }
    save.legacyPoints -= purchase.cost;
    purchase.apply();
  }
}

async function pickMove(state: BattleState, _context: CombatContext): Promise<{ move: Move; targetId: string }> {
  const hero = state.playerParty.find((c) => c.id === "hero")!;
  const aliveEnemies = state.enemyParty.filter((c) => c.stats.hp > 0);

  console.log(`\n${hero.name} HP ${hero.stats.hp}/${hero.stats.maxHp}`);
  aliveEnemies.forEach((e) => console.log(`  vs ${e.name} HP ${e.stats.hp}/${e.stats.maxHp}`));
  hero.moves.forEach((m, i) => {
    const heal = m.selfHealFraction ? `, heals ${Math.round(m.selfHealFraction * 100)}%` : "";
    console.log(`  ${i + 1}. ${m.name} (power x${m.power}${heal}) - "${m.flavor}"`);
  });
  const choice = await askNumber(`Choose a move (1-${hero.moves.length}): `, 1, hero.moves.length);
  const move = hero.moves[choice - 1];

  if (move.target === "single-enemy" && aliveEnemies.length > 1) {
    console.log("Choose a target:");
    aliveEnemies.forEach((e, i) => console.log(`  ${i + 1}. ${e.name} (HP ${e.stats.hp}/${e.stats.maxHp})`));
    const targetChoice = await askNumber(`Choose (1-${aliveEnemies.length}): `, 1, aliveEnemies.length);
    return { move, targetId: aliveEnemies[targetChoice - 1].id };
  }

  return { move, targetId: aliveEnemies[0]?.id ?? "" };
}

function describeNodeType(type: NodeType): string {
  switch (type) {
    case "fight":
      return "Fight";
    case "shop":
      return "Merchant (spend gold)";
    case "companion":
      return "Companion Hub";
    case "boss":
      return "Boss";
  }
}

async function pickFloorNode(
  _map: FloorMap,
  available: FloorNode[],
  hero: Hero,
  _context: FloorContext,
): Promise<FloorNode> {
  console.log(`\n${hero.name} reaches a fork in the path (HP ${hero.hp}/${hero.maxHp}, Gold ${hero.gold}):`);
  available.forEach((n, i) => console.log(`  ${i + 1}. ${describeNodeType(n.type)}`));
  const choice = await askNumber(`Choose (1-${available.length}): `, 1, available.length);
  return available[choice - 1];
}

async function pickShopPurchase(offered: Upgrade[], hero: Hero): Promise<Upgrade | null> {
  console.log(`\n${hero.name} browses the merchant's wares (Gold: ${hero.gold}):`);
  offered.forEach((u, i) => {
    const price = priceFor(u);
    const afford = hero.gold >= price ? "" : " (can't afford)";
    console.log(`  ${i + 1}. [${u.rarity} ${u.category}] ${u.name} -- ${u.preview(hero)} -- ${price} gold${afford}`);
    console.log(`     "${u.flavor}"`);
  });
  console.log(`  ${offered.length + 1}. Leave without buying`);
  const choice = await askNumber(`Choose (1-${offered.length + 1}): `, 1, offered.length + 1);
  return choice === offered.length + 1 ? null : offered[choice - 1];
}

async function pickCompanion(offered: Ally[], hero: Hero): Promise<Ally | null> {
  console.log(`\n${hero.name} finds companions willing to travel along:`);
  offered.forEach((a, i) => {
    console.log(`  ${i + 1}. ${a.name} - HP ${a.base.maxHp}, ATK ${a.base.attack}, DEF ${a.base.defense}, SPD ${a.base.speed}`);
    console.log(`     "${a.flavor}" (moves: ${a.moves.map((m) => m.name).join(", ")})`);
  });
  console.log(`  ${offered.length + 1}. Continue alone`);
  const choice = await askNumber(`Choose (1-${offered.length + 1}): `, 1, offered.length + 1);
  return choice === offered.length + 1 ? null : offered[choice - 1];
}

async function chooseHeroClass(): Promise<HeroClassId> {
  const ids = Object.keys(HERO_CLASSES) as HeroClassId[];
  console.log("\nChoose your class:");
  ids.forEach((id, i) => {
    const def = HERO_CLASSES[id];
    console.log(
      `  ${i + 1}. ${def.name} - HP ${def.baseStats.maxHp}, ATK ${def.baseStats.attack}, DEF ${def.baseStats.defense}, SPD ${def.baseStats.speed}, CRIT ${Math.round(def.baseStats.critChance * 100)}%`,
    );
    console.log(`     "${def.flavor}" (starts with: ${def.startingMove.name})`);
  });
  const choice = await askNumber(`Choose (1-${ids.length}): `, 1, ids.length);
  return ids[choice - 1];
}

async function pickUpgrade(offered: Upgrade[], hero: Hero): Promise<Upgrade> {
  console.log(`\n${hero.name} may choose a reward (HP ${hero.hp}/${hero.maxHp}):`);
  offered.forEach((u, i) => {
    console.log(`  ${i + 1}. [${u.rarity} ${u.category}] ${u.name} -- ${u.preview(hero)}`);
    console.log(`     "${u.flavor}"`);
  });
  const choice = await askNumber(`Choose (1-${offered.length}): `, 1, offered.length);
  const chosen = offered[choice - 1];

  const newMove = chosen.grantsMove;
  const movesetFull = hero.moves.length >= MAX_MOVES && !hero.moves.some((m) => m.id === newMove?.id);
  if (newMove && movesetFull) {
    console.log(`\nYour moveset is full. Which move should ${hero.name} forget to learn ${newMove.name}?`);
    hero.moves.forEach((m, i) => console.log(`  ${i + 1}. ${m.name} (power x${m.power})`));
    const replaceChoice = await askNumber(`Choose (1-${hero.moves.length}): `, 1, hero.moves.length);
    const replaceId = hero.moves[replaceChoice - 1].id;
    return { ...chosen, apply: (h) => learnOrReplaceMove(h, newMove, replaceId) };
  }

  return chosen;
}

async function main(): Promise<void> {
  const save = loadSave();
  console.log("=== Medieval Roguelike ===");
  console.log(
    `Welcome back. Runs so far: ${save.totalRuns}. Best floor reached: ${save.bestFloor}. Legacy points: ${save.legacyPoints}.`,
  );

  const name = (await rl.question("\nName your hero (blank for 'Hero'): ")).trim() || "Hero";
  const heroClass = await chooseHeroClass();

  if (save.legacyPoints > 0) {
    await runShop(save);
  }

  let hero = createHero(name, heroClass);
  hero = applyPermanentBonuses(hero, save.permanentBonuses);

  console.log(`\n${name} sets out. Floors 1-3 are the campaign; floor 4+ is endless. Good luck.`);

  const result = await simulateRun({
    hero,
    rng: makeRng(Date.now()),
    pickFloorNode,
    pickUpgrade,
    pickShopPurchase,
    pickCompanion,
    pickMove,
    maxFloors: 50, // effectively endless for a real playthrough
    onEvent: (line) => console.log(line),
  });

  console.log("\n=== Run Over ===");
  console.log(`Outcome: ${result.outcome}`);
  console.log(`Enemies defeated: ${result.enemiesDefeated}`);
  console.log(`Floors cleared: ${result.floorsCleared}`);
  console.log(`Gold collected: ${result.finalHero.gold}`);
  console.log(`Allies: ${result.finalHero.allies.map((a) => a.name).join(", ") || "none"}`);

  const earned = recordRun(save, result);
  console.log(`\nEarned ${earned} legacy points this run. Total: ${save.legacyPoints}.`);
  console.log("Spend them at the start of your next run. See you back at the shop.");

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exitCode = 1;
});
