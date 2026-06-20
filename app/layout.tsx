import type { Metadata } from "next";
import { BRAND } from "@/lib/branding";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND.shareTitle,
  description: BRAND.description,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: BRAND.logo,
    shortcut: BRAND.logo,
    apple: BRAND.logo,
  },
  openGraph: {
    title: BRAND.shareTitle,
    description: BRAND.description,
    siteName: BRAND.name,
    images: [{ url: BRAND.logo, alt: `${BRAND.name} logo` }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.shareTitle,
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
