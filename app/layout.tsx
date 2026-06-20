import type { Metadata } from "next";
import { BRAND, WAVEATLAS_LOGO_PATH, WAVEATLAS_LOGO_URL } from "@/lib/branding";
import "./globals.css";

export const metadata: Metadata = {
  title: "WaveAtlas™",
  description: BRAND.description,
  manifest: "/manifest.webmanifest",
  applicationName: BRAND.name,
  icons: {
    icon: WAVEATLAS_LOGO_PATH,
    shortcut: WAVEATLAS_LOGO_PATH,
    apple: WAVEATLAS_LOGO_URL,
  },
  openGraph: {
    title: "WaveAtlas™",
    description: BRAND.description,
    siteName: BRAND.name,
    images: [{ url: WAVEATLAS_LOGO_URL }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WaveAtlas™",
    description: BRAND.description,
    images: [WAVEATLAS_LOGO_URL],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
