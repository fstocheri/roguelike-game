import type { Ally } from "../entities/ally.js";
import type { Enemy, Hero, StatBlock } from "../entities/types.js";
import type { Move } from "../entities/move.js";
import { scaleFor } from "../content/enemies.js";

// Battle logic (src/combat/battle.ts, src/combat/ai.ts) only ever sees
// Combatant[] on each side - it doesn't know or care whether a given one is
// the hero, an ally, or an enemy. Hero carries a lot of meta-progression
// fields (gold, categoryPicks, upgrade history) that don't belong here;
// this is the trimmed-down view combat actually operates on.
export interface Combatant {
  id: string;
  team: "player" | "enemy";
  name: string;
  stats: StatBlock;
  critChance: number;
  lifesteal: number;
  thorns: number;
  executeThreshold: number;
  reviveCharges: number;
  moves: Move[];
}

export const HERO_COMBATANT_ID = "hero";

export function heroToCombatant(hero: Hero): Combatant {
  return {
    id: HERO_COMBATANT_ID,
    team: "player",
    name: hero.name,
    stats: { maxHp: hero.maxHp, hp: hero.hp, attack: hero.attack, defense: hero.defense, speed: hero.speed },
    critChance: hero.critChance,
    lifesteal: hero.lifesteal,
    thorns: hero.thorns,
    executeThreshold: hero.executeThreshold,
    reviveCharges: hero.reviveCharges,
    moves: hero.moves,
  };
}

// Combat only ever changes hp and reviveCharges (consumed on a save).
// Everything else about the hero (stats, moves, gold, upgrade history) is
// untouched by a fight and stays as it was.
export function syncHeroFromCombatant(hero: Hero, combatant: Combatant): Hero {
  return { ...hero, hp: combatant.stats.hp, reviveCharges: combatant.reviveCharges };
}

export function enemyToCombatant(enemy: Enemy, id: string): Combatant {
  return {
    id,
    team: "enemy",
    name: enemy.name,
    stats: { maxHp: enemy.maxHp, hp: enemy.hp, attack: enemy.attack, defense: enemy.defense, speed: enemy.speed },
    critChance: 0,
    lifesteal: 0,
    thorns: 0,
    executeThreshold: 0,
    reviveCharges: 0,
    moves: enemy.moves,
  };
}

// Allies scale with the current floor the same way enemies do (reusing
// enemies.ts's scaleFor), so a companion recruited early stays relevant
// deep into endless mode without needing its own upgrade system. Always
// starts a fight at full HP - see src/entities/ally.ts.
export function allyToCombatant(ally: Ally, id: string, floor: number): Combatant {
  const multiplier = scaleFor(floor);
  const maxHp = Math.round(ally.base.maxHp * multiplier);
  return {
    id,
    team: "player",
    name: ally.name,
    stats: {
      maxHp,
      hp: maxHp,
      attack: Math.round(ally.base.attack * multiplier),
      defense: Math.round(ally.base.defense * multiplier),
      speed: ally.base.speed,
    },
    critChance: 0,
    lifesteal: 0,
    thorns: 0,
    executeThreshold: 0,
    reviveCharges: 0,
    moves: ally.moves,
  };
}

export function isAlive(c: Combatant): boolean {
  return c.stats.hp > 0;
}
