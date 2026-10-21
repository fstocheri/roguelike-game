import "./style.css";
import type { BattleState } from "../combat/battle.js";
import type { CombatEvent } from "../combat/events.js";
import type { Ally } from "../entities/ally.js";
import { createHero } from "../entities/hero.js";
import { HERO_CLASSES, type HeroClassId } from "../entities/heroClass.js";
import type { Move } from "../entities/move.js";
import type { Hero } from "../entities/types.js";
import type { FloorMap, FloorNode } from "../run/floorMap.js";
import { simulateRun, type CombatContext, type FloorContext, type RunSummary } from "../run/run.js";
import { learnOrReplaceMove, MAX_MOVES } from "../upgrades/moves.js";
import { priceFor } from "../upgrades/shop.js";
import type { Upgrade } from "../upgrades/types.js";
import { makeRng } from "../util/rng.js";
import { applyPermanentBonuses, loadSave, recordRun, SHOP_PRICES, writeSave, type SaveData } from "./localSave.js";
import { BattleView } from "./battle.js";
import { iconForCategory } from "./characterArt.js";
import { MapView } from "./mapView.js";

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("Missing #app root element");
const app: HTMLDivElement = appRoot;

function titleScreen(save: SaveData): Promise<string> {
  app.innerHTML = `
    <h1>Ashes &amp; Iron</h1>
    <p class="subtitle">A medieval upgrade-battler roguelike (placeholder build)</p>
    <div class="panel stack">
      <div class="stat-row">
        <span>Runs: <b>${save.totalRuns}</b></span>
        <span>Best floor: <b>${save.bestFloor}</b></span>
        <span>Legacy points: <b>${save.legacyPoints}</b></span>
      </div>
      <input type="text" id="hero-name" placeholder="Name your hero" maxlength="20" />
      <button id="start-btn">Begin Run</button>
    </div>
  `;
  const nameInput = app.querySelector<HTMLInputElement>("#hero-name")!;
  const startBtn = app.querySelector<HTMLButtonElement>("#start-btn")!;
  nameInput.focus();
  return new Promise((resolve) => {
    const go = () => resolve(nameInput.value.trim() || "Hero");
    startBtn.addEventListener("click", go);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
  });
}

function classScreen(): Promise<HeroClassId> {
  return new Promise((resolve) => {
    const ids = Object.keys(HERO_CLASSES) as HeroClassId[];
    app.innerHTML = `
      <h1>Choose Your Class</h1>
      <div class="reward-cards">
        ${ids
          .map((id) => {
            const def = HERO_CLASSES[id];
            return `
          <div class="reward-card" data-class-id="${id}" style="--rarity: #6b6b80">
            <div class="rarity-tag">Starts with: ${def.startingMove.name}</div>
            <div class="card-name">${def.name}</div>
            <div class="card-effect">HP ${def.baseStats.maxHp} - ATK ${def.baseStats.attack} - DEF ${def.baseStats.defense} - SPD ${def.baseStats.speed} - CRIT ${Math.round(def.baseStats.critChance * 100)}%</div>
            <div class="card-flavor">"${def.flavor}"</div>
          </div>`;
          })
          .join("")}
      </div>
    `;
    app.querySelectorAll<HTMLElement>("[data-class-id]").forEach((card) => {
      card.addEventListener("click", () => resolve(card.dataset.classId as HeroClassId));
    });
  });
}

