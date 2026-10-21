import type { Ally } from "./ally.js";
import type { HeroClassId } from "./heroClass.js";
import type { Move } from "./move.js";

export interface StatBlock {
  maxHp: number;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
}

export interface Hero extends StatBlock {
  name: string;
  heroClass: HeroClassId;
  critChance: number; // 0-1
  lifesteal: number; // fraction of damage dealt that is healed back
  thorns: number; // fraction of damage taken that is reflected to the attacker
  executeThreshold: number; // 0-1; hero's attacks instantly kill enemies at/below this % HP
  reviveCharges: number; // survive an otherwise-lethal hit with 1 HP, consuming one charge
  guaranteedFirstStrikeCrit: boolean; // hero's first attack of every fight is a guaranteed crit
  gold: number; // meta-progression currency, has no in-run combat effect
  categoryPicks: Record<string, number>; // upgrades taken per category, used for diminishing returns
  upgrades: string[]; // ids of upgrades applied so far, for display/debugging
  moves: Move[]; // known moves, capped at 4 - see src/upgrades/moves.ts
  allies: Ally[]; // recruited companions, capped at ALLY_CAP - see src/entities/ally.ts
}

export interface Enemy extends StatBlock {
  name: string;
  isBoss: boolean;
  moves: Move[];
}
