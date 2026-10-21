import type { Move } from "../entities/move.js";
import type { Rng } from "../util/rng.js";
import type { Action } from "./battle.js";
import { isAlive, type Combatant } from "./combatant.js";

const ARMOR_CONSTANT = 20;

function estimateDamage(actor: Combatant, move: Move, target: Combatant): number {
  const reduction = target.stats.defense / (target.stats.defense + ARMOR_CONSTANT);
  return Math.max(1, Math.round(actor.stats.attack * move.power * (1 - reduction)));
}

// Shared move-selection heuristic for anyone not player-controlled (enemies
// and, from M3, allies). Intentionally simple but genuinely threatening:
// prioritizes finishing off a low-HP target, otherwise favors strong hits
// with some randomness so fights don't feel perfectly solved. Heals when
// hurt if a self-heal move is available. Pure function of its inputs.
export function chooseAiMove(actor: Combatant, ownParty: Combatant[], opposingParty: Combatant[], rng: Rng): Action {
  const aliveTargets = opposingParty.filter(isAlive);
  const attackMoves = actor.moves.filter((m) => m.target !== "self");
  const healMove = actor.moves.find((m) => m.target === "self" && m.selfHealFraction);

  const hpFraction = actor.stats.hp / actor.stats.maxHp;
  if (healMove && hpFraction < 0.4 && rng() < 0.7) {
    return { actorId: actor.id, move: healMove, targetId: actor.id };
  }

  interface Candidate {
    move: Move;
    target: Combatant;
    damage: number;
    lethal: boolean;
  }
  const candidates: Candidate[] = [];
  const movePool = attackMoves.length > 0 ? attackMoves : actor.moves;
  for (const move of movePool) {
    for (const target of aliveTargets) {
      const damage = estimateDamage(actor, move, target);
      candidates.push({ move, target, damage, lethal: damage >= target.stats.hp });
    }
  }

  if (candidates.length === 0) {
    // No live targets or moves - shouldn't happen in practice, but never
    // crash: just have the actor pass with whatever their first move is,
    // targeting themself, so the round can still resolve.
    return { actorId: actor.id, move: actor.moves[0] ?? healMove!, targetId: actor.id };
  }

  const lethal = candidates.filter((c) => c.lethal);
  const pool = lethal.length > 0 ? lethal : candidates;
  pool.sort((a, b) => b.damage - a.damage);
  const topChoices = pool.slice(0, Math.min(2, pool.length));
  const pickIdx = Math.min(topChoices.length - 1, Math.floor(rng() * topChoices.length));
  const choice = topChoices[pickIdx];
  return { actorId: actor.id, move: choice.move, targetId: choice.target.id };
}
