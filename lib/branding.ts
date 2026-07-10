export const WAVEATLAS_SITE_URL = "https://wave-atlas.vercel.app";
export const DEVELOPER_ATTRIBUTION = 'Developed by Paul Iyogun';

export const WAVEATLAS_LOGO_PATH = "/brand/waveatlas-512x512.png";
export const WAVEATLAS_APP_ICON_192_PATH = "/brand/waveatlas-192x192.png";
export const WAVEATLAS_APP_ICON_512_PATH = "/brand/waveatlas-512x512.png";
export const WAVEATLAS_APPLE_ICON_PATH = "/brand/waveatlas-180x180.png";
export const WAVEATLAS_FAVICON_16_PATH = "/brand/waveatlas-16x16.png";
export const WAVEATLAS_FAVICON_32_PATH = "/brand/waveatlas-32x32.png";
export const WAVEATLAS_FAVICON_48_PATH = "/brand/waveatlas-48x48.png";
export const WAVEATLAS_SHARE_IMAGE_PATH = "/brand/waveatlas-1024x1024.png";
export const WAVEATLAS_SHARE_IMAGE_VERSIONED_PATH = WAVEATLAS_SHARE_IMAGE_PATH;

export const WAVEATLAS_LOGO_URL = `${WAVEATLAS_SITE_URL}${WAVEATLAS_LOGO_PATH}`;
export const WAVEATLAS_APP_ICON_192_URL = `${WAVEATLAS_SITE_URL}${WAVEATLAS_APP_ICON_192_PATH}`;
export const WAVEATLAS_APP_ICON_512_URL = `${WAVEATLAS_SITE_URL}${WAVEATLAS_APP_ICON_512_PATH}`;
export const WAVEATLAS_APPLE_ICON_URL = `${WAVEATLAS_SITE_URL}${WAVEATLAS_APPLE_ICON_PATH}`;
export const WAVEATLAS_FAVICON_16_URL = `${WAVEATLAS_SITE_URL}${WAVEATLAS_FAVICON_16_PATH}`;
export const WAVEATLAS_FAVICON_32_URL = `${WAVEATLAS_SITE_URL}${WAVEATLAS_FAVICON_32_PATH}`;
export const WAVEATLAS_FAVICON_48_URL = `${WAVEATLAS_SITE_URL}${WAVEATLAS_FAVICON_48_PATH}`;
export const WAVEATLAS_SHARE_IMAGE_URL = `${WAVEATLAS_SITE_URL}${WAVEATLAS_SHARE_IMAGE_VERSIONED_PATH}`;

export const BRAND = {
  name: "WaveAtlas™",
  logoUrl: WAVEATLAS_LOGO_URL,
  logoPath: WAVEATLAS_LOGO_PATH,
  shortName: "WaveAtlas",
  title: "WaveAtlas™ | The Entire World. Live.",
  description: `If it's broadcasting on Earth, it belongs here.

The entire world. Live.

Explore Humanity Through Sound™`,
  tagline: "Explore Humanity Through Sound",
  shareTitle: "WaveAtlas™ | The Entire World. Live.",
  siteUrl: WAVEATLAS_SITE_URL,
  themeColor: "#07111F",
} as const;

const manifestIconSizes = [72, 96, 128, 144, 152, 192, 384, 512] as const;

export const getBrandManifestIcons = () =>
  manifestIconSizes.map((size) => ({
    src: `/brand/waveatlas-${size}x${size}.png`,
    sizes: `${size}x${size}`,
    type: "image/png",
    purpose: "any maskable" as const,
  }));

export const getBrandShareMetadata = () => ({
  image: WAVEATLAS_SHARE_IMAGE_URL,
  imageType: "image/png",
} as const);
