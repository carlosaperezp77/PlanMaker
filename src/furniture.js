// Amueblado automático para el render 3D. Cada recinto se reconoce por su
// nombre (dormitorio, sala, cocina, baño…) y se le colocan muebles sencillos
// contra los muros, sin tapar puertas ni ventanas y sin chocar entre sí.
//
// Los muebles se describen en un marco local: `a` a lo ancho (centrado en 0)
// y `b` desde el respaldo (0) hacia el frente. Un ancla {ox, oy, fx, fy} los
// lleva al plano: (ox, oy) es el centro del respaldo y (fx, fy) la dirección
// hacia la que miran.

import { norm } from './util.js';
import { openingGeom } from './views/edificio.js';

const EPS = 1e-6;

// --------------------------------------------------------- Clasificación

const KINDS = [
  ['bath', /\b(bano|banos|aseo|wc|toilet|ducha|sanitario|medio bano)\b/],
  ['kitchen', /\b(cocina|kitchen|cocineta|kitchenette)\b/],
  ['dining', /\b(comedor|dining)\b/],
  ['living', /\b(sala|estar|living|salon|family|tv)\b/],
  ['bedroom', /\b(dormitorio|dormitorios|cuarto|habitacion|recamara|alcoba|suite|principal|huespedes|nino|nina|ninos)\b/],
  ['study', /\b(estudio|oficina|despacho|biblioteca|escritorio)\b/],
  ['laundry', /\b(lavanderia|lavadero|lavado|patio de ropas)\b/],
  ['garage', /\b(garaje|garage|cochera|parqueadero|estacionamiento)\b/],
  ['hall', /\b(pasillo|hall|recibidor|vestibulo|entrada|circulacion|escalera|distribuidor|closet|vestidor|bodega|deposito)\b/],
];

/** Tipo de recinto según su nombre. "Sala comedor" → ['living', 'dining']. */
export function roomKinds(nombre) {
  const n = norm(nombre);
  const found = KINDS.filter(([, re]) => re.test(n)).map(([k]) => k);
  if (found.includes('bath')) return ['bath'];
  if (found.includes('kitchen') && found.includes('dining')) return ['kitchen', 'dining'];
  if (found.includes('living') && found.includes('dining')) return ['living', 'dining'];
  if (found.length) return [found[0]];
  return ['other'];
}

/** Acabado de piso del recinto. */
export function floorMaterial(nombre) {
  const k = roomKinds(nombre)[0];
  if (k === 'bath' || k === 'laundry') return 'tile';
  if (k === 'kitchen') return 'tileWarm';
  if (k === 'garage') return 'concrete';
  return 'wood';
}

// ----------------------------------------------------------- Geometría

const rectHit = (p, q, gap = 0) => p.x0 < q.x1 - gap && q.x0 < p.x1 - gap && p.y0 < q.y1 - gap && q.y0 < p.y1 - gap;

function toWorld(anchor, a, b) {
  const { ox, oy, fx, fy } = anchor;
  const rx = fy, ry = -fx; // derecha del mueble
  return [ox + b * fx + a * rx, oy + b * fy + a * ry];
}

function footprint(anchor, a0, a1, b0, b1) {
  const p = toWorld(anchor, a0, b0), q = toWorld(anchor, a1, b1);
  return { x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), y0: Math.min(p[1], q[1]), y1: Math.max(p[1], q[1]) };
}

/** Pasa las piezas de un mueble del marco local al plano, como primitivas. */
function emit(out, anchor, parts, base) {
  const horizAxis = (axis) => {
    // Eje de un cilindro acostado: 'a' o 'b' local → 'x' o 'y' del plano.
    const along = axis === 'a' ? [anchor.fy, -anchor.fx] : [anchor.fx, anchor.fy];
    return Math.abs(along[0]) > 0.5 ? 'x' : 'y';
  };
  for (const p of parts) {
    if (p.box) {
      const [a0, a1, b0, b1, z0, z1] = p.box;
      const r = footprint(anchor, a0, a1, b0, b1);
      out.push({ type: 'box', mat: p.mat, x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, z: base + (z0 + z1) / 2, w: r.x1 - r.x0, d: r.y1 - r.y0, h: z1 - z0, fl: p.fl });
    } else if (p.cyl) {
      const [a, b, z0, h, r, r2] = p.cyl;
      const [x, y] = toWorld(anchor, a, b);
      const prim = { type: 'cyl', mat: p.mat, x, y, z: base + z0, r, h };
      if (r2 !== undefined) prim.r2 = r2;
      if (p.axis) prim.axis = horizAxis(p.axis);
      out.push(prim);
    } else if (p.sphere) {
      const [a, b, z, r, sa = 1, sb = 1, sz = 1] = p.sphere;
      const [x, y] = toWorld(anchor, a, b);
      // Escala local → del plano (se intercambia si el mueble mira a este/oeste).
      const swap = Math.abs(anchor.fx) > 0.5;
      out.push({ type: 'sphere', mat: p.mat, x, y, z: base + z, r, sx: swap ? sb : sa, sy: swap ? sa : sb, sz });
    }
  }
}

// ------------------------------------------------------------- Muebles
// Cada constructor devuelve { w, d, parts } en el marco local.

const B = (a0, a1, b0, b1, z0, z1, mat) => ({ box: [a0, a1, b0, b1, z0, z1], mat });
const C = (a, b, z0, h, r, mat, r2) => ({ cyl: [a, b, z0, h, r, r2], mat });
const S = (a, b, z, r, mat, sa, sb, sz) => ({ sphere: [a, b, z, r, sa, sb, sz], mat });