function shopScreen(save: SaveData): Promise<void> {
  return new Promise((resolve) => {
    const purchases: Array<{ key: keyof typeof SHOP_PRICES; label: string; bonusText: () => string }> = [
      { key: "attack", label: "+1 Attack", bonusText: () => `currently +${save.permanentBonuses.attack}` },
      { key: "defense", label: "+1 Defense", bonusText: () => `currently +${save.permanentBonuses.defense}` },
      { key: "speed", label: "+1 Speed", bonusText: () => `currently +${save.permanentBonuses.speed}` },
      { key: "maxHp", label: "+5 Max HP", bonusText: () => `currently +${save.permanentBonuses.maxHp}` },
    ];

    function renderShop(): void {
      app.innerHTML = `
        <h1>Legacy Shop</h1>
        <p class="subtitle">${save.legacyPoints} legacy points available - spend on permanent bonuses</p>
        <div class="panel stack">
          ${purchases
            .map(
              (p) => `
            <div class="shop-row">
              <span>${p.label} <span style="color: var(--muted)">(${p.bonusText()})</span></span>
              <button data-buy="${p.key}" class="secondary">${SHOP_PRICES[p.key]} pts</button>
            </div>`,
            )
            .join("")}
          <button id="shop-done">Start Run</button>
        </div>
      `;
      app.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.dataset.buy as keyof typeof SHOP_PRICES;
          const cost = SHOP_PRICES[key];
          if (save.legacyPoints < cost) return;
          save.legacyPoints -= cost;
          if (key === "maxHp") save.permanentBonuses.maxHp += 5;
          else save.permanentBonuses[key] += 1;
          writeSave(save);
          renderShop();
        });
      });
      app.querySelector("#shop-done")!.addEventListener("click", () => resolve());
    }
    renderShop();
  });
}

function rarityColor(rarity: string): string {
  if (rarity === "rare") return "#d8b34a";
  if (rarity === "uncommon") return "#4c9fd8";
  return "#6b6b80";
}

// Reused for both the reward-card screen and the "which move do I forget"
// sub-screen (same card grid, different content/click behavior).
function renderCardGrid(
  title: string,
  subtitle: string,
  cards: Array<{ rarityBorder: string; tag: string; name: string; effect: string; flavor: string }>,
  onPick: (idx: number) => void,
): void {
  app.innerHTML = `
    <h1>${title}</h1>
    <p class="subtitle center-text">${subtitle}</p>
    <div class="reward-cards">
      ${cards
        .map(
          (c, i) => `
        <div class="reward-card" data-idx="${i}" style="--rarity: ${c.rarityBorder}">
          <div class="rarity-tag">${c.tag}</div>
          <div class="card-name">${c.name}</div>
          <div class="card-effect">${c.effect}</div>
          <div class="card-flavor">${c.flavor}</div>
        </div>`,
        )
        .join("")}
    </div>
  `;
  app.querySelectorAll<HTMLElement>(".reward-card").forEach((card) => {
    card.addEventListener("click", () => onPick(Number(card.dataset.idx)));
  });
}

function rewardScreen(offered: Upgrade[], hero: Hero): Promise<Upgrade> {
  return new Promise((resolve) => {
    function showReplacePrompt(chosen: Upgrade, newMove: Move): void {
      renderCardGrid(
        "Moveset Full",
        `Which move should ${hero.name} forget to learn ${newMove.name}?`,
        hero.moves.map((m) => ({
          rarityBorder: "#6b6b80",
          tag: "known move",
          name: m.name,
          effect: m.target === "self" ? `Heals ${Math.round((m.selfHealFraction ?? 0) * 100)}%` : `Power x${m.power}`,
          flavor: `"${m.flavor}"`,
        })),
        (idx) => resolve({ ...chosen, apply: (h) => learnOrReplaceMove(h, newMove, hero.moves[idx].id) }),
      );
    }

    renderCardGrid(
      "Choose Your Reward",
      `${hero.name} - HP ${hero.hp}/${hero.maxHp}`,
      offered.map((u) => ({
        rarityBorder: rarityColor(u.rarity),
        tag: `${u.rarity} - ${iconForCategory(u.category)} ${u.category}`,
        name: u.name,
        effect: u.preview(hero),
        flavor: `"${u.flavor}"`,
      })),
      (idx) => {
        const chosen = offered[idx];
        const newMove = chosen.grantsMove;
        const movesetFull = hero.moves.length >= MAX_MOVES && !hero.moves.some((m) => m.id === newMove?.id);
        if (newMove && movesetFull) showReplacePrompt(chosen, newMove);
        else resolve(chosen);
      },
    );
  });
}

