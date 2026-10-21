import type { Hero } from "../entities/types.js";

// Diminishing returns: the Nth upgrade in a category is worth less than the
// first. This is the main defense against snowballing - stacking the same
// stat repeatedly has shrinking payoff, so spreading picks across categories
// (or taking non-power rewards) stays competitive.
export function diminish(base: number, picksSoFar: number, decay = 0.22): number {
  return Math.max(1, Math.round(base / (1 + picksSoFar * decay)));
}

export function picksIn(hero: Hero, category: string): number {
  return hero.categoryPicks[category] ?? 0;
}

export function bumpCategory(hero: Hero, category: string): Record<string, number> {
  return { ...hero.categoryPicks, [category]: picksIn(hero, category) + 1 };
}

export function bumpCategories(hero: Hero, categories: string[]): Record<string, number> {
  const picks = { ...hero.categoryPicks };
  for (const category of categories) {
    picks[category] = (picks[category] ?? 0) + 1;
  }
  return picks;
}

// Hard ceilings on percentage-based stats so no single stacked build can
// reach degenerate values (e.g. 100% lifesteal = unkillable).
export const CAPS = {
  critChance: 0.5,
  lifesteal: 0.4,
  thorns: 0.4,
  executeThreshold: 0.18,
} as const;

export function clampHero(hero: Hero): Hero {
  return {
    ...hero,
    critChance: Math.min(hero.critChance, CAPS.critChance),
    lifesteal: Math.min(hero.lifesteal, CAPS.lifesteal),
    thorns: Math.min(hero.thorns, CAPS.thorns),
    executeThreshold: Math.min(hero.executeThreshold, CAPS.executeThreshold),
    hp: Math.min(hero.hp, hero.maxHp),
  };
}
