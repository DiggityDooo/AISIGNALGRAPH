import type { Metadata } from "next";
import { Syne, JetBrains_Mono } from "next/font/google";
import { ReactLenis } from "lenis/react";
import ClientShellEffects from "@/components/ui/ClientShellEffects";
import "./globals.css";

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AISIGNALGRAPH | Intelligence Hub",
  description: "The Intelligence Hub for the AI Era",
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
        <ReactLenis root>{children}</ReactLenis>
      </body>
    </html>
  );
}
