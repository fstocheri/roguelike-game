import { formatEvent, runBattle, type BattleState } from "../combat/battle.js";
import {
  allyToCombatant,
  enemyToCombatant,
  heroToCombatant,
  syncHeroFromCombatant,
  type Combatant,
} from "../combat/combatant.js";
import type { CombatEvent } from "../combat/events.js";
import { generateEnemyParty } from "../content/enemies.js";
import { ALLY_CAP, ALLY_TEMPLATES, type Ally } from "../entities/ally.js";
import type { Move } from "../entities/move.js";
import type { Hero } from "../entities/types.js";
import { generateFloorMap, reachableNodes, type FloorMap, type FloorNode } from "./floorMap.js";
import { offerUpgrades } from "../upgrades/offer.js";
import { clampHero } from "../upgrades/scaling.js";
import { offerShopItems, priceFor } from "../upgrades/shop.js";
import type { Upgrade } from "../upgrades/types.js";
import type { Rng } from "../util/rng.js";

export const STEPS_PER_FLOOR = 9;
export const CAMPAIGN_FLOORS = 3;

// Gold is a direct payout for winning a fight, not a reward-pool pick - see
// src/upgrades/shop.ts for what it buys. Skipping a fight for a shop/
// companion node means skipping this payout, which is the "cost" of the
// detour.
export const GOLD_PER_ENEMY = 8;
export const GOLD_BOSS_BONUS = 20;

// Returning a Promise lets a real UI/CLI await player input; a headless
// heuristic can just return synchronously.
export type PickUpgrade = (offered: Upgrade[], hero: Hero) => Upgrade | Promise<Upgrade>;
/** `null` means leave the shop without buying anything. */
export type PickShopPurchase = (offered: Upgrade[], hero: Hero) => Upgrade | null | Promise<Upgrade | null>;
/** `null` means recruit no one this visit. */
export type PickCompanion = (offered: Ally[], hero: Hero) => Ally | null | Promise<Ally | null>;

export interface FloorContext {
  floor: number;
  isEndless: boolean;
}

// context lets a renderer show which floor a map/HUD belongs to as soon as
// it's asked for a node, without needing a separate "floor started" hook.
export type PickFloorNode = (
  map: FloorMap,
  available: FloorNode[],
  hero: Hero,
  context: FloorContext,
) => FloorNode | Promise<FloorNode>;

export interface CombatContext extends FloorContext {
  isBoss: boolean;
}

// context lets a renderer show floor/boss info (banners, HUD text) as soon
// as it's asked for a move, without waiting for the first onRound callback -
// battle.ts's BattleState alone doesn't carry that narrative context.
export type PickMove = (
  state: BattleState,
  context: CombatContext,
) => { move: Move; targetId: string } | Promise<{ move: Move; targetId: string }>;

export interface RunOptions {
  hero: Hero;
  rng: Rng;
  /** Called once per floor step to choose the next map node (fight/shop/companion). */
  pickFloorNode: PickFloorNode;
  pickUpgrade: PickUpgrade;
  /** Called when a shop node is chosen. */
  pickShopPurchase: PickShopPurchase;
  /** Called when a companion-hub node is chosen. */
  pickCompanion: PickCompanion;
  /** Called each round to get the hero's action. Everyone else (enemies, allies) is AI-controlled. */
  pickMove: PickMove;
  /** Safety cap so an endless-mode simulation/session can't run forever. */
  maxFloors?: number;
  onEvent?: (line: string) => void;
  /**
   * Called after each round resolves, so a renderer can animate that round
   * before the next move prompt. A headless caller can just omit it.
   */
  onRound?: (events: CombatEvent[], state: BattleState, context: CombatContext) => void | Promise<void>;
}

export type RunOutcome = "died" | "reached-floor-cap";

export interface RunSummary {
  outcome: RunOutcome;
  floorsCleared: number;
  /** Total enemies defeated across the whole run, including ones from a floor that was never finished. */
  enemiesDefeated: number;
  finalHero: Hero;
  log: string[];
}

