"use client";

import { useEffect, useRef, type RefObject } from 'react';
import { createParticleSeeds, particleBudget, spectrumBands, updateParticles, type AtlasParticleState, type AtlasSpectrum } from '@/lib/atlas-particles';

type Props = { state: AtlasParticleState; analyserRef: RefObject<AnalyserNode | null>; onPress: () => void };
type Renderer = { draw: (points: Float32Array, size: number, dpr: number) => void; dispose: () => void };

function gpuRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
  if (!gl) return null;
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram(), buffer = gl.createBuffer();
  if (!program || !buffer) return null;
  const dispose = () => { gl.deleteBuffer(buffer); gl.deleteProgram(program); shaders.forEach(shader => gl.deleteShader(shader)); };
  try {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type); if (!shader) throw new Error('Shader unavailable');
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader unsupported');
      gl.attachShader(program, shader);
    };
    compile(gl.VERTEX_SHADER, 'attribute vec3 position; attribute vec4 color; attribute float radius; uniform float dpr; varying vec4 tint; void main(){gl_Position=vec4(position.xy,0.,1.); gl_PointSize=radius*2.8*dpr; tint=color;}');
    compile(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec4 tint; void main(){float r=length(gl_PointCoord-vec2(.5))*2.; if(r>1.) discard; gl_FragColor=vec4(tint.rgb,tint.a*(1.-smoothstep(.25,1.,r)));}');
    gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('GPU unsupported');
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    for (const [name, length, offset] of [['position', 3, 0], ['color', 4, 12], ['radius', 1, 28]] as const) {
      const attribute = gl.getAttribLocation(program, name);
      if (attribute < 0) continue;
      gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, length, gl.FLOAT, false, 32, offset);
    }
    const dprUniform = gl.getUniformLocation(program, 'dpr');
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.clearColor(0, 0, 0, 0);
    return { draw(points, size, dpr) {
      if (gl.isContextLost()) return;
      const pixels = Math.round(size * dpr);
      if (canvas.width !== pixels) { canvas.width = pixels; canvas.height = pixels; }
      gl.viewport(0, 0, pixels, pixels); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(dprUniform, dpr); gl.bufferData(gl.ARRAY_BUFFER, points, gl.DYNAMIC_DRAW); gl.drawArrays(gl.POINTS, 0, points.length / 8);
    }, dispose };
  } catch { dispose(); return null; }
}

function canvasRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const context = canvas.getContext('2d'); if (!context) return null;
  return { draw(points, size, dpr) {
    const pixels = Math.round(size * dpr);
    if (canvas.width !== pixels) { canvas.width = pixels; canvas.height = pixels; }
    context.setTransform(dpr, 0, 0, dpr, 0, 0); context.clearRect(0, 0, size, size);
    for (let i = 0; i < points.length; i += 8) {
      context.fillStyle = `rgba(${Math.round(points[i + 3] * 255)},${Math.round(points[i + 4] * 255)},${Math.round(points[i + 5] * 255)},${points[i + 6]})`;
      context.beginPath(); context.arc((points[i] + 1) * size / 2, (1 - points[i + 1]) * size / 2, points[i + 7], 0, Math.PI * 2); context.fill();
    }
  }, dispose() { context.clearRect(0, 0, canvas.width, canvas.height); } };
}

