export function renderErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function hasMeasurableContainerSize(container) {
  if (!container) {
    return false;
  }
  const rect = container.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function safeInternalRoute(candidate, fallback) {
  if (typeof candidate !== "string") {
    return fallback;
  }
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\0")) {
    return fallback;
  }
  return candidate;
}

export function getNodeSemanticType(node) {
  return node?.semanticType || node?.type || node?.node_type || "entity";
}

export function getStableDepthOffset(nodeId) {
  let hash = 0;
  const value = String(nodeId || "");
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return ((Math.abs(hash) % 61) - 30) * 3;
}

export function getNodeMonthIndex(node) {
  const explicitIndex = Number(node?.month_index);
  if (Number.isFinite(explicitIndex)) {
    return explicitIndex;
  }
  const [yearText, monthText = "01"] = String(node?.timeline_month || "").split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return null;
  }
  return year * 12 + month;
}

export function getCanvasNodeColor(node, obsidianGraph) {
  const colorKey = getNodeSemanticType(node);
  return obsidianGraph.nodeColors[colorKey] || obsidianGraph.defaultNode;
}
