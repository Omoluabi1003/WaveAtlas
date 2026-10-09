import { earthVector, subsolarPoint } from './earth-lighting';
import type { GlobeRotation } from './globe-math';

type Texture = { pixels: Uint8ClampedArray; width: number; height: number };
const decoded = new Map<string, Promise<Texture>>();
function texture(url: string) {
  const hit = decoded.get(url); if (hit) return hit;
  const request = new Promise<Texture>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try { const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true }); if (!ctx) throw new Error('Texture decoding unavailable');
        ctx.drawImage(image, 0, 0); resolve({ pixels: ctx.getImageData(0, 0, image.width, image.height).data, width: image.width, height: image.height });
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error('Earth image unavailable')); image.src = url;
  });
  decoded.set(url, request); void request.catch(() => decoded.delete(url)); return request;
}

/** Local satellite texture fallback for browsers without an available GPU. */
export class JourneyEarthSurface {
  private canvas = document.createElement('canvas');
  private context = this.canvas.getContext('2d');
  private day?: Texture; private night?: Texture; private clouds?: Texture;
  private disposed = false; private signature = '';
  constructor(mobile: boolean) {
    this.canvas.width = this.canvas.height = mobile ? 192 : 256;
    void Promise.all(['day-1024', 'night-1024', 'clouds-1024'].map(name => texture(`/earth/${name}.webp`))).then(([day, night, clouds]) => {
      if (this.disposed) return; this.day = day; this.night = night; this.clouds = clouds;
    }).catch(() => {});
  }
  render(rotation: GlobeRotation, at: number): HTMLCanvasElement | null {
    if (!this.day || !this.night || !this.clouds || !this.context || this.disposed) return null;
    const signature = `${rotation.rotX.toFixed(4)}:${rotation.rotY.toFixed(4)}:${Math.floor(at / 60000)}`;
    if (signature === this.signature) return this.canvas;
    this.signature = signature;
    const size = this.canvas.width, frame = this.context.createImageData(size, size), output = frame.data;
    const sl = Math.sin(rotation.rotX), cl = Math.cos(rotation.rotX), so = Math.sin(rotation.rotY), co = Math.cos(rotation.rotY);
    const solar = subsolarPoint(at), sun = earthVector(solar.lat, solar.lng);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const nx = (x + .5) * 2 / size - 1, ny = 1 - (y + .5) * 2 / size, r2 = nx * nx + ny * ny;
      if (r2 >= 1) continue;
      const z = Math.sqrt(1 - r2), forward = z * cl - ny * sl;
      const wx = nx * co + forward * so, wy = ny * cl + z * sl, wz = forward * co - nx * so;
      const u = (.5 + Math.atan2(wx, wz) / (2 * Math.PI) + 1) % 1, v = .5 - Math.asin(Math.max(-1, Math.min(1, wy))) / Math.PI;
      const index = (Math.min(this.day.height - 1, Math.floor(v * this.day.height)) * this.day.width + Math.floor(u * this.day.width)) * 4;
      const cloudIndex = (Math.min(this.clouds.height - 1, Math.floor(v * this.clouds.height)) * this.clouds.width + Math.floor(u * this.clouds.width)) * 4;
      const incidence = wx * sun[0] + wy * sun[1] + wz * sun[2];
      const daylight = Math.max(0, Math.min(1, (incidence + .12) / .28));
      const light = .52 + .48 * Math.max(0, incidence), cloud = Math.max(0, this.clouds.pixels[cloudIndex] / 255 - .12) * .7;
      const out = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const day = this.day.pixels[index + channel] * light;
        const night = this.night.pixels[index + channel] * .65 + this.day.pixels[index + channel] * .035;
        const base = night * (1 - daylight) + day * daylight;
        output[out + channel] = base * (1 - cloud) + (12 + 205 * daylight) * cloud + (channel === 2 ? 28 : channel === 1 ? 12 : 4) * Math.pow(1 - z, 3);
      }
      output[out + 3] = Math.min(255, (1 - r2) * 18000);
    }
    this.context.putImageData(frame, 0, 0); return this.canvas;
  }
  dispose() { this.disposed = true; this.canvas.width = this.canvas.height = 1; }
}
