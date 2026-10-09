type Vector = [number, number, number];
type Face = { vertices: Vector[]; shade?: string };
const faces: Face[] = [];
// A generic twin-engine jet. The fuselage is a tapered elliptic mesh, while
// the wing and tail surfaces have thickness and a raised vertical stabilizer.
const sections = [[-27, .2], [-24, 1.5], [-19, 3], [-10, 3.4], [8, 3.2], [17, 2.3], [24, .35]];
for (let i = 0; i < sections.length - 1; i++) {
  for (let side = 0; side < 12; side++) {
    const ring = (index: number, angle: number): Vector => [Math.cos(angle) * sections[index][1], sections[index][0], Math.sin(angle) * sections[index][1]];
    const a = side * Math.PI / 6, b = (side + 1) * Math.PI / 6;
    faces.push({ vertices: [ring(i, a), ring(i, b), ring(i + 1, b), ring(i + 1, a)] });
  }
}
for (const side of [-1, 1]) {
  const wing: Vector[] = [[side * 2, -8, 0], [side * 27, 7, .8], [side * 27, 11, 1], [side * 3, 7, 0]];
  faces.push({ vertices: wing }, { vertices: wing.map(([x, y, z]) => [x, y, z - .8]), shade: '#748294' });
  faces.push({ vertices: [[side * 2, 16, 1], [side * 11, 23, 2], [side * 11, 25, 2], [side * 1, 22, 1]] });
  faces.push({ vertices: [[side * 27, 7, .8], [side * 27, 11, 1], [side * 28, 10, 5], [side * 28, 8, 5]] });
  for (let segment = 0; segment < 8; segment++) {
    const point = (y: number, angle: number): Vector => [side * 10 + Math.cos(angle) * 1.6, y, -2.3 + Math.sin(angle) * 1.6];
    const a = segment * Math.PI / 4, b = (segment + 1) * Math.PI / 4;
    faces.push({ vertices: [point(-3, a), point(-3, b), point(6, b), point(6, a)], shade: '#a0acb8' });
    faces.push({ vertices: [point(-3, a), point(-3, b), [side * 10, -3.1, -2.3]], shade: '#172331' });
  }
}
faces.push({ vertices: [[0, 13, 2], [0, 22, 12], [0, 25, 11], [0, 24, 1]], shade: '#D4A64A' });
faces.push({ vertices: [[-1.9, -20, 1.5], [1.9, -20, 1.5], [1.7, -17, 2.8], [-1.7, -17, 2.8]], shade: '#20344a' });

export function drawJourneyAircraft(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number, view: 'overview' | 'overhead' | 'trailing', progress: number) {
  const pitch = view === 'trailing' ? .95 : view === 'overhead' ? .28 : .12;
  const scale = view === 'overview' ? .65 : view === 'overhead' ? 1.7 : 2.25;
  const altitude = Math.min(1, progress / .08, (1 - progress) / .08);
  const climb = progress < .08 ? .06 : progress > .92 ? -.05 : 0;
  const transform = ([vx, vy, vz]: Vector): Vector => {
    const py = vy * Math.cos(pitch + climb) + vz * Math.sin(pitch + climb);
    const pz = vz * Math.cos(pitch + climb) - vy * Math.sin(pitch + climb);
    return [vx * Math.cos(heading) - py * Math.sin(heading), vx * Math.sin(heading) + py * Math.cos(heading), pz];
  };
  const polygons = faces.map(face => ({ ...face, points: face.vertices.map(transform) }));
  polygons.sort((a, b) => a.points.reduce((sum, p) => sum + p[2], 0) / a.points.length - b.points.reduce((sum, p) => sum + p[2], 0) / b.points.length);
  ctx.save(); ctx.translate(x, y - altitude * (view === 'trailing' ? 18 : 4)); ctx.scale(scale, scale);
  if (altitude > .1) {
    ctx.save(); ctx.rotate(heading); ctx.strokeStyle = 'rgba(238,245,255,.30)'; ctx.lineWidth = 1;
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 10, 7); ctx.lineTo(side * 10, 55); ctx.stroke(); }
    ctx.restore();
  }
  for (const polygon of polygons) {
    const [a, b, c] = polygon.points;
    const u = b.map((n, i) => n - a[i]), v = c.map((n, i) => n - a[i]);
    const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...normal) || 1;
    const light = Math.min(1, .55 + .45 * Math.abs((normal[0] * -.4 + normal[1] * -.5 + normal[2] * .75) / length));
    const grey = Math.round(245 * light);
    ctx.fillStyle = polygon.shade || `rgb(${grey - 8},${grey - 3},${grey})`;
    ctx.beginPath(); polygon.points.forEach(([px, py, pz], i) => { const perspective = 220 / (220 - pz); if (i === 0) ctx.moveTo(px * perspective, py * perspective); else ctx.lineTo(px * perspective, py * perspective); }); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