// The in-run merchant: spend gold on at most one item, or leave. Distinct
// from the between-run Legacy Shop above (that spends legacy points on
// permanent bonuses; this spends in-run gold on a single reward pick).
function shopNodeScreen(offered: Upgrade[], hero: Hero): Promise<Upgrade | null> {
  return new Promise((resolve) => {
    app.innerHTML = `
      <h1>Merchant</h1>
      <p class="subtitle center-text">${hero.name} - Gold: ${hero.gold}</p>
      <div class="reward-cards">
        ${offered
          .map((u, i) => {
            const price = priceFor(u);
            const afford = hero.gold >= price;
            return `
          <div class="reward-card${afford ? "" : " unaffordable"}" data-idx="${i}" style="--rarity: ${rarityColor(u.rarity)}">
            <div class="rarity-tag">${u.rarity} - ${iconForCategory(u.category)} ${u.category}</div>
            <div class="card-name">${u.name}</div>
            <div class="card-effect">${u.preview(hero)}</div>
            <div class="card-flavor">"${u.flavor}"</div>
            <div class="card-price">${price} gold${afford ? "" : " - can't afford"}</div>
          </div>`;
          })
          .join("")}
      </div>
      <button id="leave-shop-btn" class="secondary" type="button">Leave without buying</button>
    `;
    offered.forEach((u, i) => {
      if (hero.gold < priceFor(u)) return; // unaffordable cards aren't clickable
      app.querySelector(`[data-idx="${i}"]`)?.addEventListener("click", () => resolve(u));
    });
    app.querySelector("#leave-shop-btn")!.addEventListener("click", () => resolve(null));
  });
}

// The companion hub: recruit at most one ally per visit, or continue alone.
function companionScreen(offered: Ally[], hero: Hero): Promise<Ally | null> {
  return new Promise((resolve) => {
    app.innerHTML = `
      <h1>Companion Hub</h1>
      <p class="subtitle center-text">${hero.name} - ${hero.allies.length}/2 companions</p>
      <div class="reward-cards">
        ${offered
          .map(
            (a, i) => `
          <div class="reward-card" data-idx="${i}" style="--rarity: #4c9fd8">
            <div class="rarity-tag">Companion</div>
            <div class="card-name">${a.name}</div>
            <div class="card-effect">HP ${a.base.maxHp} - ATK ${a.base.attack} - DEF ${a.base.defense} - SPD ${a.base.speed}</div>
            <div class="card-flavor">"${a.flavor}" (moves: ${a.moves.map((m) => m.name).join(", ")})</div>
          </div>`,
          )
          .join("")}
      </div>
      <button id="leave-companion-btn" class="secondary" type="button">Continue alone</button>
    `;
    offered.forEach((a, i) => {
      app.querySelector(`[data-idx="${i}"]`)?.addEventListener("click", () => resolve(a));
    });
    app.querySelector("#leave-companion-btn")!.addEventListener("click", () => resolve(null));
  });
}

function gameOverScreen(result: RunSummary, earned: number, save: SaveData): Promise<void> {
  return new Promise((resolve) => {
    app.innerHTML = `
      <h1>${result.outcome === "died" ? "You Have Fallen" : "Run Complete"}</h1>
      <div class="panel stack">
        <div class="stat-row">
          <span>Enemies defeated: <b>${result.enemiesDefeated}</b></span>
          <span>Floors cleared: <b>${result.floorsCleared}</b></span>
          <span>Gold collected: <b>${result.finalHero.gold}</b></span>
        </div>
        <div class="stat-row">
          <span>Legacy points earned: <b>${earned}</b></span>
        </div>
        <div class="stat-row">
          <span>Total legacy points: <b>${save.legacyPoints}</b></span>
          <span>Best floor ever: <b>${save.bestFloor}</b></span>
        </div>
        <p class="subtitle">Moves known: ${result.finalHero.moves.map((m) => m.name).join(", ")}</p>
        <p class="subtitle">Allies: ${result.finalHero.allies.map((a) => a.name).join(", ") || "none"}</p>
        <button id="again-btn">Play Again</button>
      </div>
    `;
    app.querySelector("#again-btn")!.addEventListener("click", () => resolve());
  });
}

