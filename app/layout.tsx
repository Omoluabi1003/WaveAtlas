import { ButtonFeedback } from "@/components/ButtonFeedback";
import type { Metadata, Viewport } from "next";
import {
  BRAND,
  WAVEATLAS_APPLE_ICON_PATH,
  WAVEATLAS_FAVICON_16_PATH,
  WAVEATLAS_FAVICON_32_PATH,
  WAVEATLAS_FAVICON_48_PATH,
  WAVEATLAS_SHARE_IMAGE_URL,
  WAVEATLAS_SITE_URL,
} from "@/lib/branding";
import { BackgroundRotationProvider } from "@/components/background-rotation-provider";
import { ServiceWorkerDiagnostics } from "@/components/ServiceWorkerDiagnostics";
import { fontBody, fontDisplay, fontMono } from "@/app/fonts";
import "./globals.css";
import "./fonts.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(WAVEATLAS_SITE_URL),
  title: BRAND.title,
  description: BRAND.description,
  manifest: "/manifest.webmanifest",
  applicationName: BRAND.name,
  icons: {
    icon: [
      { url: WAVEATLAS_FAVICON_16_PATH, sizes: "16x16", type: "image/png" },
      { url: WAVEATLAS_FAVICON_32_PATH, sizes: "32x32", type: "image/png" },
    ],
    shortcut: [{ url: WAVEATLAS_FAVICON_48_PATH, sizes: "48x48", type: "image/png" }],
    apple: [{ url: WAVEATLAS_APPLE_ICON_PATH, sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: BRAND.title,
    description: BRAND.description,
    url: WAVEATLAS_SITE_URL,
    siteName: BRAND.name,
    images: [{ url: WAVEATLAS_SHARE_IMAGE_URL, width: 1024, height: 1024, alt: "WaveAtlas logo" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.title,
    description: BRAND.description,
    images: [WAVEATLAS_SHARE_IMAGE_URL],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable}`}>
      <body>
        <script src="/browser-compatibility.js" async />
        <div id="waveatlas-compatibility-help" style={{ position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 120, padding: 16, borderRadius: 16, background: "#08111D", color: "#F7F5EF", border: "1px solid #D4A64A", fontFamily: "Arial, sans-serif" }}>
          Having trouble opening the atlas? <a href="/listen" style={{ color: "#00D68F", textDecoration: "underline", display: "inline-block", padding: "8px 12px" }}>Open the lightweight player</a>
        </div>
        <ButtonFeedback /><ServiceWorkerDiagnostics /><BackgroundRotationProvider>{children}</BackgroundRotationProvider></body>
    </html>
  );
}
