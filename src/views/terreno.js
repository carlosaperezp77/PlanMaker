// Vistas de un terreno: planta con linderos, curvas de nivel y
// construcciones; cuadro de coordenadas; perfiles longitudinal y transversal.

import { fmt, polygonArea, bbox, azimuth, bearing } from '../util.js';

function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Interpolación de cotas por distancia inversa (IDW). */
export function heightField(m) {
  const samples = [...m.vertices, ...m.spots];
  return (x, y) => {
    let num = 0, den = 0;
    for (const s of samples) {
      const d2 = (x - s.x) ** 2 + (y - s.y) ** 2;
      if (d2 < 1e-12) return s.z;
      const w = 1 / d2;
      num += w * s.z;
      den += w;
    }
    return num / den;
  };
}

function niceStep(range, target) {
  const raw = range / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const f of [1, 2, 2.5, 5, 10]) if (f * pow >= raw) return f * pow;
  return 10 * pow;
}

/** Curvas de nivel por "marching squares" sobre una malla, recortadas al lote. */
export function contours(m, interval) {
  const pts = m.vertices.map((v) => [v.x, v.y]);
  const b = bbox(pts);
  const h = heightField(m);
  const n = 70;
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY) / n;
  const nx = Math.ceil((b.maxX - b.minX) / size) + 1;
  const ny = Math.ceil((b.maxY - b.minY) / size) + 1;
  const grid = [];
  for (let j = 0; j < ny; j++) {
    const row = [];
    for (let i = 0; i < nx; i++) row.push(h(b.minX + i * size, b.minY + j * size));
    grid.push(row);
  }
  const zs = [...m.vertices, ...m.spots].map((v) => v.z);
  const zmin = Math.min(...zs), zmax = Math.max(...zs);
  const levels = [];
  for (let z = Math.ceil(zmin / interval) * interval; z <= zmax + 1e-9; z += interval) levels.push(Math.round(z * 1000) / 1000);
  const out = [];
  for (const z of levels) {
    const segs = [];
    for (let j = 0; j + 1 < ny; j++) {
      for (let i = 0; i + 1 < nx; i++) {
        const x0 = b.minX + i * size, y0 = b.minY + j * size;
        const c = [
          [x0, y0, grid[j][i]], [x0 + size, y0, grid[j][i + 1]],
          [x0 + size, y0 + size, grid[j + 1][i + 1]], [x0, y0 + size, grid[j + 1][i]],
        ];
        const cross = [];
        for (let k = 0; k < 4; k++) {
          const a = c[k], bb = c[(k + 1) % 4];
          if ((a[2] < z) !== (bb[2] < z)) {
            const tt = (z - a[2]) / (bb[2] - a[2]);
            cross.push([a[0] + (bb[0] - a[0]) * tt, a[1] + (bb[1] - a[1]) * tt]);
          }
        }
        for (let k = 0; k + 1 < cross.length; k += 2) {
          const [p, q] = [cross[k], cross[k + 1]];
          if (pointInPolygon((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, pts)) segs.push([p, q]);
        }
      }
    }
    if (segs.length) out.push({ z, segs });
  }
  return out;
}

