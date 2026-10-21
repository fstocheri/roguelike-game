import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RunSummary } from "../run/run.js";
import { defaultSave, normalizeSave, recordRunInto, type SaveData } from "./types.js";

export type { PermanentBonuses, SaveData } from "./types.js";
export { applyPermanentBonuses, computeLegacyPointsEarned, SHOP_PRICES } from "./types.js";

const SAVE_PATH = path.join(process.cwd(), "save.json");

export function loadSave(): SaveData {
  if (!existsSync(SAVE_PATH)) return defaultSave();
  try {
    return normalizeSave(JSON.parse(readFileSync(SAVE_PATH, "utf-8")));
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: SaveData): void {
  writeFileSync(SAVE_PATH, JSON.stringify(save, null, 2), "utf-8");
}

export function recordRun(save: SaveData, result: RunSummary): number {
  const earned = recordRunInto(save, result);
  writeSave(save);
  return earned;
}
