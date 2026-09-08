import type { Metadata } from "next";
import { Syne, JetBrains_Mono } from "next/font/google";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import ClientShellEffects from "@/components/ui/ClientShellEffects";
import SiteChrome from "@/components/layout/SiteChrome";
import "./globals.css";

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://aisignalgraph.com"),
  title: "AISIGNALGRAPH | Intelligence Hub",
  description: "The Intelligence Hub for the AI Era",
  openGraph: {
    title: "AISIGNALGRAPH | Intelligence Hub",
    description: "The Intelligence Hub for the AI Era",
    type: "website",
    url: "https://aisignalgraph.com/",
    images: [{ url: "/spline_preview.jpg" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AISIGNALGRAPH | Intelligence Hub",
    description: "The Intelligence Hub for the AI Era",
    images: ["/spline_preview.jpg"],
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
      className={`${syne.variable} ${jetbrainsMono.variable} h-full antialiased dark`}
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
