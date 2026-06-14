export async function fetchGraphData(dataset = "") {
  const response = await fetch(`/api/graph?dataset=${encodeURIComponent(dataset)}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export async function fetchGraphByEra(era) {
  const response = await fetch(`/api/graph/era/${encodeURIComponent(era)}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

export async function fetchGraphByYearRange(from, to) {
  const response = await fetch(
    `/api/graph/year-range?from=${encodeURIComponent(String(from))}&to=${encodeURIComponent(String(to))}`,
  );
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

/**
 * Pick the graph endpoint from filter state.
 * Era filter takes precedence over year-range server filter.
 */
export async function resolveGraphFetch({
  dataset = "",
  activeEra = "",
  activeYear = 2026,
  serverYearFilter = true,
} = {}) {
  if (activeEra) {
    return fetchGraphByEra(activeEra);
  }
  if (serverYearFilter && activeYear < 2026) {
    return fetchGraphByYearRange(2020, activeYear);
  }
  return fetchGraphData(dataset);
}

export async function fetchFtsStoryIds(query) {
  const trimmed = (query || "").trim();
  if (trimmed.length < 2) {
    return new Set();
  }

  try {
    const response = await fetch(`/api/stories/search?q=${encodeURIComponent(trimmed)}&limit=50`);
    if (!response.ok) {
      return new Set();
    }
    const data = await response.json();
    const ids = new Set();
    (data.results || []).forEach((story) => {
      if (!story?.id) {
        return;
      }
      ids.add(story.id);
      ids.add(`story:${story.id}`);
    });
    return ids;
  } catch {
    return new Set();
  }
}
