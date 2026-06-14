export async function requestServerRebuild() {
  const response = await fetch("/api/rebuild", { method: "POST" });
  if (!response.ok) {
    throw new Error(`Rebuild failed: HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) {
        continue;
      }
      try {
        const payload = JSON.parse(line.slice(6));
        if (payload?.job && payload.job.active === false) {
          return;
        }
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }
}
