import type { ReactNode } from "react";

type PointerEventsRootProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Shell uses pointer-events-none so Spline/canvas stay click-through.
 * Every interactive child MUST use pointer-events-auto (or a descendant that does).
 */
export function PointerEventsRoot({ children, className = "" }: PointerEventsRootProps) {
  return (
    <main
      className={`pointer-events-none ${className}`.trim()}
    >
      {children}
    </main>
  );
}