function lamp(a, b, z) {
  return [C(a, b, z, 0.02, 0.07, 'gold'), C(a, b, z + 0.02, 0.24, 0.018, 'gold'), C(a, b, z + 0.2, 0.24, 0.13, 'shade', 0.09)];
}

function nightstand(a, b0) {
  return [B(a - 0.23, a + 0.23, b0, b0 + 0.42, 0, 0.55, 'woodLight'), B(a - 0.21, a + 0.21, b0 + 0.42, b0 + 0.43, 0.3, 0.33, 'gold'), ...lamp(a, b0 + 0.2, 0.55)];
}

function bed(width, { nightstands = 2, duvet = 'fabricGold' } = {}) {
  const L = 2.05, half = width / 2;
  const parts = [
    B(-half - 0.04, half + 0.04, 0, 0.08, 0, 1.15, 'woodDark'), // cabecera
    B(-half - 0.04, half + 0.04, 0.08, L, 0.1, 0.38, 'woodDark'), // base
    B(-half, half, 0.1, L - 0.03, 0.38, 0.6, 'linen'), // colchón
    B(-half - 0.02, half + 0.02, 0.75, L + 0.01, 0.42, 0.64, duvet), // cobertor
    B(-half - 0.02, half + 0.02, 1.55, 1.85, 0.6, 0.65, 'fabricAccent'), // pie de cama
  ];
  const nP = width > 1.2 ? 2 : 1;
  for (let i = 0; i < nP; i++) {
    const a = nP === 1 ? 0 : (i ? 1 : -1) * width / 4;
    parts.push(S(a, 0.3, 0.68, 0.16, 'linen', (width / nP - 0.12) / 0.32, 0.9, 0.5));
  }
  parts.push(S(0, 0.48, 0.7, 0.12, 'fabricAccent', 1.4, 0.7, 0.6));
  let w = width + 0.08;
  if (nightstands >= 1) { parts.push(...nightstand(-half - 0.3, 0.02)); w = width + 0.66; }
  if (nightstands >= 2) { parts.push(...nightstand(half + 0.3, 0.02)); w = width + 1.24; }
  // Si hay una sola mesa de noche, el conjunto queda descentrado: se recentra.
  if (nightstands === 1) for (const p of parts) shiftA(p, 0.29);
  return { w, d: L + 0.02, parts };
}

function shiftA(p, da) {
  if (p.box) { p.box[0] += da; p.box[1] += da; } else if (p.cyl) p.cyl[0] += da; else if (p.sphere) p.sphere[0] += da;
}

function wardrobe(w) {
  const parts = [B(-w / 2, w / 2, 0, 0.6, 0, 2.15, 'woodLight'), B(-w / 2 - 0.02, w / 2 + 0.02, 0, 0.62, 2.15, 2.22, 'gold')];
  const n = Math.max(2, Math.round(w / 0.5));
  for (let i = 1; i < n; i++) parts.push(B(-w / 2 + (w * i) / n - 0.005, -w / 2 + (w * i) / n + 0.005, 0.6, 0.61, 0.05, 2.1, 'gold'));
  for (let i = 0; i < n; i++) {
    const a = -w / 2 + (w * (i + 0.5)) / n + (i % 2 ? -1 : 1) * (w / n) * 0.35;
    parts.push(B(a - 0.01, a + 0.01, 0.6, 0.64, 0.95, 1.25, 'gold'));
  }
  return { w, d: 0.62, parts, tall: true };
}

function sofa(w) {
  const parts = [
    B(-w / 2, w / 2, 0, 0.92, 0, 0.12, 'woodDark'),
    B(-w / 2, w / 2, 0, 0.25, 0.12, 0.88, 'fabric'), // respaldo
    B(-w / 2, -w / 2 + 0.22, 0.05, 0.92, 0.12, 0.64, 'fabric'), // brazos
    B(w / 2 - 0.22, w / 2, 0.05, 0.92, 0.12, 0.64, 'fabric'),
  ];
  const n = w > 2 ? 3 : 2, inner = w - 0.44, cw = inner / n;
  for (let i = 0; i < n; i++) {
    const a0 = -inner / 2 + i * cw;
    parts.push(B(a0 + 0.01, a0 + cw - 0.01, 0.25, 0.9, 0.12, 0.45, 'fabricLight'));
    parts.push(S(a0 + cw / 2, 0.33, 0.62, 0.17, 'fabricAccent', 1.1, 0.45, 1));
  }
  return { w, d: 0.92, parts };
}

function armchair() {
  return {
    w: 0.82, d: 0.82,
    parts: [
      B(-0.41, 0.41, 0, 0.82, 0, 0.1, 'woodDark'),
      B(-0.41, 0.41, 0, 0.2, 0.1, 0.9, 'fabric'),
      B(-0.41, -0.27, 0.05, 0.82, 0.1, 0.62, 'fabric'),
      B(0.27, 0.41, 0.05, 0.82, 0.1, 0.62, 'fabric'),
      B(-0.27, 0.27, 0.2, 0.8, 0.1, 0.44, 'fabricLight'),
    ],
  };
}

