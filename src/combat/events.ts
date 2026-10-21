// Structured combat events, ID-addressed so they work for any number of
// participants on either side (not just a single hero vs a single enemy).
// A renderer walks these to animate; the CLI formats them into text lines
// (see formatEvent in battle.ts).
export type CombatEvent =
  | {
      type: "move";
      actorId: string;
      moveId: string;
      targetId: string;
      damage: number;
      crit: boolean;
      targetHpAfter: number;
      targetMaxHp: number;
    }
  | { type: "heal"; actorId: string; targetId: string; amount: number; targetHpAfter: number; targetMaxHp: number }
  | { type: "thorns"; actorId: string; targetId: string; amount: number; targetHpAfter: number; targetMaxHp: number }
  | { type: "execute"; targetId: string }
  | { type: "revive"; targetId: string; chargesLeft: number }
  | { type: "combatant-defeated"; combatantId: string }
  | { type: "victory" }
  | { type: "defeat" };
