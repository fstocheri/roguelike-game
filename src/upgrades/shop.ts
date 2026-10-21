import type { HeroClassId } from "../entities/heroClass.js";
import type { Rng } from "../util/rng.js";
import { offerUpgrades } from "./offer.js";
import type { Rarity, Upgrade } from "./types.js";

// Shop items are drawn from the exact same pool as reward cards (no separate
// shop-only content to author) - the difference is you pay gold for them
// instead of getting one free after a fight.
export const SHOP_ITEM_PRICES: Record<Rarity, number> = {
  common: 20,
  uncommon: 40,
  rare: 80,
};

export function offerShopItems(rng: Rng, heroClass: HeroClassId, count = 3): Upgrade[] {
  return offerUpgrades(rng, heroClass, count);
}

export function priceFor(upgrade: Upgrade): number {
  return SHOP_ITEM_PRICES[upgrade.rarity];
}
