import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

/*
 * Tipografías (tarea 12.2) — paridad 1:1 con el Sistema_Actual (out/index.html),
 * que carga vía Google Fonts:
 *   family=Inter:wght@400;500;600;700
 *   family=Space+Grotesk:wght@500;600;700
 *   &display=swap
 *
 * Aquí se cargan con next/font/google (self-host + preconnect automáticos, sin
 * <link> externo). Cada fuente expone una variable CSS:
 *   Inter          -> --font-inter
 *   Space Grotesk  -> --font-space-grotesk
 *
 * next/font NO registra los nombres de familia 'Inter'/'Space Grotesk'
 * globalmente (usa un nombre hasheado), así que en globals.css los literales
 * 'Inter' y 'Space Grotesk' se reemplazaron por var(--font-inter) y
 * var(--font-space-grotesk) (conservando los fallbacks) para que todos los
 * selectores existentes usen efectivamente las fuentes de next/font.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Indicadores de Personal · OLO",
  description: "Panel de indicadores de personal de OLO",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
