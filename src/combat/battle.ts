import type { Move } from "../entities/move.js";
import type { Rng } from "../util/rng.js";
import { chooseAiMove } from "./ai.js";
import { HERO_COMBATANT_ID, isAlive, type Combatant } from "./combatant.js";
import type { CombatEvent } from "./events.js";

// Same armor formula and crit multiplier the old single-enemy engine used -
// unchanged, just parameterized by move.power now instead of a fixed
// auto-attack.
const ARMOR_CONSTANT = 20;
const CRIT_MULTIPLIER = 1.5;

function mitigatedDamage(attack: number, defense: number): number {
  const reduction = defense / (defense + ARMOR_CONSTANT);
  return Math.max(1, Math.round(attack * (1 - reduction)));
}

export interface Action {
  actorId: string;
  move: Move;
  targetId: string;
}

export interface RoundResult {
  events: CombatEvent[];
  playerParty: Combatant[];
  enemyParty: Combatant[];
}

function cloneParty(party: Combatant[]): Combatant[] {
  return party.map((c) => ({ ...c, stats: { ...c.stats } }));
}

function resolveTargets(
  move: Move,
  actor: Combatant,
  playerParty: Combatant[],
  enemyParty: Combatant[],
  requestedTargetId: string,
): Combatant[] {
  const opposing = actor.team === "player" ? enemyParty : playerParty;
  if (move.target === "all-enemies") return opposing.filter(isAlive);
  if (move.target === "self") return [actor];
  const requested = opposing.find((c) => c.id === requestedTargetId && isAlive(c));
  if (requested) return [requested];
  const fallback = opposing.find(isAlive);
  return fallback ? [fallback] : [];
}

// Applies damage to a combatant, consuming a revive charge instead of
// dying if one is available. Mutates `target` in place (caller works on
// already-cloned party arrays).
function applyDamage(target: Combatant, amount: number): { finalHp: number; revived: boolean } {
  const hpAfter = target.stats.hp - amount;
  if (hpAfter <= 0 && target.reviveCharges > 0) {
    target.reviveCharges -= 1;
    target.stats.hp = 1;
    return { finalHp: 1, revived: true };
  }
  target.stats.hp = Math.max(0, hpAfter);
  return { finalHp: target.stats.hp, revived: false };
}

// Resolves one round: every living combatant with a queued action acts once,
// in speed order (player side wins ties). Pure function - clones its inputs,
// never mutates the arrays passed in.
export function resolveRound(
  playerPartyIn: Combatant[],
  enemyPartyIn: Combatant[],
  actions: Action[],
  rng: Rng,
): RoundResult {
  const playerParty = cloneParty(playerPartyIn);
  const enemyParty = cloneParty(enemyPartyIn);
  const events: CombatEvent[] = [];
  const byId = (id: string) => playerParty.find((c) => c.id === id) ?? enemyParty.find((c) => c.id === id);

  const ordered = actions
    .filter((a) => {
      const actor = byId(a.actorId);
      return actor !== undefined && isAlive(actor);
    })
    .sort((a, b) => {
      const actorA = byId(a.actorId)!;
      const actorB = byId(b.actorId)!;
      if (actorB.stats.speed !== actorA.stats.speed) return actorB.stats.speed - actorA.stats.speed;
      if (actorA.team !== actorB.team) return actorA.team === "player" ? -1 : 1;
      return 0;
    });

  for (const action of ordered) {
    const actor = byId(action.actorId);
    if (!actor || !isAlive(actor)) continue; // may have died earlier this same round

    const move = action.move;

    if (move.target === "self") {
      if (move.selfHealFraction) {
        const healed = Math.round(actor.stats.maxHp * move.selfHealFraction);
        actor.stats.hp = Math.min(actor.stats.maxHp, actor.stats.hp + healed);
        events.push({
          type: "heal",
          actorId: actor.id,
          targetId: actor.id,
          amount: healed,
          targetHpAfter: actor.stats.hp,
          targetMaxHp: actor.stats.maxHp,
        });
      }
      continue;
    }

    const targets = resolveTargets(move, actor, playerParty, enemyParty, action.targetId);
    for (const target of targets) {
      if (!isAlive(target)) continue;

      const crit = rng() < actor.critChance;
      const base = mitigatedDamage(actor.stats.attack * move.power, target.stats.defense);
      const damage = crit ? Math.round(base * CRIT_MULTIPLIER) : base;

      const { finalHp, revived } = applyDamage(target, damage);
      events.push({
        type: "move",
        actorId: actor.id,
        moveId: move.id,
        targetId: target.id,
        damage,
        crit,
        targetHpAfter: finalHp,
        targetMaxHp: target.stats.maxHp,
      });
      if (revived) events.push({ type: "revive", targetId: target.id, chargesLeft: target.reviveCharges });

      if (actor.lifesteal > 0) {
        const healed = Math.round(damage * actor.lifesteal);
        if (healed > 0) {
          actor.stats.hp = Math.min(actor.stats.maxHp, actor.stats.hp + healed);
          events.push({
            type: "heal",
            actorId: actor.id,
            targetId: actor.id,
            amount: healed,
            targetHpAfter: actor.stats.hp,
            targetMaxHp: actor.stats.maxHp,
          });
        }
      }

      if (target.stats.hp > 0 && actor.executeThreshold > 0 && target.stats.hp <= target.stats.maxHp * actor.executeThreshold) {
        target.stats.hp = 0;
        events.push({ type: "execute", targetId: target.id });
      }

      if (target.stats.hp === 0) {
        events.push({ type: "combatant-defeated", combatantId: target.id });
      } else if (target.thorns > 0 && damage > 0) {
        const reflected = Math.round(damage * target.thorns);
        if (reflected > 0) {
          const thornsResult = applyDamage(actor, reflected);
          events.push({
            type: "thorns",
            actorId: target.id,
            targetId: actor.id,
            amount: reflected,
            targetHpAfter: thornsResult.finalHp,
            targetMaxHp: actor.stats.maxHp,
          });
          if (thornsResult.revived) events.push({ type: "revive", targetId: actor.id, chargesLeft: actor.reviveCharges });
          if (actor.stats.hp === 0) events.push({ type: "combatant-defeated", combatantId: actor.id });
        }
      }
    }
  }

  const playerAlive = playerParty.some(isAlive);
  const enemyAlive = enemyParty.some(isAlive);
  if (!playerAlive || !enemyAlive) {
    events.push({ type: playerAlive ? "victory" : "defeat" });
  }

  return { events, playerParty, enemyParty };
}

