import { describe, expect, it } from "vitest";
import { findNode, generateFloorMap, MAP_LAYERS, NODES_PER_LAYER, reachableNodes } from "../src/run/floorMap.js";
import { makeRng } from "../src/util/rng.js";

describe("generateFloorMap", () => {
  it("produces the expected number of layers and nodes per layer", () => {
    const map = generateFloorMap(makeRng(1));
    expect(map.layers).toHaveLength(MAP_LAYERS);
    for (const layer of map.layers) {
      expect(layer).toHaveLength(NODES_PER_LAYER);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = generateFloorMap(makeRng(42));
    const b = generateFloorMap(makeRng(42));
    expect(a.layers.map((l) => l.map((n) => n.type))).toEqual(b.layers.map((l) => l.map((n) => n.type)));
  });

  it("every non-final layer's connectsTo only references real nodes in the next layer", () => {
    for (let seed = 0; seed < 20; seed++) {
      const map = generateFloorMap(makeRng(seed));
      for (let layer = 0; layer < MAP_LAYERS - 1; layer++) {
        const nextLayerIds = new Set(map.layers[layer + 1].map((n) => n.id));
        for (const node of map.layers[layer]) {
          expect(node.connectsTo.length).toBeGreaterThan(0);
          for (const id of node.connectsTo) {
            expect(nextLayerIds.has(id)).toBe(true);
          }
        }
      }
    }
  });

  it("every node in the last layer connects to the boss", () => {
    for (let seed = 0; seed < 20; seed++) {
      const map = generateFloorMap(makeRng(seed));
      for (const node of map.layers[MAP_LAYERS - 1]) {
        expect(node.connectsTo).toEqual([map.boss.id]);
      }
    }
  });

  it("fight is the most common node type over many generations", () => {
    const counts: Record<string, number> = { fight: 0, shop: 0, companion: 0 };
    for (let seed = 0; seed < 200; seed++) {
      const map = generateFloorMap(makeRng(seed));
      for (const layer of map.layers) {
        for (const node of layer) counts[node.type]++;
      }
    }
    expect(counts.fight).toBeGreaterThan(counts.shop);
    expect(counts.shop).toBeGreaterThan(counts.companion);
  });
});

describe("findNode", () => {
  it("finds nodes within layers and the boss node", () => {
    const map = generateFloorMap(makeRng(5));
    const someNode = map.layers[3][1];
    expect(findNode(map, someNode.id)).toEqual(someNode);
    expect(findNode(map, "boss")).toEqual(map.boss);
    expect(findNode(map, "does-not-exist")).toBeUndefined();
  });
});

describe("reachableNodes", () => {
  it("returns the whole first layer when no current node is set", () => {
    const map = generateFloorMap(makeRng(9));
    expect(reachableNodes(map, null)).toEqual(map.layers[0]);
  });

  it("returns only the connected nodes from a mid-layer position", () => {
    const map = generateFloorMap(makeRng(9));
    const current = map.layers[2][0]; // an edge node - connects to indices {0,1} only
    const reachable = reachableNodes(map, current.id);
    expect(reachable.map((n) => n.id)).toEqual(current.connectsTo);
    expect(reachable.length).toBeLessThanOrEqual(NODES_PER_LAYER);
  });

  it("reaches the boss from a last-layer node", () => {
    const map = generateFloorMap(makeRng(9));
    const lastNode = map.layers[MAP_LAYERS - 1][1];
    const reachable = reachableNodes(map, lastNode.id);
    expect(reachable).toEqual([map.boss]);
  });
});
