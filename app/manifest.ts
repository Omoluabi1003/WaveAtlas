import type { MetadataRoute } from "next";
import { BRAND, getBrandManifestIcons } from "@/lib/branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.shortName,
    short_name: BRAND.shortName,
    description: BRAND.description,
    start_url: "/",
    display: "standalone",
    background_color: BRAND.themeColor,
    theme_color: BRAND.themeColor,
    icons: getBrandManifestIcons(),
  };
}