export function AtlasParticleGlobe({ state, analyserRef, onPress }: Props) {
  const rootRef = useRef<HTMLButtonElement>(null), gpuRef = useRef<HTMLCanvasElement>(null), fallbackRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; rootRef.current?.dispatchEvent(new Event('atlas:particle-state')); }, [state]);
  useEffect(() => {
    const root = rootRef.current, gpu = gpuRef.current, fallback = fallbackRef.current;
    if (!root || !gpu || !fallback) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motion.matches;
    let renderer = gpuRenderer(gpu);
    gpu.hidden = !renderer; fallback.hidden = Boolean(renderer);
    renderer ||= canvasRenderer(fallback);
    if (!renderer) return;
    let seeds = createParticleSeeds(particleBudget(window.innerWidth, navigator.hardwareConcurrency, reduced));
    let points = new Float32Array(seeds.length / 3 * 8);
    let spectrum: AtlasSpectrum = { bass: 0, mids: 0, treble: 0 }, samples = new Uint8Array(0);
    let lastAnalyser: AnalyserNode | null = null, raf = 0, visible = true, last = 0, elapsed = 0, previous = 0;
    let size = root.getBoundingClientRect().width;
    const draw = (now: number, force = false) => {
      const cap = window.innerWidth < 640 ? 1000 / 30 : 1000 / 45;
      if (!force && now - last < cap) return;
      const delta = previous ? Math.min(.1, (now - previous) / 1000) : .03;
      previous = now; last = now; if (!reduced) elapsed += delta;
      const analyser = analyserRef.current;
      if (analyser !== lastAnalyser) { lastAnalyser = analyser; samples = new Uint8Array(analyser?.frequencyBinCount || 0); }
      const target = { bass: 0, mids: 0, treble: 0 };
      if (analyser && analyser.context.state === 'running') {
        analyser.getByteFrequencyData(samples); Object.assign(target, spectrumBands(samples, analyser.context.sampleRate, analyser.fftSize));
      }
      const blend = 1 - Math.exp(-delta * 12);
      spectrum = { bass: spectrum.bass + (target.bass - spectrum.bass) * blend, mids: spectrum.mids + (target.mids - spectrum.mids) * blend, treble: spectrum.treble + (target.treble - spectrum.treble) * blend };
      updateParticles(seeds, points, elapsed, stateRef.current, spectrum, reduced);
      renderer?.draw(points, size, Math.min(window.devicePixelRatio || 1, 2));
      root.style.setProperty('--atlas-glow', String(.16 + spectrum.bass * .3));
    };
    const frame = (now: number) => { raf = 0; if (document.hidden || !visible || reduced) return; draw(now); raf = window.requestAnimationFrame(frame); };
    const restart = () => {
      window.cancelAnimationFrame(raf); raf = 0; previous = 0;
      if (document.hidden || !visible) return;
      draw(performance.now(), true); if (!reduced) raf = window.requestAnimationFrame(frame);
    };
    const changeMotion = () => { reduced = motion.matches; seeds = createParticleSeeds(particleBudget(window.innerWidth, navigator.hardwareConcurrency, reduced)); points = new Float32Array(seeds.length / 3 * 8); restart(); };
    const resize = new ResizeObserver(() => {
      size = root.getBoundingClientRect().width;
      const budget = particleBudget(window.innerWidth, navigator.hardwareConcurrency, reduced);
      if (seeds.length !== budget * 3) { seeds = createParticleSeeds(budget); points = new Float32Array(budget * 8); }
      restart();
    }); resize.observe(root);
    const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? true; restart(); }); observer.observe(root);
    const lost = (event: Event) => {
      event.preventDefault(); renderer?.dispose(); renderer = canvasRenderer(fallback); gpu.hidden = true; fallback.hidden = false; restart();
    };
    gpu.addEventListener('webglcontextlost', lost);
    motion.addEventListener('change', changeMotion); document.addEventListener('visibilitychange', restart); root.addEventListener('atlas:particle-state', restart);
    restart();
    return () => { window.cancelAnimationFrame(raf); resize.disconnect(); observer.disconnect(); motion.removeEventListener('change', changeMotion); document.removeEventListener('visibilitychange', restart); root.removeEventListener('atlas:particle-state', restart); gpu.removeEventListener('webglcontextlost', lost); renderer?.dispose(); };
  }, [analyserRef]);

  return <button ref={rootRef} type="button" onClick={onPress} data-atlas-particles={state} aria-label={state === 'speaking' ? 'Interrupt Atlas and listen' : state === 'listening' ? 'End Atlas conversation' : 'Atlas voice signal'} className="atlas-signal relative grid size-[min(72vw,18rem)] shrink-0 place-items-center rounded-full transition-transform active:scale-[.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D4A64A] sm:size-[21rem]">
    <span aria-hidden="true" className="pointer-events-none absolute inset-[8%] rounded-full" style={{ background: 'radial-gradient(circle,rgba(0,214,143,.06),rgba(78,199,194,.025) 55%,transparent 72%)', boxShadow: '0 0 65px rgba(78,199,194,var(--atlas-glow,.16))' }}/>
    <canvas ref={gpuRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full"/>
    <canvas ref={fallbackRef} hidden aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full"/>
    <span className="sr-only" role="status" aria-live="polite">Atlas is {state === 'live' ? 'ready' : state}</span>
  </button>;
}
