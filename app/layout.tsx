import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";

// One family at two widths: expanded for names and numbers (trail signage), normal for text.
const archivo = Archivo({ subsets: ["latin"], variable: "--font", axes: ["wdth"], display: "swap" });

export const metadata: Metadata = {
  title: "Cordada",
  description: "Tu plan financiero de Sherpas, como una ruta de montaña, con Cordi de guía.",
};
export const viewport: Viewport = { themeColor: "#0b1033", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