function coffeeTable(w, d) {
  const parts = [B(-w / 2, w / 2, 0, d, 0.36, 0.42, 'marble')];
  for (const sa of [-1, 1]) for (const sb of [0, 1]) parts.push(B(sa * (w / 2 - 0.06) - 0.025, sa * (w / 2 - 0.06) + 0.025, sb ? d - 0.085 : 0.035, sb ? d - 0.035 : 0.085, 0, 0.36, 'gold'));
  parts.push(C(0, d / 2, 0.42, 0.12, 0.06, 'glassDeco'), S(0, d / 2, 0.6, 0.09, 'leaves'));
  return { w, d, parts };
}

function tvUnit(w) {
  return {
    w, d: 0.45,
    parts: [
      B(-w / 2, w / 2, 0, 0.45, 0, 0.5, 'woodDark'),
      B(-w * 0.36, w * 0.36, 0.08, 0.13, 0.62, 0.62 + w * 0.41, 'screen'),
      B(-0.12, 0.12, 0.06, 0.2, 0.5, 0.62, 'screen'),
    ],
  };
}

function chair(mat = 'woodDark', seat = 'fabricLight') {
  const parts = [B(-0.22, 0.22, 0.04, 0.46, 0.44, 0.5, seat), B(-0.22, 0.22, 0, 0.05, 0.44, 0.95, mat)];
  for (const sa of [-1, 1]) for (const b of [0.02, 0.42]) parts.push(B(sa * 0.19 - 0.02, sa * 0.19 + 0.02, b, b + 0.04, 0, 0.44, mat));
  return parts;
}

/** Mesa con sillas. Marco centrado en el centro de la mesa (b = 0 en el centro). */
function diningSet(seats) {
  const round = seats <= 4;
  const tw = round ? 1.0 : seats >= 8 ? 2.2 : 1.7, td = round ? 1.0 : 0.95;
  const parts = [];
  if (round) {
    parts.push(C(0, 0, 0.72, 0.04, 0.5, 'woodLight'), C(0, 0, 0, 0.72, 0.06, 'gold'), C(0, 0, 0, 0.03, 0.25, 'gold'));
  } else {
    parts.push(B(-tw / 2, tw / 2, -td / 2, td / 2, 0.72, 0.76, 'woodLight'));
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) parts.push(B(sa * (tw / 2 - 0.08) - 0.03, sa * (tw / 2 - 0.08) + 0.03, sb * (td / 2 - 0.08) - 0.03, sb * (td / 2 - 0.08) + 0.03, 0, 0.72, 'woodDark'));
  }
  parts.push(C(0, 0, 0.76, 0.1, 0.12, 'glassDeco', 0.09), S(0, 0, 0.92, 0.1, 'fruit'));
  // Sillas: cada una mira hacia la mesa.
  const place = (a, b, dir) => {
    for (const p of chair()) {
      const q = JSON.parse(JSON.stringify(p));
      const [a0, a1, b0, b1] = q.box;
      // Silla en su marco (respaldo en b=0, mira a +b) → rotada `dir` (0: mira +b, 1: −b, 2: +a, 3: −a).
      const corners = [[a0, b0], [a1, b1]].map(([u, v]) => {
        const lb = v - 0.5; // respaldo a 0.5 m del borde de la mesa
        if (dir === 0) return [a + u, b + lb];
        if (dir === 1) return [a - u, b - lb];
        if (dir === 2) return [a + lb, b - u];
        return [a - lb, b + u];
      });
      q.box = [Math.min(corners[0][0], corners[1][0]), Math.max(corners[0][0], corners[1][0]), Math.min(corners[0][1], corners[1][1]), Math.max(corners[0][1], corners[1][1]), q.box[4], q.box[5]];
      parts.push(q);
    }
  };
  if (round) {
    place(0, -td / 2 - 0.05, 0); place(0, td / 2 + 0.05, 1); place(-tw / 2 - 0.05, 0, 2); place(tw / 2 + 0.05, 0, 3);
  } else {
    const per = Math.max(1, Math.round((seats - 2) / 2));
    for (let i = 0; i < per; i++) {
      const a = -tw / 2 + (tw * (i + 0.5)) / per;
      place(a, -td / 2 - 0.05, 0); place(a, td / 2 + 0.05, 1);
    }
    place(-tw / 2 - 0.05, 0, 2); place(tw / 2 + 0.05, 0, 3);
  }
  return { w: tw + 1.2, d: td + 1.2, parts, centered: true };
}

function counter(len, { sink = true, cooktop = true, uppers = true } = {}) {
  const parts = [
    B(-len / 2, len / 2, 0, 0.58, 0.1, 0.88, 'cabinet'),
    B(-len / 2, len / 2, 0.05, 0.58, 0, 0.1, 'woodDark'),
    B(-len / 2, len / 2, 0, 0.62, 0.88, 0.92, 'stone'),
  ];
  const n = Math.max(1, Math.round(len / 0.6));
  for (let i = 1; i < n; i++) parts.push(B(-len / 2 + (len * i) / n - 0.004, -len / 2 + (len * i) / n + 0.004, 0.58, 0.585, 0.12, 0.86, 'woodDark'));
  if (sink && len >= 1.2) parts.push(B(len / 2 - 0.85, len / 2 - 0.3, 0.12, 0.5, 0.86, 0.925, 'steel'), C(len / 2 - 0.575, 0.06, 0.92, 0.28, 0.015, 'steel'));
  if (cooktop && len >= 1.8) parts.push(B(-len / 2 + 0.3, -len / 2 + 0.9, 0.1, 0.52, 0.92, 0.93, 'screen'));
  if (uppers) parts.push(B(-len / 2, len / 2, 0, 0.34, 1.5, 2.2, 'cabinet'));
  return { w: len, d: 0.62, parts };
}

