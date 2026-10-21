import type { BattleState } from "../combat/battle.js";
import { HERO_COMBATANT_ID } from "../combat/combatant.js";
import type { CombatEvent } from "../combat/events.js";
import type { Move } from "../entities/move.js";
import { HERO_ART, artForEnemy } from "./characterArt.js";
import { cycleAnimationSpeed, getAnimationSpeed } from "./settings.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms / getAnimationSpeed()));
}

function hpBarColor(hp: number, maxHp: number): string {
  const frac = maxHp <= 0 ? 0 : hp / maxHp;
  if (frac > 0.5) return "var(--hp-good)";
  if (frac > 0.2) return "var(--hp-mid)";
  return "var(--hp-low)";
}

interface BoxRefs {
  box: HTMLElement;
  fill: HTMLElement;
  text: HTMLElement;
}

// A dynamic player row (hero + up to 2 allies) and a dynamic enemy row
// (1-3 enemies), both rebuilt fresh each encounter from whatever that
// fight's actual parties are. Box lookup is id-keyed throughout, so
// animation/event-handling code doesn't care how many combatants there are
// on either side.
export class BattleView {
  private root: HTMLElement;
  private arena!: HTMLElement;
  private playerRow!: HTMLElement;
  private enemyRow!: HTMLElement;
  private boxes = new Map<string, BoxRefs>();
  private hudFloor!: HTMLElement;
  private speedBtn!: HTMLButtonElement;
  private movePanel!: HTMLElement;
  private logEl!: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.render();
  }

  private render(): void {
    this.root.innerHTML = `
      <div class="hud">
        <span class="floor-label" data-hud-floor></span>
        <button class="secondary speed-btn" data-speed-btn type="button"></button>
      </div>
      <div class="panel">
        <div class="arena" data-arena>
          <div class="player-row" data-player-row></div>
          <div class="vs-mark">VS</div>
          <div class="enemy-row" data-enemy-row></div>
        </div>
      </div>
      <div class="panel" data-move-panel></div>
      <div class="panel log" data-log></div>
    `;
    this.arena = this.qs("[data-arena]");
    this.playerRow = this.qs("[data-player-row]");
    this.enemyRow = this.qs("[data-enemy-row]");
    this.hudFloor = this.qs("[data-hud-floor]");
    this.speedBtn = this.qs("[data-speed-btn]");
    this.movePanel = this.qs("[data-move-panel]");
    this.logEl = this.qs("[data-log]");

    this.refreshSpeedLabel();
    this.speedBtn.addEventListener("click", () => {
      cycleAnimationSpeed();
      this.refreshSpeedLabel();
    });
  }

  private refreshSpeedLabel(): void {
    this.speedBtn.textContent = `Speed: ${getAnimationSpeed()}x`;
  }

  private qs<T extends HTMLElement>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`BattleView: missing element ${selector}`);
    return el;
  }

  private boxFor(id: string): HTMLElement | undefined {
    return this.boxes.get(id)?.box;
  }

  setHud(text: string): void {
    this.hudFloor.textContent = text;
  }

  async showFloorBanner(floor: number, isEndless: boolean): Promise<void> {
    this.root.querySelector(".banner")?.remove();
    const banner = document.createElement("div");
    banner.className = "banner";
    banner.textContent = `Floor ${floor}${isEndless ? " (Endless)" : ""}`;
    this.root.prepend(banner);
    await sleep(900);
    banner.remove();
  }

  private buildBox(
    row: HTMLElement,
    id: string,
    name: string,
    emoji: string,
    accentColor: string,
    hp: number,
    maxHp: number,
    extraClass: string,
  ): void {
    const box = document.createElement("div");
    box.className = `character ${extraClass}`;
    box.style.setProperty("--accent", accentColor);
    box.innerHTML = `
      <div class="model">${emoji}</div>
      <div class="name">${name}</div>
      <div class="hp-bar-track"><div class="hp-bar-fill"></div></div>
      <div class="hp-text"></div>
    `;
    row.appendChild(box);
    this.boxes.set(id, {
      box,
      fill: box.querySelector(".hp-bar-fill")!,
      text: box.querySelector(".hp-text")!,
    });
    this.setHpFor(id, hp, maxHp);
  }

  // Renders both sides fresh from battle state - called once at the start
  // of an encounter (state.round === 1, before any round has resolved).
  // Rebuilds both rows from scratch since party sizes vary per fight.
  syncFromState(state: BattleState, isBoss: boolean): void {
    this.playerRow.innerHTML = "";
    this.enemyRow.innerHTML = "";
    this.boxes.clear();

    state.playerParty.forEach((member) => {
      const isHero = member.id === HERO_COMBATANT_ID;
      const art = isHero ? HERO_ART : artForEnemy(member.name); // ally art falls back to the generic-enemy-lookup default
      this.buildBox(
        this.playerRow,
        member.id,
        member.name,
        isHero ? HERO_ART.emoji : "🧑‍🤝‍🧑",
        art.color,
        member.stats.hp,
        member.stats.maxHp,
        isHero ? "hero" : "ally",
      );
    });

    state.enemyParty.forEach((enemy, i) => {
      const art = artForEnemy(enemy.name);
      const label = isBoss && i === 0 ? `${enemy.name} (Boss)` : enemy.name;
      this.buildBox(this.enemyRow, enemy.id, label, art.emoji, art.color, enemy.stats.hp, enemy.stats.maxHp, "enemy");
    });
  }

  private setHpFor(id: string, hp: number, maxHp: number): void {
    const refs = this.boxes.get(id);
    if (!refs) return;
    refs.fill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
    refs.fill.style.background = hpBarColor(hp, maxHp);
    refs.text.textContent = `${Math.max(0, hp)}/${maxHp}`;
  }

  private popText(box: HTMLElement, text: string, kind: string): void {
    const el = document.createElement("div");
    el.className = `floating-text ${kind}`;
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  appendLog(lines: string[]): void {
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const div = document.createElement("div");
      const isBanner = line.startsWith("===") || line.startsWith("---");
      div.className = isBanner ? "line floor-banner" : "line";
      div.textContent = line.replace(/^=+\s*|\s*=+$/g, "").replace(/^-+\s*|\s*-+$/g, "");
      this.logEl.appendChild(div);
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  // Shows the hero's known moves as buttons and resolves with the chosen
  // index once the player clicks one.
  private chooseMove(moves: Move[]): Promise<number> {
    this.movePanel.innerHTML = `
      <div class="move-grid">
        ${moves
          .map((m, i) => {
            const detail = m.target === "self" ? `Heals ${Math.round((m.selfHealFraction ?? 0) * 100)}%` : `Power x${m.power}`;
            return `
          <button class="move-btn" data-move-idx="${i}" type="button">
            <span class="move-name">${m.name}</span>
            <span class="move-detail">${detail}</span>
          </button>`;
          })
          .join("")}
      </div>
    `;
    return new Promise((resolve) => {
      this.movePanel.querySelectorAll<HTMLButtonElement>("[data-move-idx]").forEach((btn) => {
        btn.addEventListener("click", () => resolve(Number(btn.dataset.moveIdx)));
      });
    });
  }

  private chooseTarget(enemies: Array<{ id: string; name: string; hp: number; maxHp: number }>): Promise<string> {
    this.movePanel.innerHTML = `
      <p class="subtitle center-text" style="margin: 0 0 8px">Choose a target</p>
      <div class="move-grid">
        ${enemies
          .map(
            (e, i) => `
          <button class="move-btn" data-target-idx="${i}" type="button">
            <span class="move-name">${e.name}</span>
            <span class="move-detail">HP ${e.hp}/${e.maxHp}</span>
          </button>`,
          )
          .join("")}
      </div>
    `;
    return new Promise((resolve) => {
      this.movePanel.querySelectorAll<HTMLButtonElement>("[data-target-idx]").forEach((btn) => {
        btn.addEventListener("click", () => resolve(enemies[Number(btn.dataset.targetIdx)].id));
      });
    });
  }

  // Full action selection: pick a move, then (only if that move needs a
  // single target and more than one enemy is alive) pick which enemy.
  async chooseAction(
    moves: Move[],
    aliveEnemies: Array<{ id: string; name: string; hp: number; maxHp: number }>,
  ): Promise<{ move: Move; targetId: string }> {
    const moveIdx = await this.chooseMove(moves);
    const move = moves[moveIdx];

    let targetId = aliveEnemies[0]?.id ?? "";
    if (move.target === "single-enemy" && aliveEnemies.length > 1) {
      targetId = await this.chooseTarget(aliveEnemies);
    }

    this.clearMovePanel();
    return { move, targetId };
  }

  clearMovePanel(): void {
    this.movePanel.innerHTML = "";
  }

  // Animates one round's worth of events in order, resolving once the round
  // has fully played out.
  async playRoundEvents(events: CombatEvent[]): Promise<void> {
    for (const event of events) {
      switch (event.type) {
        case "move": {
          const attackerBox = this.boxFor(event.actorId);
          const targetBox = this.boxFor(event.targetId);
          const attackingClass = attackerBox?.classList.contains("enemy") ? "attacking-enemy" : "attacking-hero";
          attackerBox?.classList.add(attackingClass);
          await sleep(180);
          targetBox?.classList.add("hit");
          if (targetBox) this.popText(targetBox, `-${event.damage}`, event.crit ? "damage crit" : "damage");
          if (event.crit) {
            this.arena.classList.add("crit-shake");
            setTimeout(() => this.arena.classList.remove("crit-shake"), 400);
          }
          this.setHpFor(event.targetId, event.targetHpAfter, event.targetMaxHp);
          await sleep(320);
          attackerBox?.classList.remove(attackingClass);
          targetBox?.classList.remove("hit");
          break;
        }

        case "heal": {
          const box = this.boxFor(event.targetId);
          if (box) this.popText(box, `+${event.amount}`, "heal");
          this.setHpFor(event.targetId, event.targetHpAfter, event.targetMaxHp);
          await sleep(280);
          break;
        }

        case "thorns": {
          const box = this.boxFor(event.targetId);
          if (box) this.popText(box, `-${event.amount}`, "thorns");
          this.setHpFor(event.targetId, event.targetHpAfter, event.targetMaxHp);
          await sleep(280);
          break;
        }

        case "execute": {
          const box = this.boxFor(event.targetId);
          if (box) this.popText(box, "EXECUTED!", "execute");
          await sleep(500);
          break;
        }

        case "revive": {
          const box = this.boxFor(event.targetId);
          if (box) this.popText(box, "REVIVED!", "revive");
          await sleep(500);
          break;
        }

        case "combatant-defeated":
          this.boxFor(event.combatantId)?.classList.add("defeated");
          await sleep(300);
          break;

        case "victory":
        case "defeat":
          await sleep(500);
          break;
      }
    }
  }
}
