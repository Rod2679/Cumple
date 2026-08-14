import type { Metadata } from "next";
import { Caveat, Geist_Mono, Italiana, Manrope } from "next/font/google";
import "./globals.css";
import "./memory-game.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const italiana = Italiana({
  variable: "--font-italiana",
  subsets: ["latin"],
  weight: "400",
});

const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Para Ali — una carta de cumpleaños",
  description: "Un pastel, una sorpresa, música y una sola carta escrita con todo mi amor para Ali.",
  other: {
    "codex-preview": "development",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${manrope.variable} ${geistMono.variable} ${italiana.variable} ${caveat.variable}`}>
        {children}
      </body>
    </html>
  );
}