function fridge() {
  return { w: 0.72, d: 0.72, tall: true, parts: [B(-0.36, 0.36, 0, 0.7, 0, 1.85, 'steel'), B(0.26, 0.29, 0.7, 0.74, 0.9, 1.5, 'screen')] };
}

function vanity(hasMirror) {
  const parts = [B(-0.42, 0.42, 0, 0.5, 0.15, 0.85, 'woodDark'), B(-0.44, 0.44, 0, 0.52, 0.85, 0.89, 'marble'), C(0, 0.27, 0.86, 0.06, 0.19, 'porcelain', 0.15), C(0, 0.06, 0.89, 0.2, 0.012, 'steel')];
  if (hasMirror) parts.push(B(-0.35, 0.35, 0, 0.02, 1.15, 1.85, 'mirror'));
  return { w: 0.88, d: 0.52, parts };
}

function toilet() {
  return {
    w: 0.42, d: 0.7,
    parts: [B(-0.19, 0.19, 0, 0.18, 0.35, 0.8, 'porcelain'), C(0, 0.42, 0, 0.38, 0.16, 'porcelain', 0.19), B(-0.19, 0.19, 0.18, 0.66, 0.38, 0.41, 'porcelain')],
  };
}

function shower(w) {
  return {
    w, d: w, parts: [
      B(-w / 2, w / 2, 0, w, 0, 0.06, 'porcelain'),
      B(-w / 2, w / 2, w - 0.01, w, 0.06, 2.0, 'glassDeco'),
      C(0, 0.05, 1.9, 0.02, 0.1, 'steel'),
    ], tall: true,
  };
}

function bathtub() {
  return { w: 1.65, d: 0.75, parts: [B(-0.825, 0.825, 0, 0.75, 0, 0.55, 'porcelain'), B(-0.75, 0.75, 0.08, 0.67, 0.5, 0.56, 'water')] };
}

function desk() {
  return {
    w: 1.3, d: 1.25,
    parts: [B(-0.65, 0.65, 0, 0.65, 0.72, 0.76, 'woodLight'), B(-0.63, -0.58, 0.02, 0.63, 0, 0.72, 'woodDark'), B(0.58, 0.63, 0.02, 0.63, 0, 0.72, 'woodDark'), B(-0.25, 0.25, 0.05, 0.08, 0.76, 1.1, 'screen'), ...chair().map((p) => { const q = JSON.parse(JSON.stringify(p)); q.box = [-q.box[1], -q.box[0], 1.2 - q.box[3], 1.2 - q.box[2], q.box[4], q.box[5]]; return q; }), ...lamp(0.45, 0.2, 0.76)],
  };
}

function shelf(w) {
  const parts = [B(-w / 2, w / 2, 0, 0.35, 0, 1.9, 'woodDark')];
  for (let z = 0.4; z < 1.9; z += 0.45) {
    parts.push(B(-w / 2 + 0.05, w / 2 - 0.05, 0.02, 0.36, z, z + 0.02, 'woodLight'));
    parts.push(B(-w / 2 + 0.08, -w / 2 + 0.08 + w * 0.4, 0.06, 0.3, z + 0.02, z + 0.3, 'fabricAccent'));
  }
  return { w, d: 0.36, parts, tall: true };
}

function washer() {
  return { w: 0.62, d: 0.62, parts: [B(-0.3, 0.3, 0, 0.6, 0, 0.85, 'porcelain'), { cyl: [0, 0.61, 0.45, 0.03, 0.18], mat: 'glassDeco', axis: 'b' }] };
}

function car() {
  const parts = [
    B(-0.88, 0.88, 0.2, 4.3, 0.3, 0.85, 'carPaint'),
    B(-0.78, 0.78, 1.3, 3.3, 0.85, 1.35, 'glassDeco'),
    B(-0.8, 0.8, 1.4, 3.2, 1.35, 1.4, 'carPaint'),
  ];
  for (const a of [-0.8, 0.8]) for (const b of [1.05, 3.55]) parts.push({ cyl: [a, b, 0.33, 0.24, 0.33], mat: 'tire', axis: 'a' });
  return { w: 1.8, d: 4.5, parts };
}

function plant(size = 1) {
  return {
    w: 0.45 * size, d: 0.45 * size,
    parts: [C(0, 0.22 * size, 0, 0.35 * size, 0.17 * size, 'pot', 0.13 * size), S(0, 0.22 * size, 0.75 * size, 0.3 * size, 'leaves', 1, 1, 1.4), S(0.08, 0.2 * size, 1.05 * size, 0.18 * size, 'leaves')],
  };
}

function rug(w, d, mat = 'rug') {
  return [B(-w / 2, w / 2, 0, d, 0, 0.012, mat)];
}

// --------------------------------------------------------- Colocación

/**
 * Amuebla un recinto. `doors`/`windows`: vanos {lado, a0, a1, antepecho, alto}
 * sobre los muros del recinto (en coordenadas del plano). Devuelve primitivas.
 */
