'use client';

import { useEffect, useRef } from 'react';
import { geoDistance, geoGraticule10, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import countries from '@/lib/data/natural-earth-countries.json';
import { journeyPosition, journeyTrack, type JourneyRoute } from '@/lib/atlas-journey';

export type JourneyCamera = 'overview' | 'overhead' | 'trailing';
export default function AtlasJourneyGlobe({ route, progress, camera, running, rate }: { route: JourneyRoute; progress: number; camera: JourneyCamera; running: boolean; rate: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ route, progress, camera, running, rate, updated: 0 });
  useEffect(() => { latest.current = { route, progress, camera, running, rate, updated: performance.now() }; }, [route, progress, camera, running, rate]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    let width = 0, height = 0, frame = 0, lastDraw = 0, drawn = '';
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const graticule = geoGraticule10();
    const resize = () => {
      const rect = element.getBoundingClientRect(); width = rect.width; height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(width * dpr); element.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); lastDraw = 0; drawn = '';
    };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const render = (time: number) => {
      frame = requestAnimationFrame(render);
      if (document.hidden || !width || time - lastDraw < (reduced.matches ? 250 : 50)) return;
      lastDraw = time;
      const { route, camera, running, rate, updated } = latest.current;
      const progress = Math.min(1, latest.current.progress + (running && !document.hidden ? Math.min(300, time - updated) * rate / 1000 : 0));
      const signature = [route.from.lat, route.from.lng, route.to.lat, route.to.lng, camera, progress.toFixed(6), width, height].join('|');
      if (signature === drawn) return;
      drawn = signature;
      const position = journeyPosition(route, progress), ahead = journeyPosition(route, Math.min(1, progress + 0.015)), midpoint = journeyPosition(route, 0.5);
      const center = camera === 'overview' ? midpoint : position;
      const radius = Math.min(width * 0.43, height * 0.43) * (camera === 'overhead' ? 1.5 : camera === 'trailing' ? 1.15 : 1);
      const rotation: [number, number, number] = [-center.lng + (camera === 'trailing' ? 12 : 0), -center.lat + (camera === 'trailing' ? -14 : 0), 0];
      const projection = geoOrthographic().translate([width / 2, height / 2]).scale(radius).rotate(rotation).clipAngle(90);
      const path = geoPath(projection, ctx);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#050d18'; ctx.fillRect(0, 0, width, height);
      for (let i = 0; i < 65; i++) { ctx.fillStyle = `rgba(247,245,239,${0.15 + (i % 4) * 0.12})`; ctx.fillRect((i * 137.51) % width, (i * 97.17) % height, i % 5 === 0 ? 2 : 1, 1); }
      const atmosphere = ctx.createRadialGradient(width / 2, height / 2, radius * 0.8, width / 2, height / 2, radius * 1.09);
      atmosphere.addColorStop(0, 'rgba(30,130,180,0)'); atmosphere.addColorStop(0.85, 'rgba(70,160,210,.18)'); atmosphere.addColorStop(1, 'rgba(40,100,180,0)');
      ctx.fillStyle = atmosphere; ctx.beginPath(); ctx.arc(width / 2, height / 2, radius * 1.09, 0, Math.PI * 2); ctx.fill();
      const ocean = ctx.createLinearGradient(width / 2 - radius, height / 2 - radius, width / 2 + radius, height / 2 + radius);
      ocean.addColorStop(0, '#155f7a'); ocean.addColorStop(0.5, '#0a334e'); ocean.addColorStop(1, '#031020');
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.fillStyle = ocean; ctx.fill();
      ctx.save(); ctx.beginPath(); path({ type: 'Sphere' }); ctx.clip();
      ctx.beginPath(); path(countries as GeoPermissibleObjects); ctx.fillStyle = '#326854'; ctx.fill(); ctx.strokeStyle = 'rgba(217,201,151,.3)'; ctx.lineWidth = 0.55; ctx.stroke();
      ctx.beginPath(); path(graticule); ctx.strokeStyle = 'rgba(133,186,214,.17)'; ctx.lineWidth = 0.6; ctx.stroke();
      const shade = ctx.createRadialGradient(width / 2 - radius * 0.35, height / 2 - radius * 0.45, radius * 0.15, width / 2 + radius * 0.3, height / 2 + radius * 0.3, radius * 1.3);
      shade.addColorStop(0, 'rgba(255,243,190,.12)'); shade.addColorStop(1, 'rgba(0,0,10,.78)'); ctx.fillStyle = shade; ctx.fillRect(0, 0, width, height);
      for (const [end, color, dash] of [[1, 'rgba(212,166,74,.55)', [4, 5]], [progress, '#00D68F', []]] as const) {
        ctx.beginPath(); path({ type: 'LineString', coordinates: journeyTrack(route, end) }); ctx.strokeStyle = color; ctx.lineWidth = end === 1 ? 1.5 : 2.8; ctx.setLineDash([...dash]); ctx.stroke();
      }
      ctx.setLineDash([]);
      const visible = (lng: number, lat: number) => geoDistance([lng, lat], [-rotation[0], -rotation[1]]) < Math.PI / 2;
      for (const [place, label] of [[route.from, 'DEP'], [route.to, 'ARR']] as const) {
        const screen = projection([place.lng, place.lat]);
        if (!screen || !visible(place.lng, place.lat)) continue;
        ctx.beginPath(); ctx.arc(screen[0], screen[1], 4, 0, Math.PI * 2); ctx.fillStyle = '#D4A64A'; ctx.fill();
        ctx.font = 'bold 10px system-ui'; ctx.fillText(label, screen[0] + 8, screen[1] - 7);
      }
      const plane = projection([position.lng, position.lat]), next = projection([ahead.lng, ahead.lat]);
      if (plane && visible(position.lng, position.lat)) {
        const heading = next && progress < 1 ? Math.atan2(next[1] - plane[1], next[0] - plane[0]) + Math.PI / 2 : 0;
        ctx.save(); ctx.translate(plane[0], plane[1]); ctx.rotate(heading);
        ctx.shadowColor = '#D4A64A'; ctx.shadowBlur = 16; ctx.fillStyle = '#F7F5EF'; ctx.strokeStyle = '#D4A64A'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, -19); ctx.lineTo(3, -5); ctx.lineTo(18, 4); ctx.lineTo(18, 8); ctx.lineTo(3, 4); ctx.lineTo(3, 12); ctx.lineTo(8, 17); ctx.lineTo(8, 19); ctx.lineTo(0, 16); ctx.lineTo(-8, 19); ctx.lineTo(-8, 17); ctx.lineTo(-3, 12); ctx.lineTo(-3, 4); ctx.lineTo(-18, 8); ctx.lineTo(-18, 4); ctx.lineTo(-3, -5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    };
    frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);
  return <canvas ref={canvas} className="block h-[320px] w-full sm:h-[480px]" role="img" aria-label={`Simulated flight from ${route.from.label} to ${route.to.label}, ${Math.round(progress * 100)} percent complete`} />;
}
