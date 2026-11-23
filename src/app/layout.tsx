import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Sistem Produksi Cetak", template: "%s · Sistem Produksi Cetak" },
  description: "SPK digital, papan produksi, dan lacak pesanan untuk usaha percetakan kain.",
  icons: { icon: "/logo.svg" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#9d174d" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