export function furnishRoom(room, openings, t, base) {
  const R = { x0: room.x + t / 2, x1: room.x + room.w - t / 2, y0: room.y + t / 2, y1: room.y + room.d - t / 2 };
  const W = R.x1 - R.x0, D = R.y1 - R.y0;
  if (W < 0.9 || D < 0.9) return [];
  const out = [];
  const taken = [];
  const doorZones = [];
  const windows = [];
  for (const o of openings) {
    const g = openingGeom(o);
    const side = sideOf(room, g);
    if (!side) continue;
    const lo = Math.max(g.a0, side.lo), hi = Math.min(g.a1, side.hi);
    if (hi - lo < 0.05) continue;
    if (o.tipo === 'puerta') {
      const depth = Math.min(o.ancho + 0.15, 1.2);
      doorZones.push({ side: side.s, lo, hi, rect: wallRect(R, side.s, lo - 0.1, hi + 0.1, 0, depth) });
    } else windows.push({ side: side.s, lo, hi, z0: o.antepecho });
  }

  const sideSpan = (s) => (s === 'S' || s === 'N' ? [R.x0, R.x1] : [R.y0, R.y1]);
  const anchorAt = (s, c, gap = 0) => {
    if (s === 'S') return { ox: c, oy: R.y0 + gap, fx: 0, fy: 1 };
    if (s === 'N') return { ox: c, oy: R.y1 - gap, fx: 0, fy: -1 };
    if (s === 'O') return { ox: R.x0 + gap, oy: c, fx: 1, fy: 0 };
    return { ox: R.x1 - gap, oy: c, fx: -1, fy: 0 };
  };
  const fits = (rect, item, side) => {
    if (rect.x0 < R.x0 - EPS || rect.x1 > R.x1 + EPS || rect.y0 < R.y0 - EPS || rect.y1 > R.y1 + EPS) return false;
    if (taken.some((q) => rectHit(rect, q, 0.01))) return false;
    if (doorZones.some((z) => rectHit(rect, z.rect))) return false;
    if (item.tall && side) {
      const [lo, hi] = side === 'S' || side === 'N' ? [rect.x0, rect.x1] : [rect.y0, rect.y1];
      if (windows.some((wd) => wd.side === side && wd.lo < hi - 0.02 && lo < wd.hi - 0.02)) return false;
    }
    return true;
  };
  /** Intenta colocar `item` contra alguno de los muros `sides`. */
  const againstWall = (item, sides, { prefer = 'center', gap = 0, keep = true } = {}) => {
    for (const s of sides) {
      const [lo, hi] = sideSpan(s);
      const len = hi - lo;
      if (item.w > len + EPS) continue;
      const cands = [];
      const mid = (lo + hi) / 2, start = lo + item.w / 2, end = hi - item.w / 2;
      if (prefer === 'center') {
        for (let k = 0; k <= len; k += 0.05) { cands.push(mid - k, mid + k); }
      } else if (prefer === 'start') {
        for (let c = start; c <= end + EPS; c += 0.05) cands.push(c);
      } else {
        for (let c = end; c >= start - EPS; c -= 0.05) cands.push(c);
      }
      for (const c of cands) {
        if (c < start - EPS || c > end + EPS) continue;
        const anchor = anchorAt(s, c, gap);
        const rect = footprint(anchor, -item.w / 2, item.w / 2, 0, item.d);
        if (fits(rect, item, s)) {
          if (keep) taken.push(rect);
          emit(out, anchor, item.parts, base);
          return { side: s, anchor, rect, c };
        }
      }
    }
    return null;
  };
  /** Coloca un objeto centrado en algún punto libre, empezando por el centro de `area`. */
  const freeSpot = (item, area = R) => {
    const cx = (area.x0 + area.x1) / 2, cy = (area.y0 + area.y1) / 2;
    const dirs = W >= D ? [{ fx: 0, fy: 1 }, { fx: 1, fy: 0 }] : [{ fx: 1, fy: 0 }, { fx: 0, fy: 1 }];
    const pts = [];
    for (let r = 0; r <= Math.max(W, D); r += 0.1) {
      for (let k = 0; k < 16; k++) {
        const th = (k / 16) * Math.PI * 2;
        pts.push([cx + r * Math.cos(th), cy + r * Math.sin(th)]);
        if (!r) break;
      }
    }
    for (const [x, y] of pts) {
      if (x < area.x0 || x > area.x1 || y < area.y0 || y > area.y1) continue;
      for (const f of dirs) {
        const anchor = { ox: x - f.fx * item.d / 2, oy: y - f.fy * item.d / 2, ...f };
        const rect = footprint(anchor, -item.w / 2, item.w / 2, 0, item.d);
        if (fits(rect, item)) {
          taken.push(rect);
          const shifted = item.centered ? { ...anchor, ox: x, oy: y } : anchor;
          emit(out, shifted, item.parts, base);
          return { anchor, rect };
        }
      }
    }
    return null;
  };

  // Muros ordenados: primero los que no tienen puerta, luego los más largos.
  const sidesByCalm = (exclude = []) => ['S', 'N', 'O', 'E']
    .filter((s) => !exclude.includes(s))
    .map((s) => {
      const [lo, hi] = sideSpan(s);
      const doorLen = doorZones.filter((z) => z.side === s).reduce((a, z) => a + z.hi - z.lo, 0);
      const winLen = windows.filter((w) => w.side === s).reduce((a, w) => a + w.hi - w.lo, 0);
      return { s, score: (hi - lo) - doorLen * 3 - winLen * 0.3 - (doorLen ? 2 : 0) };
    })
    .sort((p, q) => q.score - p.score)
    .map((x) => x.s);
  const opposite = { S: 'N', N: 'S', O: 'E', E: 'O' };
  const perpendicular = (s) => (s === 'S' || s === 'N' ? ['O', 'E'] : ['S', 'N']);
  const depthFrom = (s) => (s === 'S' || s === 'N' ? D : W);

  const kinds = roomKinds(room.nombre);
  // Recintos mixtos (sala comedor, cocina comedor): se reparte por mitades.
  const halves = kinds.length > 1 ? splitArea(R) : [R];

  kinds.forEach((kind, i) => {
    const area = halves[Math.min(i, halves.length - 1)];
    switch (kind) {
      case 'bedroom': {
        const sides = sidesByCalm();
        const minSide = Math.min(W, D);
        const double = minSide >= 2.6;
        const width = double ? (minSide >= 3.4 ? 1.8 : 1.5) : 0.95;
        const duvets = ['fabricGold', 'fabricSage', 'fabricBlue', 'fabricRose'];
        const duvet = duvets[Math.abs(Math.round(room.x * 7 + room.y * 3)) % duvets.length];
        let placed = null;
        for (const ns of [2, 1, 0]) {
          placed = againstWall(bed(width, { nightstands: ns, duvet }), sides.filter((s) => depthFrom(s) >= 2.6 || ns === 0));
          if (placed) break;
        }
        const wardrobeSides = placed ? [opposite[placed.side], ...perpendicular(placed.side)] : sides;
        for (const ww of [2.0, 1.6, 1.2, 0.9]) {
          if (againstWall(wardrobe(ww), wardrobeSides, { prefer: 'start' })) break;
        }
        if (W * D >= 10) againstWall(plant(1), sidesByCalm(), { prefer: 'end' });
        break;
      }
      case 'living': {
        const sides = sidesByCalm().filter((s) => isInArea(area, R, s));
        const len = Math.min(2.6, Math.max(1.5, (area === R ? Math.max(W, D) : Math.min(area.x1 - area.x0, area.y1 - area.y0)) - 1.6));
        let sofaAt = null, sw = 0;
        for (const w of [len, 2.2, 1.8, 1.5]) {
          sofaAt = againstWall(sofa(w), sides.length ? sides : sidesByCalm(), { prefer: 'center' });
          if (sofaAt) { sw = w; break; }
        }
        if (!sofaAt) { freeSpot(armchair(), area); break; }
        const a = sofaAt.anchor;
        // Mesa de centro, alfombra y sillones frente al sofá.
        const deep = depthFrom(sofaAt.side);
        const tableB = 0.92 + 0.45;
        if (deep >= tableB + 0.6 + 0.6) {
          const rugW = Math.min(3, sw + 0.6, (sofaAt.side === 'S' || sofaAt.side === 'N' ? W : D) - 0.2);
          emit(out, a, rug(rugW, Math.min(2.4, deep - 0.9)).map((p) => moveB(p, 0.7)), base);
          const ct = coffeeTable(1.1, 0.6);
          const ctRect = footprint(a, -0.55, 0.55, tableB, tableB + 0.6);
          if (fits(ctRect, ct)) { taken.push(ctRect); emit(out, a, ct.parts.map((p) => moveB(p, tableB)), base); }
          // Dos sillones a los lados de la mesa, mirándola.
          for (const sign of [-1, 1]) {
            const ac = armchair();
            const [x, y] = toWorld(a, sign * (0.55 + 0.55 + 0.41), tableB + 0.3);
            const f = { fx: -sign * a.fy, fy: sign * a.fx }; // mira hacia la mesa
            const anchor = { ox: x - f.fx * 0.41, oy: y - f.fy * 0.41, ...f };
            const rect = footprint(anchor, -0.41, 0.41, 0, 0.82);
            if (fits(rect, ac)) { taken.push(rect); emit(out, anchor, ac.parts, base); }
          }
          // Mueble de TV en el muro de enfrente si la sala no es muy profunda.
          if (deep <= 5.5) againstWall(tvUnit(1.6), [opposite[sofaAt.side]], { prefer: 'center' });
        }
        againstWall(plant(1.2), sidesByCalm(), { prefer: 'start' });
        break;
      }
      case 'dining': {
        const aw = area.x1 - area.x0, ad = area.y1 - area.y0;
        const seats = aw * ad >= 11 ? 6 : 4;
        if (!freeSpot(diningSet(seats), area) && seats > 4) freeSpot(diningSet(4), area);
        break;
      }
      case 'kitchen': {
        const sides = sidesByCalm();
        let run = null;
        for (const s of sides) {
          const [lo, hi] = sideSpan(s);
          const winHere = windows.some((w) => w.side === s);
          for (const len of [Math.min(3.6, hi - lo - 0.8), 2.4, 1.8, 1.2]) {
            if (len < 1.2) continue;
            run = againstWall(counter(len, { uppers: !winHere }), [s], { prefer: 'start' });
            if (run) break;
          }
          if (run) break;
        }
        const fr = fridge();
        if (!run || !againstWall(fr, [run.side], { prefer: 'end' })) againstWall(fr, sidesByCalm(), { prefer: 'start' });
        if (run && kinds.length === 1 && W >= 3 && D >= 3) {
          // Isla o mesa pequeña en el centro.
          freeSpot(diningSet(4), R);
        }
        break;
      }
      case 'bath': {
        const sides = sidesByCalm();
        const tub = Math.max(W, D) >= 2.3 && Math.min(W, D) >= 1.5;
        if (!(tub && againstWall(bathtub(), sides, { prefer: 'start' }))) {
          for (const sw of [0.9, 0.8]) if (againstWall(shower(sw), sides, { prefer: 'start' })) break;
        }
        const winSides = new Set(windows.map((w) => w.side));
        againstWall(vanity(true), sides.filter((s) => !winSides.has(s)), { prefer: 'end' }) || againstWall(vanity(false), sides, { prefer: 'end' });
        againstWall(toilet(), sides, { prefer: 'center' });
        break;
      }
      case 'study': {
        const sides = sidesByCalm();
        againstWall(desk(), sides, { prefer: 'center' });
        againstWall(shelf(Math.min(1.6, Math.max(W, D) / 2)), sides, { prefer: 'start' });
        againstWall(plant(1), sides, { prefer: 'end' });
        break;
      }
      case 'laundry': {
        const sides = sidesByCalm();
        const r1 = againstWall(washer(), sides, { prefer: 'start' });
        if (r1) againstWall(washer(), [r1.side], { prefer: 'start' });
        break;
      }
      case 'garage': {
        if (Math.max(W, D) >= 4.6 && Math.min(W, D) >= 2.3) {
          const c = car();
          const along = W >= D ? { fx: 1, fy: 0 } : { fx: 0, fy: 1 };
          const cx = (R.x0 + R.x1) / 2, cy = (R.y0 + R.y1) / 2;
          const anchor = { ox: cx - along.fx * 2.25, oy: cy - along.fy * 2.25, ...along };
          emit(out, anchor, c.parts, base);
        }
        break;
      }
      case 'other':
        if (W * D >= 6) againstWall(plant(1), sidesByCalm(), { prefer: 'end' });
        break;
      default:
        break;
    }
  });
  return out;
}

