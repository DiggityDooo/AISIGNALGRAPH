import type { Edge, Node } from "@xyflow/react";
import type { GraphApiPayload } from "@/components/graph-flow/fetchGraphApi";
import type { DocumentCardData } from "@/components/visualization/flow/DocumentCardNode";
import { accentForType, nodeTypeOf } from "@/lib/graphFlow/nodeColors";
import { DOCUMENT_CARD_HEIGHT, DOCUMENT_CARD_WIDTH } from "@/lib/graphFlow/layoutUtils";
import { computeDegrees, degreeBasedSize } from "@/lib/graphFlow/nodeSizing";
import { createSignalEdge } from "@/lib/graphFlow/signalEdge";
import { SYNTHETIC_ROOT_ID, SYNTHETIC_ROOT_LABEL } from "@/lib/graphFlow/syntheticRoot";

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
  const inDegreeVisible = new Map<string, number>();

  for (const edge of payload.edges) {
    if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) ?? 0) + 1);
    inDegreeVisible.set(edge.target, (inDegreeVisible.get(edge.target) ?? 0) + 1);
  }

  // True graph degree (not capped by visibility) drives card size, matching
  // the regular graph's degree-based sizing.
  const degrees = computeDegrees(payload);
  const sizeFor = (id: string) => {
    const scale = degreeBasedSize(degrees.get(id)?.total ?? 0, {
      min: 0.85,
      max: 1.45,
      base: 0.95,
      scale: 0.12,
    });
    return {
      width: Math.round(DOCUMENT_CARD_WIDTH * scale),
      height: Math.round(DOCUMENT_CARD_HEIGHT * scale),
    };
  };

  // Hub all top-level branches fan out from, matching Lattice/Tree modes.
  // Dense truncated subgraphs often have no in-degree-zero node at all (every
  // visible node has a visible parent), so fall back to the top-ranked
  // visible nodes — capped at FLOW_SEED_COUNT — to guarantee the hub always
  // has somewhere to branch to.
  const branchableIds = [...visibleIds].filter((id) => id !== SYNTHETIC_ROOT_ID);
  const trueRootIds = branchableIds.filter((id) => (inDegreeVisible.get(id) ?? 0) === 0);
  const rootIds =
    trueRootIds.length > 0
      ? trueRootIds
      : branchableIds
          .sort(
            (a, b) =>
              flowNodeScore(b, nodeById, inDegreeVisible, outgoingCount) -
              flowNodeScore(a, nodeById, inDegreeVisible, outgoingCount),
          )
          .slice(0, FLOW_SEED_COUNT);

  const nodes: Node<DocumentCardData>[] = payload.nodes
    .filter((apiNode) => visibleIds.has(apiNode.id) && apiNode.id !== SYNTHETIC_ROOT_ID)
    .map((apiNode) => {
      const nodeType = nodeTypeOf(apiNode);
      const { width, height } = sizeFor(apiNode.id);
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
          width,
          height,
        },
      } satisfies Node<DocumentCardData>;
    });

  nodes.push({
    id: SYNTHETIC_ROOT_ID,
    type: "documentCard",
    position: { x: 0, y: 0 },
    data: {
      label: SYNTHETIC_ROOT_LABEL,
      nodeType: "root",
      accentColor: accentForType("root"),
      hasChildren: rootIds.length > 0,
      expanded: true,
      childCount: rootIds.length,
      depth: 0,
      nodeId: SYNTHETIC_ROOT_ID,
      progressive: false,
      width: Math.round(DOCUMENT_CARD_WIDTH * 1.7),
      height: Math.round(DOCUMENT_CARD_HEIGHT * 1.7),
    },
  } satisfies Node<DocumentCardData>);

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

  for (const rootId of rootIds) {
    edges.push(
      createSignalEdge({
        id: `e:${SYNTHETIC_ROOT_ID}->${rootId}`,
        source: SYNTHETIC_ROOT_ID,
        target: rootId,
        accentColor: "#ffffff",
        importance: 0,
      }),
    );
  }

  return { nodes, edges };
}
