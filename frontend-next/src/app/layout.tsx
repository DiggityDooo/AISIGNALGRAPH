import type { Metadata } from "next";
import "@fontsource-variable/syne";
import "@fontsource-variable/jetbrains-mono";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import ClientShellEffects from "@/components/ui/ClientShellEffects";
import SiteChrome from "@/components/layout/SiteChrome";
import "./globals.css";
import "./desk.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://aisignalgraph.com"),
  title: "AISIGNALGRAPH | Intelligence Hub",
  description: "The Intelligence Hub for the AI Era",
  openGraph: {
    title: "AISIGNALGRAPH | Intelligence Hub",
    description: "The Intelligence Hub for the AI Era",
    type: "website",
    url: "https://aisignalgraph.com/",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "AISIGNALGRAPH — The Intelligence Hub for the AI Era",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AISIGNALGRAPH | Intelligence Hub",
    description: "The Intelligence Hub for the AI Era",
    images: ["/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased dark"
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-mono overflow-x-hidden">
        <ClientShellEffects />
        <SiteChrome>
          <ReactLenis root>{children}</ReactLenis>
        </SiteChrome>
      </body>
    </html>
  );
}
