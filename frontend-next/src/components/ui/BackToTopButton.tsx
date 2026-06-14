"use client";

import { useLenis } from "lenis/react";
import { useCallback, useEffect, useState } from "react";

function getThreshold() {
  if (typeof window === "undefined") {
    return 480;
  }
  return Math.max(480, window.innerHeight * 0.75);
}

export default function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  const updateVisible = useCallback((scrollY: number) => {
    setVisible(scrollY > getThreshold());
  }, []);

  const lenis = useLenis((instance) => {
    updateVisible(instance.scroll);
  });

  useEffect(() => {
    let rafId: number;
    if (lenis) {
      rafId = requestAnimationFrame(() => {
        updateVisible(lenis.scroll);
      });
      return () => {
        cancelAnimationFrame(rafId);
      };
    }

    const onScroll = () => updateVisible(window.scrollY);
    rafId = requestAnimationFrame(() => {
      onScroll();
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
    };
  }, [lenis, updateVisible]);

  useEffect(() => {
    const onResize = () => {
      updateVisible(lenis?.scroll ?? window.scrollY);
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, [lenis, updateVisible]);

  const scrollToTop = useCallback(() => {
    if (lenis) {
      lenis.scrollTo(0);
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [lenis]);

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      className="back-to-top pointer-events-auto"
      aria-label="Back to top of page"
      title="Back to top"
      onClick={scrollToTop}
    >
      <span aria-hidden="true">↑</span>
    </button>
  );
}
