import type React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "spline-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          url?: string;
          loading?: "lazy" | "eager";
          "events-target"?: "global" | "local";
        },
        HTMLElement
      >;
    }
  }
}

declare global {
  interface Window {
    gephiLite?: {
      selectNode?: (id: string) => void;
      flyToNode?: (id: string, prefer3d?: boolean) => Promise<void>;
      reloadGraphData?: () => Promise<void>;
    };
  }
}

export {};
