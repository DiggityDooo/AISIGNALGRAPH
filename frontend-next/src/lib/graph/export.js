export function exportSubgraphJson(nodes, edges) {
  const payload = {
    nodes,
    edges,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `aisignalgraph-subgraph-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