function moveB(p, db) {
  const q = JSON.parse(JSON.stringify(p));
  if (q.box) { q.box[2] += db; q.box[3] += db; } else if (q.cyl) q.cyl[1] += db; else if (q.sphere) q.sphere[1] += db;
  return q;
}

function splitArea(R) {
  const W = R.x1 - R.x0, D = R.y1 - R.y0;
  if (W >= D) {
    const xm = R.x0 + W * 0.55;
    return [{ ...R, x1: xm }, { ...R, x0: xm }];
  }
  const ym = R.y0 + D * 0.55;
  return [{ ...R, y1: ym }, { ...R, y0: ym }];
}

/** ¿El muro `s` del recinto toca la sub-área? (para repartir sala y comedor). */
function isInArea(area, R, s) {
  if (s === 'S') return Math.abs(area.y0 - R.y0) < EPS;
  if (s === 'N') return Math.abs(area.y1 - R.y1) < EPS;
  if (s === 'O') return Math.abs(area.x0 - R.x0) < EPS;
  return Math.abs(area.x1 - R.x1) < EPS;
}

/** Lado del recinto sobre el que cae un vano (también los de recintos vecinos). */
function sideOf(room, g) {
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  if (g.horiz) {
    if (near(g.at, room.y)) return { s: 'S', lo: room.x, hi: room.x + room.w };
    if (near(g.at, room.y + room.d)) return { s: 'N', lo: room.x, hi: room.x + room.w };
  } else {
    if (near(g.at, room.x)) return { s: 'O', lo: room.y, hi: room.y + room.d };
    if (near(g.at, room.x + room.w)) return { s: 'E', lo: room.y, hi: room.y + room.d };
  }
  return null;
}

