import { getNodeSemanticType } from "./nodeUtils.js";

export function nodeMatchesFts(node, ftsStoryIds) {
  const nodeId = String(node.id || "");
  if (ftsStoryIds.has(nodeId)) {
    return true;
  }
  const bareId = nodeId.startsWith("story:") ? nodeId.slice(6) : nodeId;
  return ftsStoryIds.has(bareId) || ftsStoryIds.has(`story:${bareId}`);
}

export function filterNodes({
  nodes,
  edges,
  query,
  lens,
  activeYear,
  visibleNodeTypes,
  selectedNodeId,
  ftsStoryIds,
}) {
  const normalizedQuery = (query || "").trim().toLowerCase();
  const visibleTypes =
    visibleNodeTypes instanceof Set ? visibleNodeTypes : new Set(visibleNodeTypes || []);

  let base = nodes.filter((node) => {
    const nodeType = getNodeSemanticType(node);
    if (!visibleTypes.has(nodeType)) {
      return false;
    }
    const year = Number.parseInt(String(node.year || node.timeline_month || "").slice(0, 4), 10);
    if (Number.isFinite(year) && year > activeYear && nodeType !== "year") {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    const haystack = `${node.label || ""} ${node.summary || ""} ${node.description || ""}`.toLowerCase();
    if (haystack.includes(normalizedQuery)) {
      return true;
    }
    return nodeMatchesFts(node, ftsStoryIds || new Set());
  });

  if (lens === "local" && selectedNodeId) {
    const neighborIds = new Set([selectedNodeId]);
    edges.forEach((edge) => {
      const sourceId = edge.sourceId || edge.source;
      const targetId = edge.targetId || edge.target;
      if (sourceId === selectedNodeId) {
        neighborIds.add(targetId);
      } else if (targetId === selectedNodeId) {
        neighborIds.add(sourceId);
      }
    });
    base = base.filter((node) => neighborIds.has(node.id));
  }

  return base;
}

export function filterEdges(edges, visibleNodeIds) {
  return edges.filter((edge) => {
    const sourceId = edge.sourceId || edge.source;
    const targetId = edge.targetId || edge.target;
    return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
  });
}
