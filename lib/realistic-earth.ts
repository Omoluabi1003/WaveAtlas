import { earthVector, subsolarPoint } from "./earth-lighting";
import type { GlobeRotation } from "./globe-math";

const VERTEX = `
attribute vec2 aPosition;
varying vec2 vPosition;
void main() { vPosition = aPosition; gl_Position = vec4(aPosition, 0.0, 1.0); }
`;
const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vPosition;
uniform sampler2D uDay;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform vec2 uRotation;
uniform vec3 uSun;
uniform float uDrift;
uniform float uNightMode;
uniform vec2 uNightTexel;
const float PI = 3.141592653589793;
vec3 worldNormal(vec3 local) {
  float sl = sin(uRotation.x), cl = cos(uRotation.x);
  float so = sin(uRotation.y), co = cos(uRotation.y);
  float forward = local.z * cl - local.y * sl;
  return vec3(local.x * co + forward * so, local.y * cl + local.z * sl, forward * co - local.x * so);
}
float cityLight(vec2 uv) {
  vec3 night = texture2D(uNight, vec2(fract(uv.x), clamp(uv.y,0.0,1.0))).rgb;
  return smoothstep(0.16, 0.70, dot(night, vec3(0.2126,0.7152,0.0722)));
}
void main() {
  float radius2 = dot(vPosition, vPosition);
  if (radius2 > 1.0) { gl_FragColor = vec4(0.0); return; }
  float depth = sqrt(max(0.0, 1.0 - radius2));
  vec3 normal = worldNormal(vec3(vPosition, depth));
  vec2 uv = vec2(fract(0.5 + atan(normal.x, normal.z) / (2.0 * PI)), 0.5 - asin(clamp(normal.y, -1.0, 1.0)) / PI);
  float incidence = dot(normal, uSun);
  float daylight = smoothstep(-0.12, 0.16, incidence) * (1.0 - uNightMode);
  vec3 day = texture2D(uDay, uv).rgb;
  vec3 night = texture2D(uNight, uv).rgb;
  vec2 cloudUV = vec2(fract(uv.x + uDrift), uv.y);
  float cloud = smoothstep(0.12, 0.85, texture2D(uClouds, cloudUV).r) * 0.72;
  float shadow = texture2D(uClouds, vec2(fract(cloudUV.x + 0.003), cloudUV.y + 0.001)).r;
  day *= (0.52 + 0.48 * max(incidence, 0.0)) * (1.0 - shadow * 0.13);
  float city = cityLight(uv);
  vec2 stepUV = uNightTexel * 2.2;
  float glow = (cityLight(uv + vec2(stepUV.x,0.0)) + cityLight(uv - vec2(stepUV.x,0.0)) + cityLight(uv + vec2(0.0,stepUV.y)) + cityLight(uv - vec2(0.0,stepUV.y))) * 0.25;
  vec3 cityColor = vec3(1.0,0.76,0.38) * city * 1.30 + vec3(0.90,0.52,0.16) * glow * 0.38;
  vec3 nightSurface = night * vec3(0.20,0.27,0.42) + day * 0.035 + cityColor;
  vec3 color = mix(nightSurface, day, daylight);
  float ocean = smoothstep(0.02, 0.13, day.b - max(day.r, day.g));
  vec3 view = worldNormal(vec3(0.0, 0.0, 1.0));
  float glint = pow(max(dot(normal, normalize(uSun + view + vec3(0.00001))), 0.0), 65.0);
  color += vec3(0.60, 0.74, 0.90) * glint * ocean * daylight * (1.0 - cloud) * 0.35;
  color = mix(color, vec3(0.025,0.035,0.055) + vec3(0.78, 0.81, 0.85) * daylight, cloud * mix(0.48,1.0,daylight));
  float rim = pow(1.0 - depth, 3.0);
  color += vec3(0.07, 0.26, 0.52) * rim * (0.35 + 0.65 * daylight);
  float alpha = smoothstep(0.0, 0.008, 1.0 - radius2);
  gl_FragColor = vec4(color, alpha);
}
`;

// Shared decoded images avoid duplicate downloads when station changes remount the render loop.
const images = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = images.get(url);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const timeout = window.setTimeout(() => { image.onload = image.onerror = null; reject(new Error(`Earth texture timed out: ${url}`)); }, 12000);
    image.onload = () => { window.clearTimeout(timeout); resolve(image); };
    image.onerror = () => { window.clearTimeout(timeout); reject(new Error(`Earth texture unavailable: ${url}`)); };
    image.src = url;
  });
  images.set(url, promise);
  void promise.catch(() => { if (images.get(url) === promise) images.delete(url); });
  return promise;
}

export class RealisticEarth {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private shaders: WebGLShader[] = [];
  private textures: WebGLTexture[] = [];
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private ready = false;
  private nightReady = false;
  private disposed = false;
  private lost = false;
  private lastSolarMinute = -1;
  private sun: [number, number, number] = [0, 0, 1];
  private drift = 0;
  private lastFrame = 0;
  private handleLost = (event: Event) => { event.preventDefault(); this.lost = true; this.ready = false; };

  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext, private mobile: boolean) {
    this.canvas = canvas;
    this.gl = gl;
  }

  static create(mobile: boolean): RealisticEarth | null {
    if (typeof document === "undefined" || process.env.NEXT_PUBLIC_WAVEATLAS_REALISTIC_EARTH === "false" || process.env.NEXT_PUBLIC_WAVEATLAS_FORCE_LEGACY_RENDERER === "true") return null;
    let earth: RealisticEarth | null = null;
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: "low-power" });
      if (!gl) return null;
      earth = new RealisticEarth(canvas, gl, mobile);
      earth.initialize();
      return earth;
    } catch {
      earth?.dispose();
      return null;
    }
  }

  private initialize() {
    const gl = this.gl;
    this.canvas.addEventListener("webglcontextlost", this.handleLost);
    const compile = (kind: number, source: string) => {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error("Earth shader unavailable");
      this.shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Earth shader compilation failed");
      return shader;
    };
    this.program = gl.createProgram();
    if (!this.program) throw new Error("Earth program unavailable");
    gl.attachShader(this.program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(this.program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error("Earth shader linking failed");
    gl.useProgram(this.program);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(this.program, "aPosition");
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    for (const name of ["uDay", "uNight", "uClouds", "uRotation", "uSun", "uDrift", "uNightMode", "uNightTexel"]) this.uniforms.set(name, gl.getUniformLocation(this.program, name));
    const width = this.mobile || gl.getParameter(gl.MAX_TEXTURE_SIZE) < 2048 ? 1024 : 2048;
    gl.uniform2f(this.uniforms.get("uNightTexel")!, 1 / width, 2 / width);
    for (const [index, name] of ["day", "night", "clouds"].entries()) {
      const texture = gl.createTexture();
      if (!texture) throw new Error("Earth texture allocation failed");
      this.textures.push(texture);
      gl.activeTexture(gl.TEXTURE0 + index); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      gl.uniform1i(this.uniforms.get(["uDay", "uNight", "uClouds"][index])!, index);
      void loadImage(`/earth/${name}-${name === "clouds" ? 1024 : width}.webp`).then((image) => {
        if (this.disposed || this.lost) return;
        gl.activeTexture(gl.TEXTURE0 + index); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        if (gl.getError() !== gl.NO_ERROR) throw new Error("Earth texture upload failed");
        if (index === 0) this.ready = true;
        if (index === 1) this.nightReady = true;
      }).catch(() => { if (index === 0) this.ready = false; });
    }
  }

  /** Returns null while loading or after any GPU failure; the caller draws its existing globe. */
  render(rotation: GlobeRotation, diameter: number, at: number, motionAt: number, reducedMotion: boolean, nightMode = false): HTMLCanvasElement | null {
    if (!this.ready || (nightMode && !this.nightReady) || this.disposed || this.lost || this.gl.isContextLost()) return null;
    const gl = this.gl;
    try {
      const size = Math.max(64, Math.min(this.mobile ? 768 : 1280, Math.round(diameter)));
      if (this.canvas.width !== size) { this.canvas.width = size; this.canvas.height = size; gl.viewport(0, 0, size, size); }
      const solarMinute = Math.floor(at / 60000);
      if (solarMinute !== this.lastSolarMinute) {
        const solar = subsolarPoint(at); this.sun = earthVector(solar.lat, solar.lng); this.lastSolarMinute = solarMinute;
      }
      // Clamp elapsed time on resume, and freeze drift for reduced-motion users.
      if (!reducedMotion && this.lastFrame) this.drift = (this.drift + Math.min(100, Math.max(0, motionAt - this.lastFrame)) / 43200000) % 1;
      this.lastFrame = motionAt;
      gl.useProgram(this.program);
      gl.uniform2f(this.uniforms.get("uRotation")!, rotation.rotX, rotation.rotY);
      gl.uniform3fv(this.uniforms.get("uSun")!, this.sun);
      gl.uniform1f(this.uniforms.get("uDrift")!, this.drift);
      gl.uniform1f(this.uniforms.get("uNightMode")!, nightMode ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (gl.getError() !== gl.NO_ERROR) { this.ready = false; return null; }
      return this.canvas;
    } catch { this.ready = false; return null; }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.ready = false;
    this.canvas.removeEventListener("webglcontextlost", this.handleLost);
    for (const texture of this.textures) this.gl.deleteTexture(texture);
    for (const shader of this.shaders) this.gl.deleteShader(shader);
    this.gl.deleteBuffer(this.buffer); this.gl.deleteProgram(this.program);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.canvas.width = this.canvas.height = 1;
  }
}
