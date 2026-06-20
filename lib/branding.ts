export const WAVEATLAS_LOGO =
  "https://raw.githubusercontent.com/Omoluabi1003/WaveAtlas/main/75CBD90B-E435-4EA8-9381-1B99085AEE08.png";

export const BRAND = {
  name: "WaveAtlas™",
  shortName: "WaveAtlas",
  logo: WAVEATLAS_LOGO,
  description: "A geospatial audio exploration platform built by ETL GIS Consulting LLC.",
  tagline: "Travel the World Through Sound",
  shareTitle: "WaveAtlas — Travel the World Through Sound",
  themeColor: "#07111F",
} as const;

export const getBrandLogo = () => BRAND.logo;

export const getBrandLogoAlt = (context = "logo") => `${BRAND.name} ${context}`;

export const getBrandSocialImage = () => ({
  url: BRAND.logo,
  alt: getBrandLogoAlt("logo"),
});

export const getBrandManifestIcons = () => [
  {
    src: BRAND.logo,
    sizes: "any",
    type: "image/png",
    purpose: "any" as const,
  },
  {
    src: BRAND.logo,
    sizes: "any",
    type: "image/png",
    purpose: "maskable" as const,
  },
];
