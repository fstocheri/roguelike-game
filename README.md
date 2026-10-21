# Roguelike Game — Rules Engine

A TypeScript engine for a medieval upgrade-battler roguelike: turn-based,
Pokémon-style fights (pick a move each round, everyone acts in speed order)
along a branching, Slay-the-Spire-style floor map you choose your way
through - 9 steps of fight/merchant/companion-hub nodes, then a mandatory
boss, 3 curated floors then endless scaling. Permadeath per run, with a
small permanent meta-progression layer between runs.

Three ways to experience it: a headless simulator (for fast iteration/
testing), a playable terminal CLI, and a playable browser build with
placeholder animations ("models" are emoji, not art - no design pass has
happened yet, this is purely to feel the rules in motion).

**Status:** recruitable companions are planned next (the companion-hub node
exists on the map but is currently a stub - "the hub is quiet for now").
Everything else - the branching map, multi-enemy fights, gold-from-combat,
the in-run merchant - is live.

## Setup

```
npm install
```

## Play it in the browser (recommended)

```
npm run dev
```

Opens a dev server (prints the local URL, typically http://localhost:5173) -
open it in any browser. Name your hero, then at each floor see the whole
route to the boss and pick your path: fight nodes pay gold and a reward
card, merchant nodes let you spend banked gold on a purchase instead, and
(for now) companion-hub nodes are a placeholder detour. Fights are
turn-based - pick one of your known moves (up to 4 - Pokémon-style cap, so
learning a 5th forces you to choose one to forget) each round and watch it
play out (lunge/flash/floating damage numbers, crit shake, execute/revive
callouts). Spend legacy points in a shop between runs. Progress saves to
the browser's `localStorage` (per-browser, not synced anywhere). `npm run
build` produces a static `dist/` you could deploy later; there's no reason
to do that yet while this is still a placeholder.

## Play it in the terminal

```
npm run play
```

Same rules engine, text-only. Name your hero, optionally spend saved legacy
points in a shop, then at each floor step choose which reachable node to
visit next (shown as a numbered text menu, not a rendered graph - the
browser is where "see the whole route" actually pays off) and choose a move
each round in combat. Progress (best floor, legacy points, permanent
bonuses) is saved to `save.json` and carries into your next run.

## Run a simulated (unattended) playthrough

```
npm run sim            # random seed
npm run sim 42          # fixed seed, reproducible
```

Uses a simple heuristic to auto-pick rewards, and the same AI that pilots
enemies (`src/combat/ai.ts`) to pick the hero's move each round - useful for
testing balance without playing by hand (see `src/scripts/simulate.ts`).

## Run tests

```
npm test
```

## Structure

- `src/entities` — `Hero` / `Enemy` / `StatBlock` / `Move` data shapes.
  A `Move` is a power multiplier + target pattern + optional self-heal - no
  status effects (stun/poison/buffs-over-time) yet, that's a deliberate
  scope cut to keep turn-based combat tractable for now.
- `src/combat/combatant.ts` — the `Combatant` abstraction battle logic
  actually operates on (trimmed down from `Hero`/`Enemy` - just stats,
  moves, and the passive combat fields like crit/lifesteal/thorns). This is
  what lets multi-enemy and ally fights (planned) fall out of the same code
  path instead of needing parallel hero-vs-enemy logic.
- `src/combat/battle.ts` — turn-based battle engine. `resolveRound` resolves
  one round (every living combatant acts once, speed order, player side
  wins ties) and is a pure function - clones its inputs, never mutates.
  `runBattle` orchestrates a full fight: asks `pickMove` for the hero's
  action each round, AI (`src/combat/ai.ts`) chooses for everyone else,
  loops until one side is wiped. Defense mitigates as a percentage
  (`defense / (defense + 20)`), not a flat subtraction, so stacking defense
  can't make a combatant flatly unhittable.
- `src/combat/ai.ts` — shared move-selection heuristic for anyone not
  player-controlled (enemies now, allies once M3 lands): prioritizes a
  lethal finishing blow, otherwise favors strong hits with some randomness,
  heals if hurt and able to.
- `src/upgrades` — the reward pool (`pool.ts`), weighted-offer logic
  (`offer.ts`), anti-snowball helpers (`scaling.ts`), move-learning
  (`moves.ts` - `learnOrReplaceMove` adds a move if there's room, otherwise
  replaces the weakest known move unless the caller specifies which to
  drop), and the in-run merchant (`shop.ts` - reuses the same reward pool,
  priced by rarity, instead of new shop-only content).
- `src/content` — enemy templates (each with 2 moves, so the AI has a real
  choice) and floor-based stat scaling.
- `src/run/floorMap.ts` — the branching map: `generateFloorMap` builds 9
  layers of 3 nodes each (fight/shop/companion, weighted so fight dominates),
  node `i` connects to `{i-1, i, i+1}` in the next layer (Slay the Spire's
  own adjacency rule), all last-layer nodes converge on the boss. Pure and
  deterministic per seed - directly unit-tested (connectivity, boss
  reachability, type-distribution).
- `src/run/run.ts` — sequences a floor's map into a full run
  (`simulateRun`). Takes `pickFloorNode` (which node next), `pickUpgrade`
  (fight-node reward), `pickShopPurchase` (merchant node), and `pickMove`
  (one per combat round) async callbacks, so it doesn't care whether the
  "player" is a heuristic, a human at a terminal prompt, or a browser UI.
  Gold is a direct payout for winning a fight (`GOLD_PER_ENEMY` +
  `GOLD_BOSS_BONUS`) - skipping a fight for a shop/companion node means
  skipping that payout, which is the node's real cost.
- `src/persistence` — `save.ts`: loads/writes `save.json`, converts a
  finished run into legacy points, and applies permanent shop bonuses to a
  new hero.
- `src/scripts/simulate.ts` — headless CLI harness for unattended runs.
- `src/scripts/play.ts` — interactive terminal CLI: hero naming, the legacy
  shop, floor-node choice as a text menu, merchant purchases, per-round move
  selection, and reward selection (including the "which move do I forget"
  prompt when the moveset is full) via `node:readline/promises`.
- `src/web/` — the browser build (Vite + vanilla TS, no game framework):
  `main.ts` is the screen state machine (title/shop/map/battle/merchant/
  reward/game-over), `mapView.ts` draws the whole floor map as inline SVG
  once per floor (nodes + edges, left-to-right by layer) and stays alive
  across shop/fight detours within that floor (re-inserted into a fresh
  container each time control returns to it) so the visited-node trail
  persists, `battle.ts` renders the arena and walks a round's
  `CombatEvent[]` to animate each one (lunge, hit-flash, floating damage
  numbers, crit shake, death fade), `characterArt.ts` maps names to
  placeholder emoji, `settings.ts` holds the animation-speed preference
  (1x/2x/4x, cycled via the HUD button, persisted to `localStorage`),
  `localSave.ts` mirrors `persistence/save.ts` but backed by `localStorage`
  instead of a file.
- `src/persistence/types.ts` — the storage-agnostic pieces of meta-progression
  (shapes, legacy point math, permanent-bonus application), shared by both the
  Node file-backed save (`save.ts`) and the browser localStorage one.
- `test/` — vitest unit tests for combat math, upgrades, run sequencing, and
  save/load.

## Reward design (the "abundance of choices" system)

Every reward offer draws 3 options from one shared pool spanning 9
categories, so a given offer is **not guaranteed to contain a pure power
upgrade**:

| Category | What it does | Anti-snowball mechanism |
|---|---|---|
| `offense` / `defense` / `vitality` / `utility` | Flat stat upgrades (attack, defense, max HP, speed/crit/lifesteal/thorns) | **Diminishing returns**: the Nth pick in a category is worth less than the last (`src/upgrades/scaling.ts::diminish`) |
| `sustain` | Heal now, no permanent stat change | Naturally self-limiting - wasted value at full HP |
| `boon` | Unique effects (guaranteed first-strike crit, execute low-HP enemies, revive-on-death charges) | Flat, capped growth (e.g. execute threshold caps at 18%) |
| `curse` | Real power for a real cost (e.g. Blood Pact: +attack, -20% current max HP) | Diminishing returns on the payoff, same as stat categories |
| `move` | Learn a new move, capped at 4 known - forces a real "what do I drop" decision once full | The cap itself; see `src/upgrades/moves.ts` |

On top of per-upgrade diminishing returns, percentage stats (crit, lifesteal,
thorns, execute threshold) are hard-capped after every reward is applied
(`clampHero`), so no build can reach degenerate values like unkillable via
lifesteal. Rare-rarity rewards are also weighted to show up roughly half as
often as they used to (`src/upgrades/offer.ts`), so a "rare" actually feels
rare.

## The floor map (fight/shop/companion nodes)

Each floor generates a 9-step branching map up front (`generateFloorMap`):
3 nodes per layer, each independently typed fight/shop/companion by
weighted random (fight ~65%, shop ~25%, companion ~10% - no hard guarantee
a "pure fight" path exists, same as Slay the Spire doesn't guarantee one
either). Picking a node other than fight is a real trade: you skip that
step's gold and reward card, and get whatever the alternate offers instead.
The boss at the end is unaffected - always mandatory, always a fight.

- **Fight** - the existing turn-based battle, then `GOLD_PER_ENEMY` gold per
  enemy defeated (`GOLD_BOSS_BONUS` extra on the boss) plus a free reward
  card, same as before.
- **Merchant** - offers 3 items from the same reward pool, priced by rarity
  (`src/upgrades/shop.ts`), buy at most one with banked gold or leave. No
  fight, no gold, no free card - the purchase *is* the reward.
- **Companion Hub** - currently a stub ("the hub is quiet for now"); real
  companion recruitment is the next thing being built on top of this.

## Meta-progression

A run always ends in death (or, for the simulator, hitting a floor cap).
`recordRun` converts that into legacy points (`enemiesDefeated * 3 +
floorsCleared * 10 + gold / 5`) and tracks best floor reached. Points come
from every enemy beaten, not just full floor clears - a run that's too hard
to survive floor 1 still earns real progress, rather than the catch-22 of
needing to clear a floor to get strong enough to clear a floor. Between
runs, `npm run play` offers a shop to
spend legacy points on small permanent bonuses (flat attack/defense/speed/max
HP) applied to every future hero. `save.json` is gitignored - delete it to
reset progress. (Moves and allies picked up mid-run do **not** persist -
only the shop's flat bonuses carry between runs, matching the permadeath
design: you get stronger over time through the meta-shop, not by keeping a
build.)

## Design notes

- The engine stayed pure and framework-agnostic on purpose, and it's paid
  off twice now: once when the browser UI got added on top without changing
  combat math, and again in the turn-based rework, where the interactive
  per-round decision loop plugs into the exact same `pickUpgrade`-style
  async-callback pattern the reward system already used. `resolveRound` is
  still a pure, synchronous function; `runBattle` is the only place that
  actually awaits anything.
- Combat, upgrades, and enemy generation all take an injected RNG
  (`src/util/rng.ts`, seedable) instead of calling `Math.random()` directly,
  so runs and tests are reproducible.
- Floors 1-3 are curated; floor 4+ is "endless" and scales exponentially
  (`1.25^floor`, not linear) so a hero who's still getting upgrades every
  fight doesn't eventually trivialize late floors.
- `simulate.ts`'s heuristic (reward picks *and* move choice) is a rough
  stand-in for a player, not a balance authority - if a run feels too easy
  or too hard when you actually play it via `npm run dev`/`npm run play`,
  that's the real signal to retune numbers in `src/content/enemies.ts` or
  `src/upgrades/pool.ts`.