function wallRect(R, s, lo, hi, v0, v1) {
  if (s === 'S') return { x0: lo, x1: hi, y0: R.y0 + v0, y1: R.y0 + v1 };
  if (s === 'N') return { x0: lo, x1: hi, y0: R.y1 - v1, y1: R.y1 - v0 };
  if (s === 'O') return { x0: R.x0 + v0, x1: R.x0 + v1, y0: lo, y1: hi };
  return { x0: R.x1 - v1, x1: R.x1 - v0, y0: lo, y1: hi };
}

// ---------------------------------------------------------- Exteriores

/** Tumbonas y sombrilla junto a una piscina, sobre la terraza que la rodea. */
export function poolside(pool, decks) {
  const out = [];
  const deck = decks.find((d) => pool.x >= d.x - EPS && pool.x + pool.w <= d.x + d.w + EPS && pool.y >= d.y - EPS && pool.y + pool.d <= d.y + d.d + EPS);
  if (!deck) return out;
  const lounger = {
    w: 0.7, d: 1.95,
    parts: [B(-0.33, 0.33, 0, 1.95, 0.22, 0.3, 'woodLight'), B(-0.3, 0.3, 0.05, 0.65, 0.3, 0.75, 'linen'), B(-0.3, 0.3, 0.65, 1.9, 0.3, 0.38, 'linen'), B(-0.33, -0.28, 0.1, 1.85, 0, 0.22, 'woodDark'), B(0.28, 0.33, 0.1, 1.85, 0, 0.22, 'woodDark')],
  };
  // Lado de la terraza con más espacio frente a la piscina.
  const gaps = [
    { s: 'S', g: pool.y - 0.3 - deck.y }, { s: 'N', g: deck.y + deck.d - (pool.y + pool.d + 0.3) },
    { s: 'O', g: pool.x - 0.3 - deck.x }, { s: 'E', g: deck.x + deck.w - (pool.x + pool.w + 0.3) },
  ].sort((p, q) => q.g - p.g)[0];
  if (gaps.g < 2.1) return out;
  const n = Math.min(3, Math.floor(((gaps.s === 'S' || gaps.s === 'N' ? pool.w : pool.d) + 0.4) / 1.1));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    let anchor;
    // Cabecera lejos de la piscina, mirando hacia ella.
    if (gaps.s === 'S') anchor = { ox: pool.x + pool.w * t, oy: pool.y - 0.45 - 1.95, fx: 0, fy: 1 };
    if (gaps.s === 'N') anchor = { ox: pool.x + pool.w * t, oy: pool.y + pool.d + 0.45 + 1.95, fx: 0, fy: -1 };
    if (gaps.s === 'O') anchor = { ox: pool.x - 0.45 - 1.95, oy: pool.y + pool.d * t, fx: 1, fy: 0 };
    if (gaps.s === 'E') anchor = { ox: pool.x + pool.w + 0.45 + 1.95, oy: pool.y + pool.d * t, fx: -1, fy: 0 };
    emit(out, anchor, lounger.parts, 0.05);
  }
  // Sombrilla en el extremo.
  const ex = gaps.s === 'O' || gaps.s === 'E' ? 0 : 1;
  const ux = ex ? pool.x + pool.w + 0.9 : (gaps.s === 'O' ? pool.x - 1.4 : pool.x + pool.w + 1.4);
  const uy = ex ? (gaps.s === 'S' ? pool.y - 1.4 : pool.y + pool.d + 1.4) : pool.y + pool.d + 0.9;
  if (ux > deck.x + 0.6 && ux < deck.x + deck.w - 0.6 && uy > deck.y + 0.6 && uy < deck.y + deck.d - 0.6) {
    out.push({ type: 'cyl', mat: 'steel', x: ux, y: uy, z: 0.05, r: 0.025, h: 2.3 });
    out.push({ type: 'cyl', mat: 'linen', x: ux, y: uy, z: 2.05, r: 1.3, r2: 0.05, h: 0.45 });
    out.push({ type: 'cyl', mat: 'steel', x: ux, y: uy, z: 0.05, r: 0.25, h: 0.06 });
  }
  return out;
}

