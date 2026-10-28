"use client";

import { useEffect, useRef, useState } from "react";
import type { AtlasAudioSpectrum } from "@/lib/atlas-audio-spectrum";

type PlaybackContext = { status?: string };
type StationContext = { name?: string; station_uuid?: string; id?: string } | null;

type RuntimeState = {
  status: string;
  spectrum: AtlasAudioSpectrum;
  spectrumAvailable: boolean;
  stationImpulse: number;
};

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 u_resolution;
uniform vec2 u_pointer;
uniform vec4 u_globe;
uniform float u_time;
uniform float u_energy;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_stationImpulse;
uniform float u_analysisAvailable;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise21(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float ring(float radius, float width, float distanceToCenter) {
  return 1.0 - smoothstep(width, width * 2.2, abs(distanceToCenter - radius));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / max(u_resolution, vec2(1.0));
  vec2 center = u_globe.xy;
  vec2 halfSize = max(u_globe.zw * 0.5, vec2(1.0));
  vec2 local = (frag - center) / halfSize;
  float radial = length(local);
  float insideGlobeStage = 1.0 - smoothstep(1.22, 1.48, radial);

  float t = u_time;
  float liveEnergy = max(u_energy, 0.16);
  float bass = mix(liveEnergy * 0.72, u_bass, u_analysisAvailable);
  float mid = mix(liveEnergy * 0.54, u_mid, u_analysisAvailable);
  float treble = mix(liveEnergy * 0.36, u_treble, u_analysisAvailable);

  vec3 mint = vec3(0.337, 0.961, 0.733);
  vec3 cyan = vec3(0.384, 0.851, 1.0);
  vec3 gold = vec3(0.91, 0.741, 0.416);
  vec3 color = vec3(0.0);
  float alpha = 0.0;

  float breathing = 0.5 + 0.5 * sin(t * (1.15 + bass * 2.6));
  float mainRing = ring(1.03 + breathing * 0.015 + bass * 0.035, 0.0055 + bass * 0.006, radial);
  float outerRing = ring(1.16 + mid * 0.04, 0.0035 + mid * 0.004, radial);
  float acquisition = ring(0.90 + fract(t * 0.14) * 0.34, 0.0045, radial) * u_stationImpulse;
  float bassWave = ring(1.0 + sin(t * 4.0) * 0.018, 0.007 + bass * 0.008, radial) * bass;

  float angle = atan(local.y, local.x);
  float arcMask = smoothstep(0.12, 0.0, abs(sin(angle * 3.0 + t * (0.42 + mid * 0.9)))) * outerRing;
  float scan = smoothstep(0.035, 0.0, abs(fract((angle / 6.2831853) + t * 0.055) - 0.5)) * ring(1.10, 0.018, radial);

  color += mint * mainRing * (0.28 + bass * 0.9);
  color += cyan * outerRing * (0.20 + mid * 0.75);
  color += gold * acquisition * 1.15;
  color += mint * bassWave * 0.58;
  color += cyan * arcMask * (0.26 + treble * 0.8);
  color += gold * scan * (0.16 + treble * 0.55);
  alpha += mainRing * (0.16 + bass * 0.34);
  alpha += outerRing * (0.10 + mid * 0.22);
  alpha += acquisition * 0.46;
  alpha += arcMask * 0.20;
  alpha += scan * 0.14;

  float glow = exp(-4.2 * max(0.0, radial - 0.72)) * insideGlobeStage;
  vec2 pointerDelta = uv - u_pointer;
  float pointerGlow = exp(-10.0 * dot(pointerDelta, pointerDelta));
  color += mix(cyan, mint, 0.55) * glow * (0.015 + liveEnergy * 0.045);
  color += cyan * pointerGlow * insideGlobeStage * 0.018;
  alpha += glow * (0.025 + liveEnergy * 0.055);

  vec2 starGrid = uv * vec2(72.0, 118.0);
  vec2 starCell = floor(starGrid);
  vec2 starUV = fract(starGrid) - 0.5;
  float starSeed = hash21(starCell);
  float star = step(0.965, starSeed) * smoothstep(0.085, 0.0, length(starUV));
  float twinkle = 0.45 + 0.55 * sin(t * (1.0 + starSeed * 2.4) + starSeed * 20.0);
  color += mix(cyan, gold, step(0.992, starSeed)) * star * twinkle * (0.14 + treble * 0.32);
  alpha += star * twinkle * 0.18;

  float field = noise21(uv * vec2(5.0, 8.0) + vec2(t * 0.015, -t * 0.009));
  float fieldMask = smoothstep(0.67, 0.94, field) * insideGlobeStage;
  color += mix(vec3(0.015, 0.08, 0.10), vec3(0.02, 0.13, 0.12), mid) * fieldMask * 0.22;
  alpha += fieldMask * 0.035;

  alpha = clamp(alpha, 0.0, 0.72);
  gl_FragColor = vec4(color, alpha);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("[WaveAtlas cinematic shader]", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("[WaveAtlas cinematic program]", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export function AtlasVisualSystem() {
  const [status, setStatus] = useState("idle");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<RuntimeState>({
    status: "idle",
    spectrum: { energy: 0, bass: 0, mid: 0, treble: 0, source: "unavailable" },
    spectrumAvailable: false,
    stationImpulse: 0,
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.waveatlasVisual = "v3-cinematic";
    let lastStationKey = "";

    const onPlayback = (event: Event) => {
      const detail = (event as CustomEvent<PlaybackContext>).detail;
      if (!detail?.status) return;
      runtimeRef.current.status = detail.status;
      setStatus(detail.status);
      root.dataset.waveatlasPlayback = detail.status;
    };
    const onSpectrum = (event: Event) => {
      const detail = (event as CustomEvent<AtlasAudioSpectrum>).detail;
      if (!detail) return;
      runtimeRef.current.spectrum = detail;
      runtimeRef.current.spectrumAvailable = detail.source === "analyser";
      root.dataset.waveatlasAudioReactive = detail.source === "analyser" ? "live" : "state-fallback";
    };
    const onStation = (event: Event) => {
      const station = (event as CustomEvent<StationContext>).detail;
      const nextKey = station?.station_uuid || station?.id || station?.name || "";
      if (nextKey && nextKey !== lastStationKey) {
        lastStationKey = nextKey;
        runtimeRef.current.stationImpulse = 1;
      }
    };

    window.addEventListener("waveatlas:playback-context", onPlayback);
    window.addEventListener("waveatlas:audio-spectrum", onSpectrum);
    window.addEventListener("waveatlas:station-context", onStation);
    window.dispatchEvent(new Event("waveatlas:request-playback-context"));
    window.dispatchEvent(new Event("waveatlas:request-station-context"));

    return () => {
      delete root.dataset.waveatlasVisual;
      delete root.dataset.waveatlasPlayback;
      delete root.dataset.waveatlasAudioReactive;
      window.removeEventListener("waveatlas:playback-context", onPlayback);
      window.removeEventListener("waveatlas:audio-spectrum", onSpectrum);
      window.removeEventListener("waveatlas:station-context", onStation);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    let dock: HTMLElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    const syncDockHeight = () => {
      const next = document.querySelector<HTMLElement>(".waveatlas-mobile-dock > div");
      if (!next) return;
      if (dock !== next) {
        resizeObserver?.disconnect();
        dock = next;
        resizeObserver = new ResizeObserver(() => root.style.setProperty("--waveatlas-mobile-dock-height", `${Math.ceil(next.getBoundingClientRect().height)}px`));
        resizeObserver.observe(next);
      }
      root.style.setProperty("--waveatlas-mobile-dock-height", `${Math.ceil(next.getBoundingClientRect().height)}px`);
    };
    syncDockHeight();
    mutationObserver = new MutationObserver(syncDockHeight);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", syncDockHeight, { passive: true });
    window.visualViewport?.addEventListener("resize", syncDockHeight, { passive: true });
    return () => {
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", syncDockHeight);
      window.visualViewport?.removeEventListener("resize", syncDockHeight);
      root.style.removeProperty("--waveatlas-mobile-dock-height");
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "high-performance" });
    if (!gl) {
      document.documentElement.dataset.waveatlasGpu = "unavailable";
      return;
    }
    const program = createProgram(gl);
    if (!program) {
      document.documentElement.dataset.waveatlasGpu = "shader-failed";
      return;
    }
    document.documentElement.dataset.waveatlasGpu = "webgl";
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      resolution: gl.getUniformLocation(program, "u_resolution"),
      pointer: gl.getUniformLocation(program, "u_pointer"),
      globe: gl.getUniformLocation(program, "u_globe"),
      time: gl.getUniformLocation(program, "u_time"),
      energy: gl.getUniformLocation(program, "u_energy"),
      bass: gl.getUniformLocation(program, "u_bass"),
      mid: gl.getUniformLocation(program, "u_mid"),
      treble: gl.getUniformLocation(program, "u_treble"),
      stationImpulse: gl.getUniformLocation(program, "u_stationImpulse"),
      analysisAvailable: gl.getUniformLocation(program, "u_analysisAvailable"),
    };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let frame = 0;
    let pointerX = 0.5;
    let pointerY = 0.5;
    let smoothedEnergy = 0.18;
    let smoothedBass = 0;
    let smoothedMid = 0;
    let smoothedTreble = 0;
    const startedAt = performance.now();

    const resize = () => {
      width = Math.max(1, window.visualViewport?.width || window.innerWidth);
      height = Math.max(1, window.visualViewport?.height || window.innerHeight);
      dpr = Math.min(window.devicePixelRatio || 1, width < 768 ? 1.5 : 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    const onPointer = (event: PointerEvent) => {
      pointerX = event.clientX / width;
      pointerY = 1 - event.clientY / height;
    };

    const draw = (now: number) => {
      const runtime = runtimeRef.current;
      const playing = runtime.status === "playing";
      const buffering = runtime.status === "buffering";
      const fallbackEnergy = playing ? 0.62 : buffering ? 0.46 : 0.20;
      const targetEnergy = runtime.spectrumAvailable ? runtime.spectrum.energy : fallbackEnergy;
      smoothedEnergy += (targetEnergy - smoothedEnergy) * 0.10;
      smoothedBass += ((runtime.spectrumAvailable ? runtime.spectrum.bass : fallbackEnergy * 0.82) - smoothedBass) * 0.12;
      smoothedMid += ((runtime.spectrumAvailable ? runtime.spectrum.mid : fallbackEnergy * 0.58) - smoothedMid) * 0.10;
      smoothedTreble += ((runtime.spectrumAvailable ? runtime.spectrum.treble : fallbackEnergy * 0.38) - smoothedTreble) * 0.10;
      runtime.stationImpulse *= reducedMotion ? 0.78 : 0.955;

      const globe = document.querySelector<HTMLElement>(".waveatlas-globe-shell");
      const rect = globe?.getBoundingClientRect();
      const globeWidth = rect?.width || Math.min(width * 0.92, height * 0.64);
      const globeHeight = rect?.height || globeWidth;
      const globeX = rect ? rect.left + rect.width * 0.5 : width * 0.5;
      const globeY = rect ? height - (rect.top + rect.height * 0.5) : height * 0.53;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
      gl.uniform2f(uniforms.pointer, pointerX, pointerY);
      gl.uniform4f(uniforms.globe, globeX * dpr, globeY * dpr, globeWidth * dpr, globeHeight * dpr);
      gl.uniform1f(uniforms.time, (now - startedAt) / 1000);
      gl.uniform1f(uniforms.energy, smoothedEnergy);
      gl.uniform1f(uniforms.bass, smoothedBass);
      gl.uniform1f(uniforms.mid, smoothedMid);
      gl.uniform1f(uniforms.treble, smoothedTreble);
      gl.uniform1f(uniforms.stationImpulse, runtime.stationImpulse);
      gl.uniform1f(uniforms.analysisAvailable, runtime.spectrumAvailable ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      frame = window.requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.visualViewport?.addEventListener("resize", resize, { passive: true });
    frame = window.requestAnimationFrame(draw);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      window.visualViewport?.removeEventListener("resize", resize);
      if (buffer) gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      delete document.documentElement.dataset.waveatlasGpu;
    };
  }, []);

  return (
    <>
      <div className="atlas-visual-system" aria-hidden="true" data-status={status}>
        <div className="atlas-visual-system__mesh" />
        <div className="atlas-visual-system__aurora atlas-visual-system__aurora--one" />
        <div className="atlas-visual-system__aurora atlas-visual-system__aurora--two" />
        <div className="atlas-visual-system__grain" />
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        data-waveatlas-cinematic-runtime="v1"
        style={{ position: "fixed", inset: 0, zIndex: 32, width: "100vw", height: "100dvh", pointerEvents: "none", mixBlendMode: "screen", opacity: 0.92 }}
      />
    </>
  );
}
