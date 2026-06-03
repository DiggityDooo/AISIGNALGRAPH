"use client";

import { useEffect } from "react";
import { subscribePointerPosition } from "@/lib/pointerPosition";

export function usePointerReactiveSurface() {
  useEffect(() => subscribePointerPosition(), []);
}