function planView(m) {
  const pts = m.vertices.map((v) => [v.x, v.y]);
  const b = bbox(pts);
  const ccw = polygonArea(pts) > 0;
  const zs = [...m.vertices, ...m.spots].map((v) => v.z);
  const relief = Math.max(...zs) - Math.min(...zs);
  const interval = m.curvas ?? (relief > 1e-6 ? niceStep(relief, 8) : null);
  const curves = interval ? contours(m, interval) : [];
  return {
    title: 'Planta del terreno',
    kind: 'ortho',
    pad: 18,
    bounds: { minU: b.minX, maxU: b.maxX, minV: b.minY, maxV: b.maxY },
    interval,
    draw(p) {
      p.poly(pts, 'lot');
      for (const { z, segs } of curves) {
        const major = Math.abs(z / (interval * 5) - Math.round(z / (interval * 5))) < 1e-6;
        const d = segs.map(([a, c]) => `M${p.P(a)}L${p.P(c)}`).join('');
        p.raw(`<path class="${major ? 'contour5' : 'contour'}" d="${d}"/>`);
        const mid = segs[Math.floor(segs.length / 2)][0];
        p.text(mid[0], mid[1], fmt(z), { size: 1.7, cls: 'muted' });
      }
      p.poly(pts, 'thick');
      for (const c of m.construcciones) {
        p.rect(c.x, c.y, c.w, c.d, 'build');
        p.text(c.x + c.w / 2, c.y + c.d / 2, c.nombre.toUpperCase(), { size: 2.2, weight: '600', dy: -1.4 });
        p.text(c.x + c.w / 2, c.y + c.d / 2, `${fmt(c.w)} × ${fmt(c.d)}`, { size: 1.8, dy: 1.6, cls: 'muted' });
      }
      // Longitud de cada lindero, por fuera del lote.
      pts.forEach((a, i) => {
        const c = pts[(i + 1) % pts.length];
        p.dim(a, c, ccw ? -5 : 5, fmt(Math.hypot(c[0] - a[0], c[1] - a[1])));
      });
      // Vértices con cota.
      const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
      m.vertices.forEach((v, i) => {
        p.circle(v.x, v.y, 0.6 / p.k, 'vis');
        const dx = v.x >= cx ? 3 : -3, dy = v.y >= cy ? -3 : 3;
        p.text(v.x, v.y, `P${i + 1}`, { size: 2.4, weight: '700', dx, dy, anchor: dx > 0 ? 'start' : 'end' });
        p.text(v.x, v.y, `+${fmt(v.z)}`, { size: 1.9, dx, dy: dy + 2.6, anchor: dx > 0 ? 'start' : 'end', cls: 'dimtxt' });
      });
      for (const s of m.spots) {
        p.text(s.x, s.y, '×', { size: 2.4 });
        p.text(s.x, s.y, `+${fmt(s.z)}`, { size: 1.8, dx: 1.5, dy: -1.5, anchor: 'start', cls: 'dimtxt' });
      }
      // Área en el centroide aproximado (o centro si cae fuera).
      const area = Math.abs(polygonArea(pts));
      let [ax, ay] = [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
      if (!pointInPolygon(ax, ay, pts)) [ax, ay] = [cx, cy];
      if (!m.construcciones.some((c) => ax > c.x && ax < c.x + c.w && ay > c.y && ay < c.y + c.d)) {
        p.text(ax, ay, `ÁREA ${fmt(area)} m²`, { size: 2.8, weight: '700' });
      }
      const nx = p.X(b.maxX) + 8, ny = p.Y(b.maxY);
      p.raw(`<g transform="translate(${nx.toFixed(2)},${ny.toFixed(2)})"><polygon class="dimfill" points="0,-4 2,3 0,1.6 -2,3"/><text x="0" y="-6" font-size="2.6" text-anchor="middle" font-weight="700">N</text></g>`);
    },
  };
}

function tableView(m) {
  const rows = m.vertices.map((v, i) => {
    const n = m.vertices[(i + 1) % m.vertices.length];
    const dx = n.x - v.x, dy = n.y - v.y;
    return [`P${i + 1}`, fmt(v.x, 3), fmt(v.y, 3), fmt(v.z, 2), `P${i + 1}–P${((i + 1) % m.vertices.length) + 1}`, fmt(Math.hypot(dx, dy), 3), bearing(azimuth(dx, dy))];
  });
  const head = ['Punto', 'X (E)', 'Y (N)', 'Cota', 'Lado', 'Dist. (m)', 'Rumbo'];
  const widths = [14, 20, 20, 16, 20, 20, 30];
  const rh = 6;
  const W = widths.reduce((a, b) => a + b, 0);
  const H = rh * (rows.length + 1);
  const pts = m.vertices.map((v) => [v.x, v.y]);
  const per = pts.reduce((s, a, i) => s + Math.hypot(pts[(i + 1) % pts.length][0] - a[0], pts[(i + 1) % pts.length][1] - a[1]), 0);
  return {
    title: 'Cuadro de coordenadas',
    subtitle: `Perímetro ${fmt(per)} m · Área ${fmt(Math.abs(polygonArea(pts)))} m²`,
    kind: 'free',
    pad: 4,
    maxK: 1,
    bounds: { minU: 0, maxU: W, minV: 0, maxV: H },
    draw(p) {
      const s = p.k; // la tabla escala con su celda
      p.rect(0, H - rh, W, rh, 'build');
      p.rect(0, 0, W, H, 'vis');
      let x = 0;
      widths.forEach((w, i) => {
        if (i) p.line(x, 0, x, H, 'thin');
        p.text(x + w / 2, H - rh / 2, head[i], { size: 2.2 * s, weight: '700' });
        rows.forEach((r, j) => p.text(x + w / 2, H - rh * (j + 1.5), r[i], { size: 2.1 * s }));
        x += w;
      });
      for (let j = 1; j <= rows.length; j++) p.line(0, H - rh * j, W, H - rh * j, 'thin');
    },
  };
}

function profileView(m, axis) {
  const pts = m.vertices.map((v) => [v.x, v.y]);
  const b = bbox(pts);
  const h = heightField(m);
  const along = axis === 'x';
  const fixed = along ? (b.minY + b.maxY) / 2 : (b.minX + b.maxX) / 2;
  const [s0, s1] = along ? [b.minX, b.maxX] : [b.minY, b.maxY];
  const N = 120;
  const samples = [];
  for (let i = 0; i <= N; i++) {
    const s = s0 + ((s1 - s0) * i) / N;
    const [x, y] = along ? [s, fixed] : [fixed, s];
    if (pointInPolygon(x, y, pts) || i === 0 || i === N) samples.push([s, h(x, y), pointInPolygon(x, y, pts)]);
  }
  const ins = samples.filter((q) => q[2]);
  const used = ins.length > 1 ? ins : samples;
  const zs = used.map((q) => q[1]);
  const zmin = Math.min(...zs), zmax = Math.max(...zs);
  const len = used[used.length - 1][0] - used[0][0];
  // Exageración vertical para que el relieve se lea.
  const relief = zmax - zmin;
  const ex = relief < 1e-6 ? 1 : Math.max(1, Math.min(10, Math.round((len * 0.15) / relief)));
  const datum = Math.floor((zmin - Math.max(0.5, relief * 0.3)) * 2) / 2;
  const V = (z) => (z - datum) * ex;
  const step = niceStep(len, 6);
  const BUILD_H = 2.5;
  // Construcciones cortadas por el perfil.
  const builds = m.construcciones.map((c) => {
    const [c0, c1] = along ? [c.x, c.x + c.w] : [c.y, c.y + c.d];
    const [f0, f1] = along ? [c.y, c.y + c.d] : [c.x, c.x + c.w];
    if (fixed < f0 || fixed > f1) return null;
    const at = (s) => h(...(along ? [s, fixed] : [fixed, s]));
    return { c, c0, c1, zc: Math.max(at(c0), at(c1)) };
  }).filter(Boolean);
  const top = Math.max(V(zmax) + 0.5, ...builds.map((b) => V(b.zc + BUILD_H)));
  const name = along ? 'Perfil longitudinal A-A (oeste–este)' : 'Perfil transversal B-B (sur–norte)';
  return {
    title: name,
    subtitle: ex > 1 ? `Exageración vertical ×${ex}` : 'Sin exageración vertical',
    kind: 'free',
    pad: 14,
    bounds: { minU: used[0][0], maxU: used[used.length - 1][0], minV: 0, maxV: top },
    draw(p) {
      const ground = used.map(([s, z]) => [s, V(z)]);
      p.poly([[used[0][0], 0], ...ground, [used[used.length - 1][0], 0]], 'groundfill');
      p.poly(ground, 'ground', false);
      p.line(used[0][0], 0, used[used.length - 1][0], 0, 'thin');
      p.text(used[0][0], 0, `Ref. +${fmt(datum)}`, { size: 1.9, anchor: 'end', dx: -2, cls: 'muted' });
      // Estaciones (abscisas) desde el inicio del perfil.
      const start = used[0][0], end = used[used.length - 1][0];
      for (let d = 0; start + d <= end + 1e-9; d += step) {
        const s = start + d;
        const [x, y] = along ? [s, fixed] : [fixed, s];
        const z = h(x, y);
        p.line(s, 0, s, V(z), 'thin');
        p.text(s, 0, fmt(d), { size: 1.9, dy: 3, cls: 'muted' });
        p.text(s, V(z), `+${fmt(z)}`, { size: 1.9, dy: -2.5, cls: 'dimtxt' });
      }
      for (const { c, c0, c1, zc } of builds) {
        p.rect(c0, V(zc), c1 - c0, BUILD_H * ex, 'build');
        p.text((c0 + c1) / 2, V(zc) + (BUILD_H * ex) / 2, c.nombre.toUpperCase(), { size: 1.8 });
      }
    },
  };
}

export function terrenoViews(m) {
  return [planView(m), tableView(m), profileView(m, 'x'), profileView(m, 'y')];
}

export function terrenoNotes(m, views) {
  const pts = m.vertices.map((v) => [v.x, v.y]);
  const zs = [...m.vertices, ...m.spots].map((v) => v.z);
  const notes = [`Coordenadas y distancias en m. Rumbos referidos al norte de la cuadrícula.`];
  notes.push(`Área ${fmt(Math.abs(polygonArea(pts)))} m² · ${m.vertices.length} vértices.`);
  if (m.cierre) notes.push(`Lado de cierre P${m.vertices.length}–P1 calculado: ${fmt(m.cierre.dist)} m, ${bearing(m.cierre.az)}.`);
  if (views[0].interval) notes.push(`Curvas de nivel cada ${fmt(views[0].interval)} m (desnivel ${fmt(Math.max(...zs) - Math.min(...zs))} m).`);
  return notes;
}