export interface BattleState {
  playerParty: Combatant[];
  enemyParty: Combatant[];
  round: number;
}

export interface BattleOutcome {
  victory: boolean;
  finalPlayerParty: Combatant[];
  finalEnemyParty: Combatant[];
  allEvents: CombatEvent[];
}

export interface BattleCallbacks {
  rng: Rng;
  pickMove: (state: BattleState) => { move: Move; targetId: string } | Promise<{ move: Move; targetId: string }>;
  onRound?: (events: CombatEvent[], state: BattleState) => void | Promise<void>;
}

// Orchestrates a full battle: asks pickMove for the hero's action each
// round, has AI choose for every other combatant (allies and enemies
// alike), resolves the round, and repeats until one side is wiped.
export async function runBattle(
  initialPlayerParty: Combatant[],
  initialEnemyParty: Combatant[],
  callbacks: BattleCallbacks,
): Promise<BattleOutcome> {
  let playerParty = initialPlayerParty;
  let enemyParty = initialEnemyParty;
  const allEvents: CombatEvent[] = [];

  for (let round = 1; round <= 200; round++) {
    const hero = playerParty.find((c) => c.id === HERO_COMBATANT_ID);
    const actions: Action[] = [];

    if (hero && isAlive(hero)) {
      const heroChoice = await callbacks.pickMove({ playerParty, enemyParty, round });
      actions.push({ actorId: hero.id, move: heroChoice.move, targetId: heroChoice.targetId });
    }

    for (const ally of playerParty.filter((c) => c.id !== HERO_COMBATANT_ID && isAlive(c))) {
      actions.push(chooseAiMove(ally, playerParty, enemyParty, callbacks.rng));
    }
    for (const enemy of enemyParty.filter(isAlive)) {
      actions.push(chooseAiMove(enemy, enemyParty, playerParty, callbacks.rng));
    }

    const result = resolveRound(playerParty, enemyParty, actions, callbacks.rng);
    playerParty = result.playerParty;
    enemyParty = result.enemyParty;
    allEvents.push(...result.events);
    await callbacks.onRound?.(result.events, { playerParty, enemyParty, round });

    const victory = result.events.some((e) => e.type === "victory");
    const defeat = result.events.some((e) => e.type === "defeat");
    if (victory || defeat) {
      return { victory, finalPlayerParty: playerParty, finalEnemyParty: enemyParty, allEvents };
    }
  }

  // Safety cap - should be unreachable in practice.
  return { victory: false, finalPlayerParty: playerParty, finalEnemyParty: enemyParty, allEvents };
}

// Turns an event into a human-readable line for the CLI/headless log.
// `moveNameOf` looks up a move's display name from its id (callers build
// this from the moves known by every combatant in the battle).
export function formatEvent(
  event: CombatEvent,
  nameOf: (id: string) => string,
  moveNameOf: (id: string) => string = (id) => id,
): string {
  switch (event.type) {
    case "move": {
      const hp = `(${nameOf(event.targetId)} HP ${event.targetHpAfter}/${event.targetMaxHp})`;
      return `${nameOf(event.actorId)} uses ${moveNameOf(event.moveId)} on ${nameOf(event.targetId)} for ${event.damage}${event.crit ? " (critical hit!)" : ""}. ${hp}`;
    }
    case "heal":
      return `  ${nameOf(event.actorId)} recovers ${event.amount} HP. (${nameOf(event.targetId)} HP ${event.targetHpAfter}/${event.targetMaxHp})`;
    case "thorns":
      return `  Thorns reflect ${event.amount} damage onto ${nameOf(event.targetId)}. (${nameOf(event.targetId)} HP ${event.targetHpAfter}/${event.targetMaxHp})`;
    case "execute":
      return `  ${nameOf(event.targetId)} is executed!`;
    case "revive":
      return `  ${nameOf(event.targetId)} is saved by a revive charge! (${event.chargesLeft} left)`;
    case "combatant-defeated":
      return `${nameOf(event.combatantId)} is defeated!`;
    case "victory":
      return "Victory!";
    case "defeat":
      return "Defeat...";
  }
}
