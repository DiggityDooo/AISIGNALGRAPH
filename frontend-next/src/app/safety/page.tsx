import type { Metadata } from "next";
import SafetyDesk from "./SafetyDesk";

export const metadata: Metadata = {
  title: "AI Safety Desk | AISIGNALGRAPH",
  description: "Follow safety research, industry conduct reports, and consumer guidance from the AI knowledge graph.",
};

export default function SafetyPage() {
  return <SafetyDesk />;
}
