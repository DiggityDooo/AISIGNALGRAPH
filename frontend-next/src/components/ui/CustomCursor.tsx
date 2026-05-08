"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export default function CustomCursor() {
  const [isHovering, setIsHovering] = useState(false);
  const cursorX = useMotionValue(-100);
  const cursorY = useMotionValue(-100);
  const rafIdRef = useRef<number | null>(null);
  const hoverStateRef = useRef(false);

  const springConfig = { damping: 25, stiffness: 250 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const finePointerQuery = window.matchMedia("(pointer: fine)");
    if (!finePointerQuery.matches) {
      return undefined;
    }

    let latestX = -100;
    let latestY = -100;

    const flushPointerPosition = () => {
      rafIdRef.current = null;
      cursorX.set(latestX);
      cursorY.set(latestY);
    };

    const queuePointerPosition = (x: number, y: number) => {
      latestX = x;
      latestY = y;
      if (rafIdRef.current === null) {
        rafIdRef.current = window.requestAnimationFrame(flushPointerPosition);
      }
    };

    const updateHoverState = (nextHovering: boolean) => {
      if (hoverStateRef.current === nextHovering) {
        return;
      }
      hoverStateRef.current = nextHovering;
      setIsHovering(nextHovering);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }
      queuePointerPosition(event.clientX, event.clientY);
    };

    const handlePointerOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isInteractive = Boolean(
        target?.closest("button, a, .glass-panel, [data-pointer-reactive], [role='button'], input, select, textarea")
      );
      updateHoverState(isInteractive);
    };

    const handlePointerLeave = () => {
      updateHoverState(false);
      queuePointerPosition(-100, -100);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerover", handlePointerOver, { passive: true });
    window.addEventListener("blur", handlePointerLeave, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerover", handlePointerOver);
      window.removeEventListener("blur", handlePointerLeave);
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [cursorX, cursorY]);

  return (
    <motion.div
      className="fixed top-0 left-0 w-4 h-4 bg-primary rounded-full pointer-events-none z-[9999] hidden md:flex items-center justify-center origin-center"
      style={{
        x: cursorXSpring,
        y: cursorYSpring,
        translateX: "-50%",
        translateY: "-50%",
      }}
      animate={{
        scale: isHovering ? 3 : 1,
        backgroundColor: isHovering ? "rgba(255, 42, 77, 0.2)" : "rgba(255, 42, 77, 1)",
        border: isHovering ? "1px solid rgba(255, 42, 77, 1)" : "none",
      }}
      transition={{ scale: { type: "spring", damping: 15 } }}
    >
      {isHovering && (
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          className="w-full h-full border border-dashed border-primary rounded-full absolute"
        />
      )}
    </motion.div>
  );
}
