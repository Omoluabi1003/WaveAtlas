import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WaveAtlas",
    short_name: "WaveAtlas",
    description: "Tune the World with a global live radio dial.",
    start_url: "/",
    display: "standalone",
    background_color: "#07111F",
    theme_color: "#07111F",
    icons: [
      {
        src: BRAND.logo,
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
      {
        src: BRAND.logo,
        sizes: "any",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
