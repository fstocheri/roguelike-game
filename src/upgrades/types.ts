import type { HeroClassId } from "../entities/heroClass.js";
import type { Hero } from "../entities/types.js";
import type { Move } from "../entities/move.js";

export type Rarity = "common" | "uncommon" | "rare";

// "offense"/"defense"/"vitality"/"utility" are diminishing-returns stat
// categories. "sustain" heals without granting permanent power. "boon" and
// "curse" are unique effects rather than flat stat changes - boons are
// unambiguously good, curses trade a real cost for a real payoff. "move"
// teaches a new attack (see src/upgrades/moves.ts). Gold is no longer a
// reward-pool category - it's a direct payout for winning a fight (see
// GOLD_PER_ENEMY in src/run/run.ts) so it can fund shop nodes.
export type Category = "offense" | "defense" | "vitality" | "utility" | "sustain" | "boon" | "curse" | "move";

export interface Upgrade {
  id: string;
  name: string;
  flavor: string;
  category: Category;
  rarity: Rarity;
  /** Human-readable effect text computed against this specific hero (reflects current diminishing returns). */
  preview: (hero: Hero) => string;
  apply: (hero: Hero) => Hero;
  /**
   * Present on "move" category upgrades: the move this would teach. A UI
   * can inspect this to offer an interactive "replace which move?" choice
   * when the hero's moveset is full, instead of relying on apply()'s
   * automatic weakest-move fallback (see learnOrReplaceMove).
   */
  grantsMove?: Move;
  /** Present on class-exclusive "move" upgrades: only offered to a hero of one of these classes. Omitted = available to every class. */
  classRestriction?: HeroClassId[];
}
