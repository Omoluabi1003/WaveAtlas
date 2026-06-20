import type { Metadata } from "next";
import { BRAND, getBrandLogo, getBrandSocialImage } from "@/lib/branding";
import "./globals.css";

export const metadata: Metadata = {
  title: BRAND.shareTitle,
  description: BRAND.description,
  manifest: "/manifest.webmanifest",
  applicationName: BRAND.name,
  icons: {
    icon: getBrandLogo(),
    shortcut: getBrandLogo(),
    apple: getBrandLogo(),
  },
  openGraph: {
    title: BRAND.shareTitle,
    description: BRAND.description,
    siteName: BRAND.name,
    images: [getBrandSocialImage()],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.shareTitle,
    description: BRAND.description,
    images: [getBrandLogo()],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
