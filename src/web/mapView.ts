import type { FloorMap, FloorNode } from "../run/floorMap.js";

const NODE_ICON: Record<string, string> = {
  fight: "⚔️",
  shop: "🛒",
  companion: "🤝",
  boss: "👑",
};

const NODE_LABEL: Record<string, string> = {
  fight: "Fight",
  shop: "Merchant",
  companion: "Companion Hub",
  boss: "Boss",
};

const SVG_NS = "http://www.w3.org/2000/svg";
const COL_W = 84;
const ROW_H = 62;
const RADIUS = 20;
const PAD = 36;

// The whole 9-layer route to the boss, drawn once per floor as inline SVG
// (nodes + connecting edges), left-to-right. Reachable nodes from wherever
// the hero currently is are highlighted and clickable; everything else is
// dimmed. Placeholder-quality (plain shapes/emoji), same spirit as the rest
// of the battle view.
export class MapView {
  // Owns its DOM independently of any particular screen: a shop or fight
  // node fully replaces the page between steps, so the map's `element` gets
  // re-inserted into a fresh container each time control returns to it
  // rather than the map being rebuilt (which would lose the visited-node
  // trail) or left attached to a container that no longer exists.
  readonly element: HTMLElement;
  private map: FloorMap;
  private svg: SVGSVGElement;
  private nodeEls = new Map<string, SVGGElement>();
  private visited = new Set<string>();
  private width: number;
  private height: number;

  constructor(map: FloorMap) {
    this.map = map;

    const cols = map.layers.length + 1; // + boss column
    const maxRows = Math.max(...map.layers.map((l) => l.length));
    this.width = PAD * 2 + COL_W * (cols - 1);
    this.height = PAD * 2 + ROW_H * (maxRows - 1);

    this.svg = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    this.svg.setAttribute("viewBox", `0 0 ${this.width} ${this.height}`);
    this.svg.setAttribute("class", "floor-map");

    this.element = document.createElement("div");
    this.element.className = "floor-map-wrap";
    this.element.appendChild(this.svg);

    this.drawEdges();
    this.drawNodes();
  }

  private allNodes(): FloorNode[] {
    return [...this.map.layers.flat(), this.map.boss];
  }

  private nodePos(id: string): { x: number; y: number } {
    if (id === this.map.boss.id) {
      return { x: PAD + this.map.layers.length * COL_W, y: this.height / 2 };
    }
    for (const layer of this.map.layers) {
      const idx = layer.findIndex((n) => n.id === id);
      if (idx === -1) continue;
      const count = layer.length;
      const totalH = ROW_H * (count - 1);
      const offset = (this.height - totalH) / 2;
      return { x: PAD + layer[0].layer * COL_W, y: count === 1 ? this.height / 2 : offset + idx * ROW_H };
    }
    return { x: 0, y: 0 };
  }

  private drawEdges(): void {
    for (const node of this.allNodes()) {
      const from = this.nodePos(node.id);
      for (const targetId of node.connectsTo) {
        const to = this.nodePos(targetId);
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", String(from.x));
        line.setAttribute("y1", String(from.y));
        line.setAttribute("x2", String(to.x));
        line.setAttribute("y2", String(to.y));
        line.setAttribute("class", "map-edge");
        this.svg.appendChild(line);
      }
    }
  }

  private drawNodes(): void {
    for (const node of this.allNodes()) {
      const { x, y } = this.nodePos(node.id);
      const g = document.createElementNS(SVG_NS, "g") as SVGGElement;
      g.setAttribute("class", "map-node");
      g.setAttribute("transform", `translate(${x}, ${y})`);
      g.dataset.nodeId = node.id;

      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("r", String(RADIUS));
      g.appendChild(circle);

      const text = document.createElementNS(SVG_NS, "text");
      text.textContent = NODE_ICON[node.type] ?? "?";
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      g.appendChild(text);

      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = NODE_LABEL[node.type] ?? node.type;
      g.appendChild(title);

      this.svg.appendChild(g);
      this.nodeEls.set(node.id, g);
    }
  }

  // Highlights `available` as clickable and resolves with whichever the
  // player clicks; marks it visited/current afterward.
  choose(available: FloorNode[]): Promise<FloorNode> {
    const availableIds = new Set(available.map((n) => n.id));
    for (const [id, el] of this.nodeEls) {
      el.classList.remove("available", "current");
      if (availableIds.has(id)) el.classList.add("available");
    }

    return new Promise((resolve) => {
      const cleanups: Array<() => void> = [];
      for (const node of available) {
        const el = this.nodeEls.get(node.id);
        if (!el) continue;
        const handler = () => {
          cleanups.forEach((off) => off());
          this.markVisited(node.id);
          resolve(node);
        };
        el.addEventListener("click", handler);
        cleanups.push(() => el.removeEventListener("click", handler));
      }
    });
  }

  private markVisited(id: string): void {
    this.visited.add(id);
    for (const [nodeId, el] of this.nodeEls) {
      el.classList.remove("available", "current");
      if (this.visited.has(nodeId)) el.classList.add("visited");
    }
    this.nodeEls.get(id)?.classList.add("current");
  }
}
