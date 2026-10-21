import type { Move } from "./move.js";

// A companion's base stats, scaled by the current floor when converted to a
// Combatant (see allyToCombatant in src/combat/combatant.ts) - the same
// curve enemies use, so a companion recruited early stays relevant deep
// into endless mode without needing its own upgrade system. Fully healed at
// the start of every encounter: no cross-fight attrition to manage for a
// teammate, only "knocked out" for the remainder of a fight they lose in.
export interface Ally {
  id: string;
  name: string;
  flavor: string;
  base: { maxHp: number; attack: number; defense: number; speed: number };
  moves: Move[];
}

function move(id: string, name: string, power: number, target: Move["target"] = "single-enemy"): Move {
  return { id, name, flavor: "", power, target };
}

function selfHeal(id: string, name: string, healFraction: number): Move {
  return { id, name, flavor: "", power: 0, target: "self", selfHealFraction: healFraction };
}

export const ALLY_TEMPLATES: Ally[] = [
  {
    id: "wandering-squire",
    name: "Wandering Squire",
    flavor: "A steady blade, loyal and dependable.",
    base: { maxHp: 40, attack: 7, defense: 3, speed: 5 },
    moves: [move("squire-slash", "Slash", 1.0), move("squire-guard-strike", "Guard Strike", 1.2)],
  },
  {
    id: "hedge-witch",
    name: "Hedge Witch",
    flavor: "Mutters old charms that somehow still work.",
    base: { maxHp: 30, attack: 6, defense: 1, speed: 6 },
    moves: [move("witch-hex", "Hex", 0.9), selfHeal("witch-ward", "Ward", 0.3)],
  },
  {
    id: "grizzled-mercenary",
    name: "Grizzled Mercenary",
    flavor: "Fights for coin, but fights hard.",
    base: { maxHp: 25, attack: 11, defense: 1, speed: 4 },
    moves: [move("merc-heavy-strike", "Heavy Strike", 1.5), move("merc-reckless-swing", "Reckless Swing", 1.9)],
  },
];

export const ALLY_CAP = 2;
