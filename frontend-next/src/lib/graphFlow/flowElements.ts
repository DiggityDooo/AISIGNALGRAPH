import type { Edge, Node } from "@xyflow/react";
import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import type { DocumentCardData } from "@/components/visualization/flow/DocumentCardNode";
import { accentForType, nodeTypeOf } from "@/lib/graphFlow/nodeColors";
import { createSignalEdge } from "@/lib/graphFlow/signalEdge";

const DEFAULT_MAX_FLOW_NODES = 24;
const FLOW_SEED_COUNT = 8;

function flowNodeScore(
  nodeId: string,
  nodeById: ReadonlyMap<string, GraphApiPayload["nodes"][number]>,
  inDegree: ReadonlyMap<string, number>,
  outDegree: ReadonlyMap<string, number>,
): number {
  const node = nodeById.get(nodeId);
  if (!node) return 0;
  const importance = typeof node.importance === "number" ? node.importance : 0;
  const year = typeof node.year === "number" ? node.year : 0;
  return (
    importance * 100 +
    (outDegree.get(nodeId) ?? 0) * 12 +
    (inDegree.get(nodeId) ?? 0) * 4 +
    year * 0.001
  );
}

export function selectFlowNodeIds(
  payload: GraphApiPayload,
  maxNodes = DEFAULT_MAX_FLOW_NODES,
): Set<string> {
  const nodeById = new Map(payload.nodes.map((node) => [node.id, node]));
  const nodeIds = new Set(nodeById.keys());
  if (nodeIds.size <= maxNodes) return nodeIds;

  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const neighbors = new Map<string, Set<string>>();

  for (const id of nodeIds) neighbors.set(id, new Set());
  for (const edge of payload.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    neighbors.get(edge.source)!.add(edge.target);
    neighbors.get(edge.target)!.add(edge.source);
  }

  const scoreById = new Map(
    [...nodeIds].map((id) => [
      id,
      flowNodeScore(id, nodeById, inDegree, outDegree),
    ]),
  );
  const rankedIds = [...nodeIds].sort(
    (a, b) => (scoreById.get(b) ?? 0) - (scoreById.get(a) ?? 0),
  );
  const selected = new Set<string>();
  const queued = new Set<string>();
  const queue = rankedIds.slice(0, FLOW_SEED_COUNT);
  queue.forEach((id) => queued.add(id));

  for (let cursor = 0; cursor < queue.length && selected.size < maxNodes; cursor += 1) {
    const id = queue[cursor];
    if (selected.has(id)) continue;
    selected.add(id);

    const rankedNeighbors = [...(neighbors.get(id) ?? [])].sort(
      (a, b) => (scoreById.get(b) ?? 0) - (scoreById.get(a) ?? 0),
    );
    for (const neighborId of rankedNeighbors) {
      if (selected.has(neighborId) || queued.has(neighborId)) continue;
      queued.add(neighborId);
      queue.push(neighborId);
    }
  }

  for (const id of rankedIds) {
    if (selected.size >= maxNodes) break;
    selected.add(id);
  }

  return selected;
}

export function buildFlowGraphElements(
  payload: GraphApiPayload,
  maxNodes = DEFAULT_MAX_FLOW_NODES,
): {
  nodes: Node<DocumentCardData>[];
  edges: Edge[];
} {
  const nodeById = new Map(payload.nodes.map((node) => [node.id, node]));
  const visibleIds = selectFlowNodeIds(payload, maxNodes);
  const outgoingCount = new Map<string, number>();

  for (const edge of payload.edges) {
    if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) ?? 0) + 1);
  }

  const nodes = payload.nodes.filter((apiNode) => visibleIds.has(apiNode.id)).map((apiNode) => {
    const nodeType = nodeTypeOf(apiNode);
    return {
      id: apiNode.id,
      type: "documentCard",
      position: { x: 0, y: 0 },
      data: {
        label: apiNode.label ?? apiNode.id,
        nodeType,
        accentColor: accentForType(nodeType),
        hasChildren: false,
        expanded: true,
        childCount: outgoingCount.get(apiNode.id) ?? 0,
        depth: 0,
        nodeId: apiNode.id,
        progressive: false,
      },
    } satisfies Node<DocumentCardData>;
  });

  const seenEdgeIds = new Map<string, number>();
  const edges = payload.edges.flatMap((edge) => {
    const sourceNode = nodeById.get(edge.source);
    if (
      !sourceNode ||
      !visibleIds.has(edge.source) ||
      !visibleIds.has(edge.target)
    ) {
      return [];
    }

    const baseId = `e:${edge.source}->${edge.target}`;
    const occurrence = seenEdgeIds.get(baseId) ?? 0;
    seenEdgeIds.set(baseId, occurrence + 1);
    const importance =
      typeof sourceNode.importance === "number" ? sourceNode.importance : 0;

    return [
      createSignalEdge({
        id: occurrence === 0 ? baseId : `${baseId}:${occurrence}`,
        source: edge.source,
        target: edge.target,
        accentColor: accentForType(nodeTypeOf(sourceNode)),
        importance,
      }),
    ];
  });

  return { nodes, edges };
}
