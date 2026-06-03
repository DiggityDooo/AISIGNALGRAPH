"use client";

import { useEffect, useRef } from "react";

const DAMPING = 0.35;
const SNAP_DELTA_MS = 200;
const MOBILE_MAX_WIDTH = 768;

const INTERACTIVE_SELECTOR =
  "a, button, input, select, textarea, [role='button'], [data-pointer-reactive]";
const TEXT_SELECTOR = "h1, h2, h3, h4, h5, h6, p, span, li, label";

export default function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef({ x: -100, y: -100 });
  const currentRef = useRef({ x: -100, y: -100 });
  const rafRef = useRef<number | null>(null);
  const lastFrameMsRef = useRef<number | null>(null);
  const snapOnNextMoveRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH - 1}px)`);
    const finePointerQuery = window.matchMedia("(pointer: fine)");

    const cursor = cursorRef.current;
    if (!cursor) {
      return undefined;
    }

    const setMode = (hover: boolean, text: boolean) => {
      cursor.classList.toggle("hover", hover);
      cursor.classList.toggle("text", text && !hover);
    };

    const tick = (now: number) => {
      const current = currentRef.current;
      const target = targetRef.current;
      const lastFrame = lastFrameMsRef.current;
      const delta = lastFrame === null ? 0 : now - lastFrame;
      lastFrameMsRef.current = now;

      if (delta > SNAP_DELTA_MS) {
        current.x = target.x;
        current.y = target.y;
      } else {
        current.x += (target.x - current.x) * DAMPING;
        current.y += (target.y - current.y) * DAMPING;
      }
      cursor.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`;
      rafRef.current = window.requestAnimationFrame(tick);
    };

    const enable = () => {
      cursor.style.display = "block";
      document.body.classList.add("custom-cursor-active");
      rafRef.current = window.requestAnimationFrame(tick);
    };

    const disable = () => {
      cursor.style.display = "none";
      document.body.classList.remove("custom-cursor-active");
      setMode(false, false);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const syncEnabled = () => {
      if (mobileQuery.matches || !finePointerQuery.matches) {
        disable();
      } else {
        enable();
      }
    };

    syncEnabled();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        snapOnNextMoveRef.current = true;
        lastFrameMsRef.current = null;
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || mobileQuery.matches) {
        return;
      }
      targetRef.current.x = event.clientX;
      targetRef.current.y = event.clientY;

      if (snapOnNextMoveRef.current) {
        snapOnNextMoveRef.current = false;
        currentRef.current.x = event.clientX;
        currentRef.current.y = event.clientY;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      const isInteractive = Boolean(target?.closest(INTERACTIVE_SELECTOR));
      const isText = Boolean(target?.closest(TEXT_SELECTOR));
      setMode(isInteractive, isText);
    };

    const handlePointerLeave = () => {
      targetRef.current.x = -100;
      targetRef.current.y = -100;
      setMode(false, false);
    };

    mobileQuery.addEventListener("change", syncEnabled);
    finePointerQuery.addEventListener("change", syncEnabled);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    window.addEventListener("blur", handlePointerLeave, { passive: true });

    return () => {
      mobileQuery.removeEventListener("change", syncEnabled);
      finePointerQuery.removeEventListener("change", syncEnabled);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("blur", handlePointerLeave);
      disable();
      document.body.classList.remove("custom-cursor-active");
    };
  }, []);

  return <div id="cur" ref={cursorRef} className="custom-cursor" aria-hidden />;
}
