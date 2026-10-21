// A Move is deliberately simple for v1: a power multiplier applied to the
// user's attack stat, a target pattern, and an optional self-heal. No
// status effects (stun/poison/buffs-over-time) yet - that's a real system
// of its own, cut from this pass to keep turn-based combat tractable. This
// reuses the existing passive stat system (crit/lifesteal/thorns/execute/
// revive, all on the Combatant) unchanged; a Move only decides what action
// is taken and how hard it hits.
export interface Move {
  id: string;
  name: string;
  flavor: string;
  power: number; // multiplier on the user's attack stat before defense mitigation
  target: "single-enemy" | "all-enemies" | "self";
  selfHealFraction?: number; // fraction of the user's max HP healed on use (target: "self")
}

// Universal moves - learnable by any class as reward-pool picks, no class
// restriction.
export const HEAVY_BLOW: Move = {
  id: "heavy-blow",
  name: "Heavy Blow",
  flavor: "Wind up and put your whole body into it.",
  power: 1.6,
  target: "single-enemy",
};

export const SECOND_WIND: Move = {
  id: "second-wind",
  name: "Second Wind",
  flavor: "Catch your breath and steady your nerve.",
  power: 0,
  target: "self",
  selfHealFraction: 0.25,
};

export const WHIRLWIND_STRIKE: Move = {
  id: "whirlwind-strike",
  name: "Whirlwind Strike",
  flavor: "One motion, every foe in reach.",
  power: 0.7,
  target: "all-enemies",
};

// Class starting moves - each hero begins knowing exactly their class's one,
// nothing else. Same baseline power as the old class-agnostic "Strike" so
// class identity comes from stats and the class-exclusive moves below, not
// from the opening move being strictly better/worse.
export const CLEAVE: Move = {
  id: "cleave",
  name: "Cleave",
  flavor: "A broad, heavy swing.",
  power: 1.0,
  target: "single-enemy",
};

export const QUICK_SHOT: Move = {
  id: "quick-shot",
  name: "Quick Shot",
  flavor: "Fast, precise, reliable.",
  power: 1.0,
  target: "single-enemy",
};

export const ARCANE_BOLT: Move = {
  id: "arcane-bolt",
  name: "Arcane Bolt",
  flavor: "A crackling mote of raw force.",
  power: 1.0,
  target: "single-enemy",
};

// Class-exclusive learnable moves - only offered to a hero of the matching
// class (see Upgrade.classRestriction in src/upgrades/types.ts).
export const SHIELD_BASH: Move = {
  id: "shield-bash",
  name: "Shield Bash",
  flavor: "Slam them with your shield, staggering their guard.",
  power: 1.3,
  target: "single-enemy",
};

export const RALLYING_CRY: Move = {
  id: "rallying-cry",
  name: "Rallying Cry",
  flavor: "A roar that steadies your resolve.",
  power: 0,
  target: "self",
  selfHealFraction: 0.2,
};

export const PIERCING_SHOT: Move = {
  id: "piercing-shot",
  name: "Piercing Shot",
  flavor: "Aimed true, it finds the gap in their armor.",
  power: 1.4,
  target: "single-enemy",
};

export const RAPID_VOLLEY: Move = {
  id: "rapid-volley",
  name: "Rapid Volley",
  flavor: "Loose a spread of arrows across the field.",
  power: 0.6,
  target: "all-enemies",
};

export const FIREBALL: Move = {
  id: "fireball",
  name: "Fireball",
  flavor: "A roiling orb of flame, saved for when it truly matters.",
  power: 1.6,
  target: "single-enemy",
};

export const FROST_NOVA: Move = {
  id: "frost-nova",
  name: "Frost Nova",
  flavor: "Ice bursts outward, biting at every foe in reach.",
  power: 0.8,
  target: "all-enemies",
};
