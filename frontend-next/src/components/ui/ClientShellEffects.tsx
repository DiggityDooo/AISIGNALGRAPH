"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const SHELL_EFFECTS_DELAY_MS = 800;

const GlobalCanvas = dynamic(() => import("@/components/webgl/GlobalCanvas"), {
  ssr: false,
});

const CustomCursor = dynamic(() => import("@/components/ui/CustomCursor"), {
  ssr: false,
});

export default function ClientShellEffects() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (pathname !== "/") {
      const resetTimer = window.setTimeout(() => {
        setEnabled(false);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    if (enabled) {
      return;
    }

    const timer = window.setTimeout(() => {
      setEnabled(true);
    }, SHELL_EFFECTS_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [enabled, pathname]);

  if (!enabled) {
    return null;
  }

  return (
    <>
      <GlobalCanvas />
      <CustomCursor />
    </>
  );
}
