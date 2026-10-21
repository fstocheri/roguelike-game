import type { Hero } from "../entities/types.js";
import type { Move } from "../entities/move.js";

export const MAX_MOVES = 4;

// If the hero has room, learns the move. If the moveset is full, replaces
// the weakest known move (by power) unless `replaceId` names a specific one
// to swap out - the web UI uses `replaceId` to let the player choose; the
// CLI/headless callers get this sane default without needing their own UI
// for it. A no-op if the move is already known.
export function learnOrReplaceMove(hero: Hero, move: Move, replaceId?: string): Hero {
  if (hero.moves.some((m) => m.id === move.id)) return hero;
  if (hero.moves.length < MAX_MOVES) {
    return { ...hero, moves: [...hero.moves, move] };
  }
  const targetId = replaceId ?? [...hero.moves].sort((a, b) => a.power - b.power)[0].id;
  return { ...hero, moves: hero.moves.map((m) => (m.id === targetId ? move : m)) };
}

export function movePreview(hero: Hero, move: Move): string {
  if (hero.moves.some((m) => m.id === move.id)) {
    return `${move.name} (already known) - power x${move.power}`;
  }
  if (hero.moves.length < MAX_MOVES) {
    return `Learn ${move.name} - power x${move.power}`;
  }
  return `Replace a move with ${move.name} - power x${move.power}`;
}
