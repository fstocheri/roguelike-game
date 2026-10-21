import type { RunSummary } from "../run/run.js";
import { defaultSave, normalizeSave, recordRunInto, type SaveData } from "../persistence/types.js";

export type { PermanentBonuses, SaveData } from "../persistence/types.js";
export { applyPermanentBonuses, computeLegacyPointsEarned, SHOP_PRICES } from "../persistence/types.js";

const STORAGE_KEY = "roguelike-save";

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSave(JSON.parse(raw)) : defaultSave();
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Private browsing / storage disabled - progress just won't persist this session.
  }
}

export function recordRun(save: SaveData, result: RunSummary): number {
  const earned = recordRunInto(save, result);
  writeSave(save);
  return earned;
}
