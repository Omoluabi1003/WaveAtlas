export const WAVEATLAS_LOGO_URL =
  "https://raw.githubusercontent.com/Omoluabi1003/WaveAtlas/main/public/brand/waveatlas-atlas-compass.svg";
export const WAVEATLAS_LOGO_PATH = "/brand/waveatlas-atlas-compass.svg";

export const BRAND = {
  name: "WaveAtlas™",
  logoUrl: WAVEATLAS_LOGO_URL,
  logoPath: WAVEATLAS_LOGO_PATH,
  shortName: "WaveAtlas",
  description: "A geospatial audio exploration platform built by ETL GIS Consulting LLC.",
  tagline: "Travel the World Through Sound",
  shareTitle: "WaveAtlas — Travel the World Through Sound",
  themeColor: "#07111F",
} as const;

export const getBrandManifestIcons = () => [
  {
    src: WAVEATLAS_LOGO_URL,
    sizes: "any",
    type: "image/svg+xml",
    purpose: "any maskable" as const,
  },
];

export const getBrandShareMetadata = () => ({
  image: WAVEATLAS_LOGO_URL,
  imageType: "image/svg+xml",
} as const);
