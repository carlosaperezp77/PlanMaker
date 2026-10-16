// Vistas de una pieza mecánica: alzado, lateral izquierda, planta e
// isométrica, dispuestas en primer diedro (sistema europeo, ISO E).

import { fmt, convexHull } from '../util.js';

const C30 = Math.cos(Math.PI / 6);

function extents(m) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const s of m.solids) {
    const [x0, x1, y0, y1] = s.tipo === 'bloque' ? [s.x, s.x + s.w, s.y, s.y + s.d] : [s.x - s.r, s.x + s.r, s.y - s.r, s.y + s.r];
    minX = Math.min(minX, x0); maxX = Math.max(maxX, x1);
    minY = Math.min(minY, y0); maxY = Math.max(maxY, y1);
    minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z + s.h);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

const uniq = (arr) => [...new Set(arr.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);

/** Proyección genérica alzado/lateral: (u del sólido, ancho) según el eje. */
function sideView(m, e, { title, horiz }) {
  // horiz(s) → [u0, u1] del sólido; horizCut(c) → [u0, u1] del corte.
  const [bu0, bu1] = horiz.bounds(e);
  const nSteps = uniq(m.solids.map((s) => s.z + s.h)).length;
  const nCyl = m.solids.filter((s) => s.tipo === 'cilindro').length;
  return {
    title,
    kind: 'ortho',
    pad: 14 + 6 * Math.max(nSteps, nCyl),
    bounds: { minU: bu0, maxU: bu1, minV: e.minZ, maxV: e.maxZ },
    draw(p) {
      const solids = m.solids.slice().sort((a, b) => horiz.depth(b) - horiz.depth(a));
      for (const s of solids) {
        const [u0, u1] = horiz.solid(s);
        p.rect(u0, s.z, u1 - u0, s.h, 'solid');
      }
      for (const c of m.cuts) {
        const [u0, u1] = horiz.cut(c);
        p.rect(u0, c.z0, u1 - u0, c.z1 - c.z0, 'hid');
        if (c.tipo === 'agujero') p.axis((u0 + u1) / 2, c.z0, (u0 + u1) / 2, c.z1);
      }
      for (const s of m.solids) {
        if (s.tipo !== 'cilindro') continue;
        const [u0, u1] = horiz.solid(s);
        p.axis((u0 + u1) / 2, s.z, (u0 + u1) / 2, s.z + s.h);
      }
      // Cotas: ancho total abajo, alto total a la izquierda, escalones a la derecha.
      p.dimH(bu0, bu1, e.minZ, 8, fmt(bu1 - bu0), 'arrow');
      p.dimV(e.minZ, e.maxZ, bu0, -9, fmt(e.maxZ - e.minZ), 'arrow');
      const steps = uniq(m.solids.map((s) => s.z + s.h)).filter((z) => z < e.maxZ - 1e-6 && z > e.minZ + 1e-6);
      steps.forEach((z, i) => p.dimV(e.minZ, z, bu1, 6 + i * 6, fmt(z - e.minZ), 'arrow'));
      // Diámetros de cilindros, apilados por encima de la pieza.
      const cyl = m.solids.filter((s) => s.tipo === 'cilindro').sort((a, b) => a.r - b.r);
      cyl.forEach((s, i) => {
        const [u0, u1] = horiz.solid(s);
        p.dimH(u0, u1, e.maxZ, -(5 + i * 5.5), `Ø${fmt(s.r * 2)}`, 'arrow');
      });
    },
  };
}

export function piezaViews(m) {
  const e = extents(m);

  const frontal = sideView(m, e, {
    title: 'Alzado (vista frontal)',
    horiz: {
      bounds: (e) => [e.minX, e.maxX],
      depth: (s) => (s.tipo === 'bloque' ? s.y : s.y - s.r),
      solid: (s) => (s.tipo === 'bloque' ? [s.x, s.x + s.w] : [s.x - s.r, s.x + s.r]),
      cut: (c) => (c.tipo === 'agujero' ? [c.x - c.r, c.x + c.r] : [c.x, c.x + c.w]),
    },
  });

  // Vista lateral izquierda: se mira desde -X, así que a la derecha queda -Y.
  const lateral = sideView(m, e, {
    title: 'Vista lateral izquierda',
    horiz: {
      bounds: (e) => [-e.maxY, -e.minY],
      depth: (s) => (s.tipo === 'bloque' ? s.x : s.x - s.r),
      solid: (s) => (s.tipo === 'bloque' ? [-(s.y + s.d), -s.y] : [-(s.y + s.r), -(s.y - s.r)]),
      cut: (c) => (c.tipo === 'agujero' ? [-(c.y + c.r), -(c.y - c.r)] : [-(c.y + c.d), -c.y]),
    },
  });

  const feats = [
    ...m.cuts.map((c) => [c.x, c.y]),
    ...m.solids.filter((s) => s.tipo === 'cilindro').map((s) => [s.x, s.y]),
  ];
  const xs = uniq(feats.map((f) => f[0])).filter((x) => x > e.minX + 1e-6 && x < e.maxX - 1e-6);
  const ys = uniq(feats.map((f) => f[1])).filter((y) => y > e.minY + 1e-6 && y < e.maxY - 1e-6);
  const planta = {
    title: 'Planta (vista superior)',
    kind: 'ortho',
    pad: 16 + 5.5 * Math.max(xs.length, ys.length),
    bounds: { minU: e.minX, maxU: e.maxX, minV: e.minY, maxV: e.maxY },
    draw(p) {
      const solids = m.solids.slice().sort((a, b) => a.z + a.h - (b.z + b.h));
      for (const s of solids) {
        if (s.tipo === 'bloque') p.rect(s.x, s.y, s.w, s.d, 'solid');
        else p.circle(s.x, s.y, s.r, 'solid');
      }
      for (const c of m.cuts) {
        if (c.tipo === 'agujero') p.circle(c.x, c.y, c.r, 'solid');
        else p.rect(c.x, c.y, c.w, c.d, 'solid');
      }
      for (const s of m.solids) if (s.tipo === 'cilindro') p.centerMark(s.x, s.y, s.r);
      for (const c of m.cuts) if (c.tipo === 'agujero') p.centerMark(c.x, c.y, c.r);

      p.dimH(e.minX, e.maxX, e.minY, 8, fmt(e.maxX - e.minX), 'arrow');
      p.dimV(e.minY, e.maxY, e.minX, -9, fmt(e.maxY - e.minY), 'arrow');
      // Posición de centros de agujeros y cilindros, y de ranuras.
      xs.forEach((x, i) => p.dimH(e.minX, x, e.maxY, -(5 + i * 5.5), fmt(x - e.minX), 'arrow'));
      ys.forEach((y, i) => p.dimV(e.minY, y, e.maxX, 5 + i * 5.5, fmt(y - e.minY), 'arrow'));
      // Rótulos de diámetro / profundidad.
      for (const c of m.cuts) {
        const label = c.tipo === 'agujero'
          ? `Ø${fmt(c.r * 2)}${Math.abs(c.z0 - e.minZ) < 1e-6 ? ' pasante' : ` ↧${fmt(c.z1 - c.z0)}`}`
          : `${fmt(c.w)}×${fmt(c.d)} ↧${fmt(c.z1 - c.z0)}`;
        const [u, v] = c.tipo === 'agujero' ? [c.x + c.r * 0.75, c.y + c.r * 0.75] : [c.x + c.w, c.y + c.d];
        p.text(u, v, label, { size: 2, anchor: 'start', dx: 1.2, dy: -1.8, cls: 'dimtxt' });
      }
    },
  };

  const iso = isoView(m);
  return [frontal, lateral, planta, iso];
}

function isoView(m) {
  const P = (x, y, z) => [(x - y) * C30, z + (x + y) * 0.5];
  const pts = [];
  for (const s of m.solids) {
    const [x0, x1, y0, y1] = s.tipo === 'bloque' ? [s.x, s.x + s.w, s.y, s.y + s.d] : [s.x - s.r, s.x + s.r, s.y - s.r, s.y + s.r];
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [s.z, s.z + s.h]) pts.push(P(x, y, z));
  }
  const us = pts.map((p) => p[0]), vs = pts.map((p) => p[1]);
  const circle = (cx, cy, r, z, n = 48) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push(P(cx + r * Math.cos(a), cy + r * Math.sin(a), z));
    }
    return out;
  };
  // Cada corte se dibuja justo después del sólido sobre el que está.
  const host = (c) => {
    const cx = c.tipo === 'agujero' ? c.x : c.x + c.w / 2;
    const cy = c.tipo === 'agujero' ? c.y : c.y + c.d / 2;
    let best = null;
    for (const s of m.solids) {
      const inside = s.tipo === 'bloque'
        ? cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.d
        : Math.hypot(cx - s.x, cy - s.y) <= s.r;
      if (inside && Math.abs(s.z + s.h - c.z1) < 1e-6) best = s;
    }
    return best;
  };
  return {
    title: 'Vista isométrica',
    kind: 'free',
    pad: 8,
    bounds: { minU: Math.min(...us), maxU: Math.max(...us), minV: Math.min(...vs), maxV: Math.max(...vs) },
    draw(p) {
      const close = (s) => {
        const [cx, cy] = s.tipo === 'bloque' ? [s.x + s.w / 2, s.y + s.d / 2] : [s.x, s.y];
        return -cx - cy + (s.z + s.h / 2) * 0.5;
      };
      const solids = m.solids.slice().sort((a, b) => close(a) - close(b));
      for (const s of solids) {
        if (s.tipo === 'bloque') {
          const { x, y, z, w, d, h } = s;
          p.poly([P(x, y, z), P(x + w, y, z), P(x + w, y, z + h), P(x, y, z + h)], 'face2');
          p.poly([P(x, y, z), P(x, y + d, z), P(x, y + d, z + h), P(x, y, z + h)], 'face3');
          p.poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], 'face1');
        } else {
          p.poly(convexHull([...circle(s.x, s.y, s.r, s.z), ...circle(s.x, s.y, s.r, s.z + s.h)]), 'face2');
          p.poly(circle(s.x, s.y, s.r, s.z + s.h), 'face1');
        }
        for (const c of m.cuts) {
          if (host(c) !== s) continue;
          if (c.tipo === 'agujero') p.poly(circle(c.x, c.y, c.r, c.z1), 'hole');
          else p.poly([P(c.x, c.y, c.z1), P(c.x + c.w, c.y, c.z1), P(c.x + c.w, c.y + c.d, c.z1), P(c.x, c.y + c.d, c.z1)], 'hole');
        }
      }
    },
  };
}

export function piezaNotes(m) {
  let vol = 0;
  for (const s of m.solids) vol += s.tipo === 'bloque' ? s.w * s.d * s.h : Math.PI * s.r * s.r * s.h;
  for (const c of m.cuts) vol -= c.tipo === 'agujero' ? Math.PI * c.r * c.r * (c.z1 - c.z0) : c.w * c.d * (c.z1 - c.z0);
  const holes = m.cuts.filter((c) => c.tipo === 'agujero').length;
  const notes = [`Cotas en ${m.unidad}. Proyección primer diedro (ISO E).`];
  notes.push(m.unidad === 'mm' ? `Volumen aprox.: ${fmt(vol / 1000, 1)} cm³` : `Volumen aprox.: ${fmt(vol, 1)} ${m.unidad}³`);
  if (holes) notes.push(`${holes} agujero${holes > 1 ? 's' : ''}; ↧ = profundidad.`);
  return notes;
}
