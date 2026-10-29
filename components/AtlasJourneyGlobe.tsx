'use client';

import { useEffect, useRef } from 'react';
import { geoDistance, geoGraticule10, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { JourneyEarthSurface } from '@/lib/journey-earth-surface';
import { drawJourneyAircraft } from '@/lib/journey-aircraft';
import { RealisticEarth } from '@/lib/realistic-earth';
import countries from '@/lib/data/natural-earth-countries.json';
import { journeyPosition, journeyTrack, type JourneyRoute } from '@/lib/atlas-journey';
import type { AtlasTravelModeSession, AtlasTravelProfile } from '@/lib/atlas-travel-mode';
import { atlasTravelPresentation } from '@/lib/atlas-travel-presentation';

export type JourneyCamera = 'overview' | 'overhead' | 'trailing';

type RenderPoint = { lat: number; lng: number };

function routePoint(route: JourneyRoute, session: AtlasTravelModeSession | null, profile: AtlasTravelProfile, progress: number): RenderPoint {
  if (profile === 'flight' || !session?.points.length) return journeyPosition(route, progress);
  const index = Math.min(session.points.length - 1, Math.max(0, Math.round(progress * (session.points.length - 1))));
  const point = session.points[index];
  return { lat: point.lat, lng: point.lon };
}

function routeCoordinates(route: JourneyRoute, session: AtlasTravelModeSession | null, profile: AtlasTravelProfile, progress = 1) {
  if (profile === 'flight' || !session?.points.length) return journeyTrack(route, progress);
  const end = Math.max(1, Math.round(progress * (session.points.length - 1)) + 1);
  return session.points.slice(0, end).map((point) => [point.lon, point.lat] as [number, number]);
}

function drawGroundMarker(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, profile: Exclude<AtlasTravelProfile, 'flight'>) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  ctx.shadowColor = 'rgba(0,214,143,.75)';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = '#F7F5EF';
  ctx.fillStyle = '#00D68F';
  ctx.lineWidth = 1.5;
  if (profile === 'drive') {
    ctx.beginPath(); ctx.roundRect(-6, -10, 12, 20, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#08111D'; ctx.fillRect(-4, -6, 8, 5); ctx.fillRect(-4, 2, 8, 4);
  } else if (profile === 'bicycle') {
    ctx.beginPath(); ctx.arc(-6, 4, 4.5, 0, Math.PI * 2); ctx.arc(6, 4, 4.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(0, -3); ctx.lineTo(6, 4); ctx.lineTo(-1, 4); ctx.lineTo(-6, 4); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -7, 2.5, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = .35; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawCorridorSignals(
  ctx: CanvasRenderingContext2D,
  session: AtlasTravelModeSession | null,
  progress: number,
  projection: ReturnType<typeof geoOrthographic>,
  visible: (lng: number, lat: number) => boolean,
  time: number,
) {
  if (!session?.corridor.stations.length || !session.points.length) return;
  const routeIndex = Math.round(progress * Math.max(0, session.points.length - 1));
  const candidates = session.corridor.stations
    .filter((station) => Math.abs(station.routeIndex - routeIndex) <= Math.max(8, Math.round(session.points.length * .18)))
    .sort((a, b) => Math.abs(a.routeIndex - routeIndex) - Math.abs(b.routeIndex - routeIndex) || a.distanceKm - b.distanceKm)
    .slice(0, 18);
  const labelledAhead = candidates.filter((station) => station.routeIndex >= routeIndex).slice(0, 3);
  const labelledIds = new Set(labelledAhead.map((station) => station.id));
  for (const station of candidates) {
    if (!visible(station.lon, station.lat)) continue;
    const screen = projection([station.lon, station.lat]);
    if (!screen) continue;
    const delta = station.routeIndex - routeIndex;
    const current = Math.abs(delta) <= 1;
    const passed = delta < -1;
    const pulse = current ? 1 + Math.sin(time / 180) * .22 : 1;
    ctx.save();
    ctx.translate(screen[0], screen[1]);
    ctx.globalAlpha = passed ? .28 : current ? 1 : .72;
    if (current) {
      ctx.beginPath();
      ctx.arc(0, 0, 10 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(212,166,74,.42)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, current ? 4.8 : 3.6, 0, Math.PI * 2);
    ctx.fillStyle = current ? '#D4A64A' : passed ? '#8CA0AF' : '#00D68F';
    ctx.shadowColor = current ? 'rgba(212,166,74,.85)' : 'rgba(0,214,143,.65)';
    ctx.shadowBlur = current ? 14 : 8;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(247,245,239,.78)';
    ctx.lineWidth = .7;
    ctx.stroke();
    if (!passed && labelledIds.has(station.id)) {
      ctx.font = '600 9px system-ui';
      ctx.textBaseline = 'middle';
      const label = station.name.length > 22 ? `${station.name.slice(0, 21)}…` : station.name;
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(8,17,29,.9)';
      ctx.fillRect(8, -9, textWidth + 10, 18);
      ctx.fillStyle = '#F7F5EF';
      ctx.fillText(label, 13, 0);
    }
    ctx.restore();
  }
}

export default function AtlasJourneyGlobe({ route, progress, camera, running, rate, departureAt, flightSeconds, profile = 'flight', session = null }: { route: JourneyRoute; progress: number; camera: JourneyCamera; running: boolean; rate: number; departureAt: number; flightSeconds: number; profile?: AtlasTravelProfile; session?: AtlasTravelModeSession | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ route, progress, camera, running, rate, departureAt, flightSeconds, profile, session, updated: 0 });
  useEffect(() => { latest.current = { route, progress, camera, running, rate, departureAt, flightSeconds, profile, session, updated: performance.now() }; }, [route, progress, camera, running, rate, departureAt, flightSeconds, profile, session]);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ctx = element.getContext('2d');
    if (!ctx) return;
    let width = 0, height = 0, frame = 0, lastDraw = 0, drawn = '', lastTextureDraw = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const graticule = geoGraticule10();
    const earth = RealisticEarth.create(window.innerWidth < 768);
    const fallbackEarth = new JourneyEarthSurface(window.innerWidth < 768);
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
      const { route, camera, running, rate, updated, departureAt, flightSeconds, profile, session } = latest.current;
      const progress = Math.min(1, latest.current.progress + (running && !document.hidden ? Math.min(300, time - updated) * rate / 1000 : 0));
      const signature = [route.from.lat, route.from.lng, route.to.lat, route.to.lng, camera, profile, session?.source || '', session?.corridor.stations.length || 0, progress.toFixed(6), width, height, departureAt, flightSeconds].join('|');
      if (signature === drawn && time - lastTextureDraw < 1000) return;
      lastTextureDraw = time;
      drawn = signature;
      const position = routePoint(route, session, profile, progress);
      const ahead = routePoint(route, session, profile, Math.min(1, progress + 0.015));
      const midpoint = routePoint(route, session, profile, 0.5);
      const center = camera === 'overview' ? midpoint : position;
      const ground = profile !== 'flight';
      const radius = Math.min(width * 0.43, height * 0.43) * (camera === 'overhead' ? (ground ? 2.1 : 1.5) : camera === 'trailing' ? (ground ? 1.7 : 1.15) : 1);
      const rotation: [number, number, number] = [-center.lng + (camera === 'trailing' ? (ground ? 4 : 12) : 0), -center.lat + (camera === 'trailing' ? (ground ? -5 : -14) : 0), 0];
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
      const simulatedAt = departureAt + progress * flightSeconds * 1000;
      const surface = earth?.render({ rotX: -rotation[1] * Math.PI / 180, rotY: -rotation[0] * Math.PI / 180 }, radius * 2 * Math.min(window.devicePixelRatio || 1, 2), simulatedAt, time, reduced.matches) || fallbackEarth.render({ rotX: -rotation[1] * Math.PI / 180, rotY: -rotation[0] * Math.PI / 180 }, simulatedAt);
      element.dataset.earthRenderer = surface ? 'satellite-texture' : 'loading-geography';
      element.dataset.travelMode = profile;
      element.dataset.routeSource = session?.source || 'great-circle';
      element.dataset.corridorSignals = String(session?.corridor.stations.length || 0);
      if (surface) ctx.drawImage(surface, width / 2 - radius, height / 2 - radius, radius * 2, radius * 2);
      else { ctx.beginPath(); path(countries as GeoPermissibleObjects); ctx.fillStyle = '#326854'; ctx.fill(); }
      ctx.beginPath(); path(countries as GeoPermissibleObjects); ctx.strokeStyle = 'rgba(217,201,151,.18)'; ctx.lineWidth = 0.45; ctx.stroke();
      if (camera === 'overview') { ctx.beginPath(); path(graticule); ctx.strokeStyle = 'rgba(133,186,214,.09)'; ctx.lineWidth = 0.5; ctx.stroke(); }
      const fullCoordinates = routeCoordinates(route, session, profile, 1);
      const completedCoordinates = routeCoordinates(route, session, profile, progress);
      for (const [coordinates, color, dash, lineWidth] of [[fullCoordinates, 'rgba(212,166,74,.55)', [4, 5], ground ? 2 : 1.5], [completedCoordinates, '#00D68F', [], ground ? 3.4 : 2.8]] as const) {
        if (coordinates.length < 2) continue;
        ctx.beginPath(); path({ type: 'LineString', coordinates }); ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.setLineDash([...dash]); ctx.stroke();
      }
      ctx.setLineDash([]);
      const visible = (lng: number, lat: number) => geoDistance([lng, lat], [-rotation[0], -rotation[1]]) < Math.PI / 2;
      drawCorridorSignals(ctx, session, progress, projection, visible, time);
      for (const [place, label] of [[route.from, 'DEP'], [route.to, 'ARR']] as const) {
        const screen = projection([place.lng, place.lat]);
        if (!screen || !visible(place.lng, place.lat)) continue;
        ctx.beginPath(); ctx.arc(screen[0], screen[1], 4, 0, Math.PI * 2); ctx.fillStyle = '#D4A64A'; ctx.fill();
        ctx.font = 'bold 10px system-ui'; ctx.fillText(label, screen[0] + 8, screen[1] - 7);
      }
      const marker = projection([position.lng, position.lat]), next = projection([ahead.lng, ahead.lat]);
      if (marker && visible(position.lng, position.lat)) {
        const previousPoint = routePoint(route, session, profile, Math.max(0, progress - .015));
        const previous = projection([previousPoint.lng, previousPoint.lat]);
        const heading = progress < 1 && next ? Math.atan2(next[1] - marker[1], next[0] - marker[0]) + Math.PI / 2 : previous ? Math.atan2(marker[1] - previous[1], marker[0] - previous[0]) + Math.PI / 2 : 0;
        if (profile === 'flight') drawJourneyAircraft(ctx, marker[0], marker[1], heading, camera, progress);
        else drawGroundMarker(ctx, marker[0], marker[1], heading, profile);
      }
      ctx.restore();
    };
    frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); earth?.dispose(); fallbackEarth.dispose(); };
  }, []);
  const presentation = atlasTravelPresentation(profile);
  return <canvas ref={canvas} className="block h-[320px] w-full sm:h-[480px]" role="img" aria-label={`${presentation.simulatedLabel} from ${route.from.label} to ${route.to.label}, ${Math.round(progress * 100)} percent complete. ${session?.corridor.stations.length || 0} corridor signals mapped.`} />;
}
