/** Enable React Flow graph via `NEXT_PUBLIC_GRAPH_FLOW=1` at build time. */
export function isGraphFlowEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GRAPH_FLOW === "1";
}
