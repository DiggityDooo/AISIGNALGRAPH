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
  const [activePath, setActivePath] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setActivePath(pathname === "/" ? "/" : null);
    }, pathname === "/" ? SHELL_EFFECTS_DELAY_MS : 0);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (activePath !== "/") {
    return null;
  }

  return (
    <>
      <GlobalCanvas />
      <CustomCursor />
    </>
  );
}
