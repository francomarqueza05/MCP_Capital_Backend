import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { asLang, LANG_COOKIE } from "@/lib/lang";

// One family at two widths: expanded for names and numbers (trail signage), normal for text.
const archivo = Archivo({ subsets: ["latin"], variable: "--font", axes: ["wdth"], display: "swap" });

export const metadata: Metadata = {
  title: "Cordada",
  description: "Your Sherpas financial plan as a mountain route, with Cordi as your guide.",
};
export const viewport: Viewport = { themeColor: "#0b1033", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = asLang((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <html lang={lang} className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