function nameLookup(a: Combatant[], b: Combatant[]): (id: string) => string {
  const map = new Map<string, string>();
  for (const c of [...a, ...b]) map.set(c.id, c.name);
  return (id) => map.get(id) ?? id;
}

function moveNameLookup(a: Combatant[], b: Combatant[]): (id: string) => string {
  const map = new Map<string, string>();
  for (const c of [...a, ...b]) for (const m of c.moves) map.set(m.id, m.name);
  return (id) => map.get(id) ?? id;
}

async function runEncounter(
  hero: Hero,
  options: RunOptions,
  context: CombatContext,
  emit: (line: string) => void,
): Promise<{ hero: Hero; victory: boolean; enemiesDefeated: number }> {
  const enemies = generateEnemyParty(context.floor, context.isBoss, options.rng);
  const appearWord = enemies.length > 1 ? "appear" : "appears";
  emit(`${enemies.map((e) => e.name).join(" and ")} ${appearWord}!`);

  const playerParty = [
    heroToCombatant(hero),
    ...hero.allies.map((ally, i) => allyToCombatant(ally, `ally-${i + 1}`, context.floor)),
  ];
  const enemyParty = enemies.map((e, i) => enemyToCombatant(e, `enemy-${i + 1}`));

  const outcome = await runBattle(playerParty, enemyParty, {
    rng: options.rng,
    pickMove: (state) => options.pickMove(state, context),
    onRound: async (events, state) => {
      const nameOf = nameLookup(state.playerParty, state.enemyParty);
      const moveNameOf = moveNameLookup(state.playerParty, state.enemyParty);
      events.forEach((e) => emit(formatEvent(e, nameOf, moveNameOf)));
      await options.onRound?.(events, state, context);
    },
  });

  const updatedHero = syncHeroFromCombatant(hero, outcome.finalPlayerParty[0]);
  // Even on a loss, any enemies already killed before the hero fell still
  // count - dying to the second of two enemies still means one is dead.
  const enemiesDefeated = outcome.finalEnemyParty.filter((c) => c.stats.hp <= 0).length;
  return { hero: updatedHero, victory: outcome.victory, enemiesDefeated };
}

function grantGold(hero: Hero, enemiesDefeated: number, isBoss: boolean, emit: (line: string) => void): Hero {
  const amount = enemiesDefeated * GOLD_PER_ENEMY + (isBoss ? GOLD_BOSS_BONUS : 0);
  if (amount <= 0) return hero;
  emit(`${hero.name} loots ${amount} gold.`);
  return { ...hero, gold: hero.gold + amount };
}

async function grantReward(
  hero: Hero,
  rng: Rng,
  pickUpgrade: PickUpgrade,
  emit: (line: string) => void,
): Promise<Hero> {
  const offered = offerUpgrades(rng, hero.heroClass, 3);
  const chosen = await pickUpgrade(offered, hero);
  const preview = chosen.preview(hero);
  const updated = clampHero(chosen.apply(hero));
  updated.upgrades = [...hero.upgrades, chosen.id];
  emit(`${hero.name} gains: ${chosen.name} - ${preview}.`);
  return updated;
}

async function runShopNode(
  hero: Hero,
  rng: Rng,
  pickShopPurchase: PickShopPurchase,
  emit: (line: string) => void,
): Promise<Hero> {
  const offered = offerShopItems(rng, hero.heroClass, 3);
  const chosen = await pickShopPurchase(offered, hero);
  if (!chosen) {
    emit(`${hero.name} leaves the shop empty-handed.`);
    return hero;
  }

  const price = priceFor(chosen);
  if (hero.gold < price) {
    emit(`${hero.name} can't afford ${chosen.name} (${price} gold).`);
    return hero;
  }

  const preview = chosen.preview(hero);
  const updated = clampHero(chosen.apply(hero));
  updated.gold -= price;
  updated.upgrades = [...hero.upgrades, chosen.id];
  emit(`${hero.name} buys ${chosen.name} for ${price} gold - ${preview}.`);
  return updated;
}

