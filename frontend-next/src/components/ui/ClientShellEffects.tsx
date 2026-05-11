"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

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
    const timer = window.setTimeout(() => {
      setEnabled(true);
    }, 800);

    return () => window.clearTimeout(timer);
  }, []);

  if (!enabled || pathname !== "/") {
    return null;
  }

  return (
    <>
      <GlobalCanvas />
      <CustomCursor />
    </>
  );
}
