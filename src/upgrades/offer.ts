import type { HeroClassId } from "../entities/heroClass.js";
import type { Rng } from "../util/rng.js";
import { UPGRADE_POOL } from "./pool.js";
import type { Upgrade } from "./types.js";

const RARITY_WEIGHT: Record<Upgrade["rarity"], number> = {
  common: 6,
  uncommon: 3,
  rare: 1,
};

// Builds a weighted bag (commons appear more often than rares) from
// whichever upgrades this hero's class can actually take, shuffles it, then
// picks `count` distinct upgrades out of it.
export function offerUpgrades(rng: Rng, heroClass: HeroClassId, count = 3): Upgrade[] {
  const eligible = UPGRADE_POOL.filter((u) => !u.classRestriction || u.classRestriction.includes(heroClass));

  const bag: Upgrade[] = [];
  for (const upgrade of eligible) {
    for (let i = 0; i < RARITY_WEIGHT[upgrade.rarity]; i++) {
      bag.push(upgrade);
    }
  }

  // Fisher-Yates shuffle
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }

  const seen = new Set<string>();
  const offered: Upgrade[] = [];
  for (const upgrade of bag) {
    if (seen.has(upgrade.id)) continue;
    seen.add(upgrade.id);
    offered.push(upgrade);
    if (offered.length === count) break;
  }
  return offered;
}
