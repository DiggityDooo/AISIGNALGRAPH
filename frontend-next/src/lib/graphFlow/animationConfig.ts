/**
 * Reveal-animation timing for Tree/Flow card expansion.
 *
 * When a user double-taps a card, its newly-revealed children slide down with
 * a small stagger (see `DocumentCardNode` + the `card-reveal` rule in
 * globals.css). Only the *new* children animate — `useProgressiveGraph`
 * diffs the previous vs. current visible set, since the whole canvas remounts
 * on every expand and a blanket entry animation would re-fire on every node.
 */

/** Duration of a single card's slide-down, in ms. */
export const CARD_REVEAL_DURATION_MS = 360;

/** Delay between consecutive children appearing, in ms ("staggered but not too much"). */
export const CARD_REVEAL_STAGGER_MS = 55;

/**
 * Cap on stagger steps. The fan-out is 2–6 children, but if a section ever
 * reveals more, the last card shouldn't wait nearly a second — clamp the
 * delay so the burst stays snappy.
 */
export const CARD_REVEAL_MAX_STAGGER_STEPS = 6;

/** Smooth decelerate, no overshoot — matches the hero-fade-in easing already in globals.css. */
export const CARD_REVEAL_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Stagger delay (ms) for the child at position `order` (0-based) within a reveal burst. */
export function cardRevealDelayMs(order: number): number {
  const clamped = Math.max(0, Math.min(order, CARD_REVEAL_MAX_STAGGER_STEPS));
  return clamped * CARD_REVEAL_STAGGER_MS;
}

/**
 * Total time (ms) for a burst of `count` children to finish animating —
 * last card's stagger delay plus its own duration. Used to time the camera
 * fit so it settles as the cards land.
 */
export function cardRevealTotalMs(count: number): number {
  if (count <= 0) return 0;
  return cardRevealDelayMs(count - 1) + CARD_REVEAL_DURATION_MS;
}

/**
 * Pure reveal-ordering used by `useProgressiveGraph`. Given a parent's child
 * IDs (already in display/relevance order) and the previous vs. current
 * visible sets, return a map of childId → 0-based reveal index for the
 * children that are newly visible this expand. Children already on screen
 * (or not yet visible) are omitted, so re-renders that don't reveal anything
 * produce an empty map and animate nothing.
 */
export function computeRevealOrder(
  childIds: readonly string[],
  prevVisible: ReadonlySet<string>,
  currVisible: ReadonlySet<string>,
): Map<string, number> {
  const order = new Map<string, number>();
  let index = 0;
  for (const id of childIds) {
    if (currVisible.has(id) && !prevVisible.has(id)) {
      order.set(id, index);
      index += 1;
    }
  }
  return order;
}
