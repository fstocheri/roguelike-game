import {
  FIREBALL,
  FROST_NOVA,
  HEAVY_BLOW,
  PIERCING_SHOT,
  RALLYING_CRY,
  RAPID_VOLLEY,
  SECOND_WIND,
  SHIELD_BASH,
  WHIRLWIND_STRIKE,
} from "../entities/move.js";
import { learnOrReplaceMove, movePreview } from "./moves.js";
import { bumpCategories, bumpCategory, diminish, picksIn } from "./scaling.js";
import type { Upgrade } from "./types.js";

// Every upgrade is a pure transform: (hero) -> new hero. Stat-based upgrades
// (offense/defense/vitality/utility) use diminish()/picksIn() so repeated
// picks in the same category shrink in value - the main defense against
// snowballing. Sustain, treasure, boon and curse entries deliberately don't
// grant raw combat power, so a player is never guaranteed all three offered
// choices are "get stronger."
export const UPGRADE_POOL: Upgrade[] = [
  {
    id: "sharpened-blade",
    name: "Sharpened Blade",
    flavor: "A finer edge cuts deeper.",
    category: "offense",
    rarity: "common",
    preview: (h) => `+${diminish(3, picksIn(h, "offense"))} Attack`,
    apply: (h) => ({
      ...h,
      attack: h.attack + diminish(3, picksIn(h, "offense")),
      categoryPicks: bumpCategory(h, "offense"),
    }),
  },
  {
    id: "iron-skin",
    name: "Iron Skin",
    flavor: "Toughened hide turns aside blows.",
    category: "defense",
    rarity: "common",
    preview: (h) => `+${diminish(2, picksIn(h, "defense"))} Defense`,
    apply: (h) => ({
      ...h,
      defense: h.defense + diminish(2, picksIn(h, "defense")),
      categoryPicks: bumpCategory(h, "defense"),
    }),
  },
  {
    id: "vitality-boost",
    name: "Vitality Boost",
    flavor: "Your body learns to endure.",
    category: "vitality",
    rarity: "common",
    preview: (h) => `+${diminish(15, picksIn(h, "vitality"))} Max HP (also heals that much)`,
    apply: (h) => {
      const gain = diminish(15, picksIn(h, "vitality"));
      return { ...h, maxHp: h.maxHp + gain, hp: h.hp + gain, categoryPicks: bumpCategory(h, "vitality") };
    },
  },
  {
    id: "field-rations",
    name: "Field Rations",
    flavor: "No lasting power, but a full belly helps.",
    category: "sustain",
    rarity: "common",
    preview: (h) => `Heal ${Math.round(h.maxHp * 0.3)} HP now`,
    apply: (h) => ({ ...h, hp: Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.3)) }),
  },
  {
    id: "quickstep",
    name: "Quickstep",
    flavor: "Light feet decide who strikes first.",
    category: "utility",
    rarity: "uncommon",
    preview: (h) => `+${diminish(2, picksIn(h, "utility"))} Speed`,
    apply: (h) => ({
      ...h,
      speed: h.speed + diminish(2, picksIn(h, "utility")),
      categoryPicks: bumpCategory(h, "utility"),
    }),
  },
  {
    id: "keen-eye",
    name: "Keen Eye",
    flavor: "You see the gap in every guard.",
    category: "utility",
    rarity: "uncommon",
    preview: (h) => `+${diminish(10, picksIn(h, "utility"))}% Critical Chance`,
    apply: (h) => ({
      ...h,
      critChance: h.critChance + diminish(10, picksIn(h, "utility")) / 100,
      categoryPicks: bumpCategory(h, "utility"),
    }),
  },
  {
    id: "berserkers-fury",
    name: "Berserker's Fury",
    flavor: "Power, at the cost of caution.",
    category: "offense",
    rarity: "uncommon",
    preview: (h) => `+${diminish(6, picksIn(h, "offense"))} Attack, -1 Defense`,
    apply: (h) => ({
      ...h,
      attack: h.attack + diminish(6, picksIn(h, "offense")),
      defense: Math.max(0, h.defense - 1),
      categoryPicks: bumpCategory(h, "offense"),
    }),
  },
  {
    id: "fortify",
    name: "Fortify",
    flavor: "A heavier stance, slower to react.",
    category: "defense",
    rarity: "uncommon",
    preview: (h) => `+${diminish(4, picksIn(h, "defense"))} Defense, -1 Speed`,
    apply: (h) => ({
      ...h,
      defense: h.defense + diminish(4, picksIn(h, "defense")),
      speed: Math.max(1, h.speed - 1),
      categoryPicks: bumpCategory(h, "defense"),
    }),
  },
  {
    id: "adrenaline-rush",
    name: "Adrenaline Rush",
    flavor: "The first blow always finds its mark.",
    category: "boon",
    rarity: "uncommon",
    preview: () => "Guaranteed critical hit on your first strike of every fight",
    apply: (h) => ({ ...h, guaranteedFirstStrikeCrit: true }),
  },
  {
    id: "vampiric-edge",
    name: "Vampiric Edge",
    flavor: "Every wound you deal feeds you.",
    category: "utility",
    rarity: "rare",
    preview: (h) => `+${diminish(15, picksIn(h, "utility"))}% Lifesteal`,
    apply: (h) => ({
      ...h,
      lifesteal: h.lifesteal + diminish(15, picksIn(h, "utility")) / 100,
      categoryPicks: bumpCategory(h, "utility"),
    }),
  },
  {
    id: "thorned-armor",
    name: "Thorned Armor",
    flavor: "Strike the wearer, pay the price.",
    category: "utility",
    rarity: "rare",
    preview: (h) => `+${diminish(20, picksIn(h, "utility"))}% Thorns`,
    apply: (h) => ({
      ...h,
      thorns: h.thorns + diminish(20, picksIn(h, "utility")) / 100,
      categoryPicks: bumpCategory(h, "utility"),
    }),
  },
  {
    id: "giants-strength",
    name: "Giant's Strength",
    flavor: "Sheer size, sheer power, sheer bulk.",
    category: "offense",
    rarity: "rare",
    preview: (h) =>
      `+${diminish(10, picksIn(h, "offense"))} Attack, +${diminish(10, picksIn(h, "vitality"))} Max HP, -2 Speed`,
    apply: (h) => {
      const atkGain = diminish(10, picksIn(h, "offense"));
      const hpGain = diminish(10, picksIn(h, "vitality"));
      return {
        ...h,
        attack: h.attack + atkGain,
        maxHp: h.maxHp + hpGain,
        hp: h.hp + hpGain,
        speed: Math.max(1, h.speed - 2),
        categoryPicks: bumpCategories(h, ["offense", "vitality"]),
      };
    },
  },
  {
    id: "executioners-mark",
    name: "Executioner's Mark",
    flavor: "The nearly-dead don't get a second chance.",
    category: "boon",
    rarity: "rare",
    preview: () => "+5% Execute Threshold (instantly kill enemies at/below this much HP)",
    apply: (h) => ({ ...h, executeThreshold: h.executeThreshold + 0.05 }),
  },
  {
    id: "guardian-angel",
    name: "Guardian Angel",
    flavor: "Death will have to try again.",
    category: "boon",
    rarity: "rare",
    preview: () => "+1 Revive Charge (survive a lethal hit with 1 HP)",
    apply: (h) => ({ ...h, reviveCharges: h.reviveCharges + 1 }),
  },
  {
    id: "blood-pact",
    name: "Blood Pact",
    flavor: "Strength borrowed from your own future.",
    category: "curse",
    rarity: "uncommon",
    preview: (h) =>
      `+${diminish(12, picksIn(h, "curse"))} Attack, but lose 20% of your current Max HP (${Math.round(h.maxHp * 0.2)})`,
    apply: (h) => {
      const gain = diminish(12, picksIn(h, "curse"));
      const newMaxHp = Math.max(1, Math.round(h.maxHp * 0.8));
      return {
        ...h,
        attack: h.attack + gain,
        maxHp: newMaxHp,
        hp: Math.min(h.hp, newMaxHp),
        categoryPicks: bumpCategory(h, "curse"),
      };
    },
  },
  {
    id: "learn-heavy-blow",
    name: "Learn: Heavy Blow",
    flavor: "Wind up and put your whole body into it.",
    category: "move",
    rarity: "uncommon",
    grantsMove: HEAVY_BLOW,
    preview: (h) => movePreview(h, HEAVY_BLOW),
    apply: (h) => learnOrReplaceMove(h, HEAVY_BLOW),
  },
  {
    id: "learn-second-wind",
    name: "Learn: Second Wind",
    flavor: "Catch your breath and steady your nerve.",
    category: "move",
    rarity: "uncommon",
    grantsMove: SECOND_WIND,
    preview: (h) => movePreview(h, SECOND_WIND),
    apply: (h) => learnOrReplaceMove(h, SECOND_WIND),
  },
  {
    id: "learn-whirlwind-strike",
    name: "Learn: Whirlwind Strike",
    flavor: "One motion, every foe in reach.",
    category: "move",
    rarity: "rare",
    grantsMove: WHIRLWIND_STRIKE,
    preview: (h) => movePreview(h, WHIRLWIND_STRIKE),
    apply: (h) => learnOrReplaceMove(h, WHIRLWIND_STRIKE),
  },
  {
    id: "learn-shield-bash",
    name: "Learn: Shield Bash",
    flavor: "Slam them with your shield, staggering their guard.",
    category: "move",
    rarity: "uncommon",
    classRestriction: ["warrior"],
    grantsMove: SHIELD_BASH,
    preview: (h) => movePreview(h, SHIELD_BASH),
    apply: (h) => learnOrReplaceMove(h, SHIELD_BASH),
  },
  {
    id: "learn-rallying-cry",
    name: "Learn: Rallying Cry",
    flavor: "A roar that steadies your resolve.",
    category: "move",
    rarity: "uncommon",
    classRestriction: ["warrior"],
    grantsMove: RALLYING_CRY,
    preview: (h) => movePreview(h, RALLYING_CRY),
    apply: (h) => learnOrReplaceMove(h, RALLYING_CRY),
  },
  {
    id: "learn-piercing-shot",
    name: "Learn: Piercing Shot",
    flavor: "Aimed true, it finds the gap in their armor.",
    category: "move",
    rarity: "uncommon",
    classRestriction: ["ranger"],
    grantsMove: PIERCING_SHOT,
    preview: (h) => movePreview(h, PIERCING_SHOT),
    apply: (h) => learnOrReplaceMove(h, PIERCING_SHOT),
  },
  {
    id: "learn-rapid-volley",
    name: "Learn: Rapid Volley",
    flavor: "Loose a spread of arrows across the field.",
    category: "move",
    rarity: "rare",
    classRestriction: ["ranger"],
    grantsMove: RAPID_VOLLEY,
    preview: (h) => movePreview(h, RAPID_VOLLEY),
    apply: (h) => learnOrReplaceMove(h, RAPID_VOLLEY),
  },
  {
    id: "learn-fireball",
    name: "Learn: Fireball",
    flavor: "A roiling orb of flame, saved for when it truly matters.",
    category: "move",
    rarity: "uncommon",
    classRestriction: ["wizard"],
    grantsMove: FIREBALL,
    preview: (h) => movePreview(h, FIREBALL),
    apply: (h) => learnOrReplaceMove(h, FIREBALL),
  },
  {
    id: "learn-frost-nova",
    name: "Learn: Frost Nova",
    flavor: "Ice bursts outward, biting at every foe in reach.",
    category: "move",
    rarity: "rare",
    classRestriction: ["wizard"],
    grantsMove: FROST_NOVA,
    preview: (h) => movePreview(h, FROST_NOVA),
    apply: (h) => learnOrReplaceMove(h, FROST_NOVA),
  },
];

export function findUpgrade(id: string): Upgrade {
  const upgrade = UPGRADE_POOL.find((u) => u.id === id);
  if (!upgrade) throw new Error(`Unknown upgrade id: ${id}`);
  return upgrade;
}
