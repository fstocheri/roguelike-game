import type { Rng } from "../util/rng.js";

export type NodeType = "fight" | "shop" | "companion" | "boss";

export interface FloorNode {
  id: string;
  type: NodeType;
  layer: number;
  connectsTo: string[]; // ids of nodes in the next layer (or "boss") reachable from here
}

export interface FloorMap {
  layers: FloorNode[][]; // MAP_LAYERS arrays of NODES_PER_LAYER nodes each
  boss: FloorNode; // type "boss", terminal (connectsTo: [])
}

export const MAP_LAYERS = 9; // matches STEPS_PER_FLOOR in src/run/run.ts
export const NODES_PER_LAYER = 3;

// Fight dominates so the core loop stays fight-focused; shop and companion
// are genuine but occasional detours, each costing the fight (and its gold/
// reward) you didn't take instead.
const TYPE_WEIGHTS: Array<[Exclude<NodeType, "boss">, number]> = [
  ["fight", 65],
  ["shop", 25],
  ["companion", 10],
];

function pickNodeType(rng: Rng, allowCompanion: boolean): NodeType {
  const weights = allowCompanion ? TYPE_WEIGHTS : TYPE_WEIGHTS.filter(([type]) => type !== "companion");
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [type, weight] of weights) {
    if (roll < weight) return type;
    roll -= weight;
  }
  return weights[weights.length - 1][0];
}

// Same simple adjacency Slay the Spire's map uses: node i in a layer
// connects to nodes {i-1, i, i+1} (clamped) in the next layer, so an edge
// node has 2 onward options and a middle node has 3.
function adjacentIndices(index: number, layerSize: number): number[] {
  const indices: number[] = [];
  for (const delta of [-1, 0, 1]) {
    const j = index + delta;
    if (j >= 0 && j < layerSize) indices.push(j);
  }
  return indices;
}

// Deterministic per seed - directly unit-testable (connectivity validity,
// boss reachability from every last-layer node, type-weight distribution).
// `allowCompanion` should be false once the hero's ally roster is already
// full (see ALLY_CAP in src/entities/ally.ts) - no point placing a node
// whose recruitment offer would just say "no room."
export function generateFloorMap(rng: Rng, allowCompanion = true): FloorMap {
  const layers: FloorNode[][] = [];
  for (let layer = 0; layer < MAP_LAYERS; layer++) {
    const nodes: FloorNode[] = [];
    for (let i = 0; i < NODES_PER_LAYER; i++) {
      nodes.push({ id: `${layer}-${i}`, type: pickNodeType(rng, allowCompanion), layer, connectsTo: [] });
    }
    layers.push(nodes);
  }

  for (let layer = 0; layer < MAP_LAYERS - 1; layer++) {
    for (let i = 0; i < NODES_PER_LAYER; i++) {
      layers[layer][i].connectsTo = adjacentIndices(i, NODES_PER_LAYER).map((j) => layers[layer + 1][j].id);
    }
  }

  const boss: FloorNode = { id: "boss", type: "boss", layer: MAP_LAYERS, connectsTo: [] };
  for (const node of layers[MAP_LAYERS - 1]) node.connectsTo = [boss.id];

  return { layers, boss };
}

export function findNode(map: FloorMap, id: string): FloorNode | undefined {
  if (id === map.boss.id) return map.boss;
  for (const layer of map.layers) {
    const found = layer.find((n) => n.id === id);
    if (found) return found;
  }
  return undefined;
}

// The nodes the hero can pick from next: the whole first layer if the floor
// just started (currentNodeId is null), otherwise whatever the current
// node's connectsTo reaches.
export function reachableNodes(map: FloorMap, currentNodeId: string | null): FloorNode[] {
  if (currentNodeId === null) return map.layers[0];
  const current = findNode(map, currentNodeId);
  if (!current) return [];
  return current.connectsTo.map((id) => findNode(map, id)).filter((n): n is FloorNode => n !== undefined);
}
