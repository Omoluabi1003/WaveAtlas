import type { Metadata } from "next";
import { BRAND } from "@/lib/branding";
import "./globals.css";

export const metadata: Metadata = {
  title: "WaveAtlas™",
  description: BRAND.description,
  manifest: "/manifest.webmanifest",
  applicationName: BRAND.name,
  icons: {
    icon: BRAND.logo,
    shortcut: BRAND.logo,
    apple: BRAND.logo,
  },
  openGraph: {
    title: "WaveAtlas™",
    description: BRAND.description,
    siteName: BRAND.name,
    images: [{ url: BRAND.logo }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WaveAtlas™",
    description: BRAND.description,
    images: [BRAND.logo],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