async function playRun(hero: Hero): Promise<RunSummary> {
  let battle: BattleView | null = null;
  let mapView: MapView | null = null;
  let currentMapRef: FloorMap | null = null;
  // Whichever screen is currently on-page gets emitted log lines - a battle
  // routes them into its scrolling log, the map routes them into a small
  // status line (e.g. a shop purchase confirmation, or the companion-hub
  // stub message) so nothing is emitted into thin air between screens.
  let logSink: (line: string) => void = () => {};

  const showMapScreen = (map: FloorMap, heroNow: Hero, context: FloorContext): void => {
    if (map !== currentMapRef) {
      currentMapRef = map;
      mapView = new MapView(map);
    }
    app.innerHTML = `
      <h1>Floor ${context.floor}${context.isEndless ? " (Endless)" : ""}</h1>
      <p class="subtitle center-text">${heroNow.name} - HP ${heroNow.hp}/${heroNow.maxHp} - Gold ${heroNow.gold}</p>
      <div class="panel" data-map-root></div>
      <p class="subtitle center-text" data-map-message></p>
    `;
    app.querySelector("[data-map-root]")!.appendChild(mapView!.element);
    const messageEl = app.querySelector<HTMLElement>("[data-map-message]")!;
    logSink = (line) => {
      const trimmed = line.trim();
      if (trimmed) messageEl.textContent = trimmed;
    };
  };

  const pickFloorNode = async (map: FloorMap, available: FloorNode[], heroNow: Hero, context: FloorContext): Promise<FloorNode> => {
    showMapScreen(map, heroNow, context);
    return mapView!.choose(available);
  };

  const pickMove = async (state: BattleState, context: CombatContext): Promise<{ move: Move; targetId: string }> => {
    if (state.round === 1) {
      battle = new BattleView(app);
      battle.setHud(context.isBoss ? `Floor ${context.floor} - Boss Fight` : `Floor ${context.floor} - Fight`);
      battle.syncFromState(state, context.isBoss);
      logSink = (line) => battle?.appendLog([line]);
    }

    const heroCombatant = state.playerParty.find((c) => c.id === "hero")!;
    const aliveEnemies = state.enemyParty
      .filter((c) => c.stats.hp > 0)
      .map((c) => ({ id: c.id, name: c.name, hp: c.stats.hp, maxHp: c.stats.maxHp }));
    return battle!.chooseAction(heroCombatant.moves, aliveEnemies);
  };

  const onRound = async (events: CombatEvent[], _state: BattleState, _context: CombatContext): Promise<void> => {
    await battle?.playRoundEvents(events);
  };

  return simulateRun({
    hero,
    rng: makeRng(Date.now()),
    maxFloors: 50, // floors 1-3 are the campaign, this is effectively endless for a real playthrough
    pickFloorNode,
    pickUpgrade: rewardScreen,
    pickShopPurchase: shopNodeScreen,
    pickCompanion: companionScreen,
    pickMove,
    onRound,
    onEvent: (line) => logSink(line),
  });
}

async function main(): Promise<void> {
  for (;;) {
    const save = loadSave();
    const name = await titleScreen(save);
    const heroClass = await classScreen();
    if (save.legacyPoints > 0) {
      await shopScreen(save);
    }

    const hero = applyPermanentBonuses(createHero(name, heroClass), save.permanentBonuses);
    const result = await playRun(hero);
    const earned = recordRun(save, result);
    await gameOverScreen(result, earned, save);
  }
}

main();
