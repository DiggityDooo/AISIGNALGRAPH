import { useMemo, useState } from "react";

const DEFAULT_PAGE_SIZE = 48;

export function usePagedList<T>(items: T[], pageSize = DEFAULT_PAGE_SIZE) {
  const [visibleCount, setVisibleCount] = useState(pageSize);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount],
  );

  const hasMore = visibleCount < items.length;

  const loadMore = () => {
    setVisibleCount((current) => Math.min(current + pageSize, items.length));
  };

  return {
    visibleItems,
    hasMore,
    loadMore,
    totalCount: items.length,
    visibleCount: visibleItems.length,
  };
}