/** Arbustos y palmeras alrededor del lote (deterministas). */
export function landscaping(bounds, avoid) {
  const out = [];
  const { x0, x1, y0, y1 } = bounds;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const clear = (x, y, r) => !avoid.some((q) => x > q.x0 - r && x < q.x1 + r && y > q.y0 - r && y < q.y1 + r);
  // Seto bajo a lo largo de los bordes norte y este.
  const edge = [];
  for (let x = x0 + 0.6; x < x1 - 0.4; x += 0.7) edge.push([x, y1 - 0.5]);
  for (let y = y0 + 0.6; y < y1 - 0.9; y += 0.7) edge.push([x1 - 0.5, y]);
  for (const [x, y] of edge) {
    if (!clear(x, y, 0.5)) continue;
    const r = 0.38 + rnd() * 0.12;
    out.push({ type: 'sphere', mat: rnd() > 0.5 ? 'leaves' : 'leavesLight', x, y, z: r * 0.75, r, sx: 1.1, sy: 1, sz: 0.8 });
  }
  // Palmeras detrás del seto.
  const n = Math.max(3, Math.round((x1 - x0) / 4));
  for (let i = 0; i < n; i++) {
    const x = x0 + ((i + 0.5) / n) * (x1 - x0) + (rnd() - 0.5), y = y1 - 0.9 - rnd() * 0.4;
    if (!clear(x, y, 0.8)) continue;
    palm(out, x, y, 2.6 + rnd() * 1.4, rnd);
  }
  // Algunas matas de flores junto al borde sur.
  for (let x = x0 + 1; x < x1 - 1; x += 1.6 + rnd()) {
    const y = y0 + 0.5;
    if (!clear(x, y, 0.4)) continue;
    out.push({ type: 'sphere', mat: 'leaves', x, y, z: 0.18, r: 0.3, sx: 1.2, sy: 1, sz: 0.6 });
    for (let k = 0; k < 4; k++) out.push({ type: 'sphere', mat: ['flowerRed', 'flowerYellow', 'flowerPink'][k % 3], x: x + (rnd() - 0.5) * 0.5, y: y + (rnd() - 0.5) * 0.4, z: 0.36, r: 0.06 });
  }
  return out;
}

function palm(out, x, y, h, rnd) {
  // Tronco levemente cónico y hojas largas que caen desde la copa.
  out.push({ type: 'cyl', mat: 'trunk', x, y, z: 0, r: 0.14, r2: 0.09, h });
  const n = 9;
  for (let k = 0; k < n; k++) {
    const yaw = (k / n) * Math.PI * 2 + rnd() * 0.4;
    const L = 1.5 + rnd() * 0.4;
    const pitch = 0.35 + rnd() * 0.35;
    const cx = Math.cos(yaw) * Math.cos(pitch) * L * 0.5, cy = Math.sin(yaw) * Math.cos(pitch) * L * 0.5;
    out.push({ type: 'sphere', mat: k % 2 ? 'leaves' : 'leavesLight', x: x + cx, y: y + cy, z: h - Math.sin(pitch) * L * 0.5 + 0.1, r: L / 2, sx: 1, sy: 0.16, sz: 0.035, yaw, pitch });
  }
  out.push({ type: 'sphere', mat: 'trunk', x, y, z: h + 0.05, r: 0.17 });
}