async function runCompanionNode(hero: Hero, pickCompanion: PickCompanion, emit: (line: string) => void): Promise<Hero> {
  if (hero.allies.length >= ALLY_CAP) {
    emit(`${hero.name}'s company is already full.`);
    return hero;
  }

  const offered = ALLY_TEMPLATES.filter((t) => !hero.allies.some((a) => a.id === t.id));
  if (offered.length === 0) {
    emit(`${hero.name} finds no new companions willing to join.`);
    return hero;
  }

  const chosen = await pickCompanion(offered, hero);
  if (!chosen) {
    emit(`${hero.name} continues on alone.`);
    return hero;
  }

  emit(`${chosen.name} joins ${hero.name}'s company!`);
  return { ...hero, allies: [...hero.allies, chosen] };
}

async function runFloorStep(
  hero: Hero,
  node: FloorNode,
  options: RunOptions,
  context: CombatContext,
  emit: (line: string) => void,
): Promise<{ hero: Hero; enemiesDefeated: number; died: boolean }> {
  if (node.type === "shop") {
    const updated = await runShopNode(hero, options.rng, options.pickShopPurchase, emit);
    return { hero: updated, enemiesDefeated: 0, died: false };
  }

  if (node.type === "companion") {
    const updated = await runCompanionNode(hero, options.pickCompanion, emit);
    return { hero: updated, enemiesDefeated: 0, died: false };
  }

  const result = await runEncounter(hero, options, context, emit);
  if (!result.victory) {
    return { hero: result.hero, enemiesDefeated: result.enemiesDefeated, died: true };
  }

  let updated = grantGold(result.hero, result.enemiesDefeated, context.isBoss, emit);
  updated = await grantReward(updated, options.rng, options.pickUpgrade, emit);
  return { hero: updated, enemiesDefeated: result.enemiesDefeated, died: false };
}

// Runs a full campaign: a branching map of 9 steps per floor (fight/shop/
// companion nodes - see src/run/floorMap.ts) then a mandatory boss, floors
// 1-3 fixed then endless scaling beyond that (capped by maxFloors so an
// unattended simulation terminates). Each fight is turn-based: the hero
// picks a move every round via pickMove, everyone else acts by AI.
export async function simulateRun(options: RunOptions): Promise<RunSummary> {
  const { maxFloors = 10 } = options;
  const log: string[] = [];
  const emit = (line: string) => {
    log.push(line);
    options.onEvent?.(line);
  };

  let hero = options.hero;
  let floorsCleared = 0;
  let enemiesDefeated = 0;

  for (let floor = 1; floor <= maxFloors; floor++) {
    const isEndless = floor > CAMPAIGN_FLOORS;
    emit(`\n=== Floor ${floor}${isEndless ? " (endless)" : ""} ===`);

    const map = generateFloorMap(options.rng, hero.allies.length < ALLY_CAP);
    let currentNodeId: string | null = null;

    for (let step = 0; step < STEPS_PER_FLOOR; step++) {
      const available = reachableNodes(map, currentNodeId);
      const node = await options.pickFloorNode(map, available, hero, { floor, isEndless });
      currentNodeId = node.id;

      const result = await runFloorStep(hero, node, options, { floor, isEndless, isBoss: false }, emit);
      hero = result.hero;
      enemiesDefeated += result.enemiesDefeated;

      if (result.died) {
        return { outcome: "died", floorsCleared, enemiesDefeated, finalHero: hero, log };
      }
    }

    emit(`--- Floor ${floor} boss ---`);
    const bossResult = await runEncounter(hero, options, { floor, isEndless, isBoss: true }, emit);
    hero = bossResult.hero;
    enemiesDefeated += bossResult.enemiesDefeated;

    if (!bossResult.victory) {
      return { outcome: "died", floorsCleared, enemiesDefeated, finalHero: hero, log };
    }

    hero = grantGold(hero, bossResult.enemiesDefeated, true, emit);
    floorsCleared = floor;

    // Boss fights also grant a reward, marking real progress.
    hero = await grantReward(hero, options.rng, options.pickUpgrade, emit);
  }

  emit(`\n${hero.name} survived all ${maxFloors} floors (simulation cap reached).`);
  return { outcome: "reached-floor-cap", floorsCleared, enemiesDefeated, finalHero: hero, log };
}
