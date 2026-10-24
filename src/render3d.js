// Render 3D: el modelo se describe primero como primitivas sencillas
// (cajas, cilindros, mallas) y luego se monta con three.js, que se carga
// desde CDN solo cuando se abre la vista.
//
// Coordenadas de modelo: x este, y norte, z arriba. En three.js: x, z→y, y→-z.

import { roomsOf, openingsOf, box, openingGeom } from './views/edificio.js';
import { heightField, pointInPolygon } from './views/terreno.js';
import { bbox } from './util.js';
import { furnishRoom, floorMaterial, poolside, landscaping } from './furniture.js';

const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const EX = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/';
// Complementos: controles de órbita y luz de entorno (si esta no carga, se sigue sin ella).
const ADDONS = ['controls/OrbitControls.js', 'environments/RoomEnvironment.js'];

/**
 * Materiales (colores en sRGB). `tex`: textura procedural; `tile`: metros
 * que cubre una repetición de la textura (sin `tile`, se estira una vez).
 */
export const MATERIALS = {
  wall: { color: 0xf7f4ee, roughness: 0.92 },
  wallTop: { color: 0xfbfaf7, roughness: 0.9 },
  paint: { color: 0xdcc09c, roughness: 0.95 },
  slab: { color: 0xd8d2c8, roughness: 0.9 },
  frame: { color: 0x5b3a22, roughness: 0.6 },
  glass: { color: 0xbfe0f2, roughness: 0.05, metalness: 0.2, opacity: 0.35 },
  door: { color: 0x6e4325, roughness: 0.55, tex: 'woodGrain', tile: 1.2 },
  roof: { color: 0xffffff, roughness: 0.75, tex: 'roofTiles', tile: 1.2 },
  gable: { color: 0xf3eee6, roughness: 0.9 },
  ground: { color: 0xc4cfb2, roughness: 1 },
  grass: { color: 0xffffff, roughness: 1, tex: 'grass', tile: 3 },
  deck: { color: 0xffffff, roughness: 0.6, tex: 'deck', tile: 2.4 },
  coping: { color: 0xece6da, roughness: 0.8, tex: 'stone', tile: 1.2 },
  poolTile: { color: 0xffffff, roughness: 0.4, tex: 'mosaic', tile: 0.6 },
  water: { color: 0x2f9fd8, roughness: 0.05, metalness: 0.1, opacity: 0.72 },
  wood: { color: 0xffffff, roughness: 0.7, tex: 'parquet', tile: 2.4 },
  tile: { color: 0xffffff, roughness: 0.5, tex: 'tiles', tile: 1.2 },
  tileWarm: { color: 0xffffff, roughness: 0.55, tex: 'tilesWarm', tile: 1.2 },
  concrete: { color: 0xffffff, roughness: 0.95, tex: 'concrete', tile: 3 },
  woodDark: { color: 0x5a3720, roughness: 0.5, tex: 'woodGrain', tile: 1 },
  woodLight: { color: 0xc8a06a, roughness: 0.5, tex: 'woodGrain', tile: 1 },
  cabinet: { color: 0xf1ece3, roughness: 0.5 },
  gold: { color: 0xc9a24a, roughness: 0.3, metalness: 0.8 },
  steel: { color: 0xc8ccd0, roughness: 0.25, metalness: 0.85 },
  linen: { color: 0xf6f2ea, roughness: 0.9 },
  fabric: { color: 0xc8b48c, roughness: 0.95 },
  fabricLight: { color: 0xe3d5b8, roughness: 0.95 },
  fabricAccent: { color: 0x8a6b45, roughness: 0.95 },
  fabricGold: { color: 0xe2c25a, roughness: 0.9 },
  fabricSage: { color: 0x9fb08a, roughness: 0.9 },
  fabricBlue: { color: 0x7d9cbf, roughness: 0.9 },
  fabricRose: { color: 0xd7a39b, roughness: 0.9 },
  rug: { color: 0xffffff, roughness: 1, tex: 'rug' },
  marble: { color: 0xffffff, roughness: 0.2, tex: 'marble', tile: 1 },
  stone: { color: 0x3d3a38, roughness: 0.3 },
  porcelain: { color: 0xfbfbfa, roughness: 0.15 },
  mirror: { color: 0xdfe8ee, roughness: 0.02, metalness: 1 },
  screen: { color: 0x15171a, roughness: 0.25 },
  glassDeco: { color: 0xd4ecf5, roughness: 0.05, metalness: 0.1, opacity: 0.45 },
  shade: { color: 0xfff1d6, roughness: 0.9, emissive: 0xffd9a0, emissiveIntensity: 0.55 },
  leaves: { color: 0x3f7a35, roughness: 0.85 },
  leavesLight: { color: 0x6aa14a, roughness: 0.85 },
  trunk: { color: 0x7a5b3f, roughness: 0.95 },
  pot: { color: 0xb7653c, roughness: 0.8 },
  fruit: { color: 0xd9472b, roughness: 0.5 },
  flowerRed: { color: 0xd8344a, roughness: 0.7 },
  flowerYellow: { color: 0xf2c53d, roughness: 0.7 },
  flowerPink: { color: 0xe78bc2, roughness: 0.7 },
  carPaint: { color: 0x2b4a73, roughness: 0.25, metalness: 0.6 },
  tire: { color: 0x1c1c1c, roughness: 0.9 },
  metal: { color: 0x8f99a4, roughness: 0.32, metalness: 0.8 },
  hole: { color: 0x22272e, roughness: 0.9 },
  terrain: { color: 0xffffff, roughness: 1, vertexColors: true },
  skirt: { color: 0x8c7356, roughness: 1 },
  build: { color: 0xe9e4dc, roughness: 0.85 },
  line: { color: 0x222222 },
};

// ------------------------------------------------------------- Edificio

/** Une intervalos [a,b] que se tocan o se superponen. */
function mergeIntervals(list) {
  const s = list.slice().sort((p, q) => p[0] - q[0]);
  const out = [];
  for (const [a, b] of s) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1e-9) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function edificioSpec(m) {
  const prims = [];
  const t = m.muro;
  const H = m.altura;
  const wallH = H - m.losa;
  const OVER = 0.4;
  const ext = m.exteriores || [];
  const pools = ext.filter((e) => e.tipo === 'piscina');
  const decks = ext.filter((e) => e.tipo === 'terraza');

  // Terreno: césped alrededor, con huecos donde van las piscinas.
  const all = box([...m.rooms, ...ext], t);
  const G = { x0: all.minX - 4, x1: all.maxX + 4, y0: all.minY - 4, y1: all.maxY + 4 };
  const holes = pools.map((p) => ({ x0: p.x, x1: p.x + p.w, y0: p.y, y1: p.y + p.d }));
  for (const c of splitAround(G, holes)) prims.push({ type: 'box', mat: 'grass', ...boxFrom(c.x0, c.y0, -0.3, c.x1 - c.x0, c.y1 - c.y0, 0.3), shadow: 'receive', fl: 0 });
  const copingHoles = holes.map((h) => ({ x0: h.x0 - 0.3, x1: h.x1 + 0.3, y0: h.y0 - 0.3, y1: h.y1 + 0.3 }));
  for (const d of decks) {
    for (const c of splitAround({ x0: d.x, x1: d.x + d.w, y0: d.y, y1: d.y + d.d }, copingHoles.filter((h) => h.x0 < d.x + d.w && h.x1 > d.x && h.y0 < d.y + d.d && h.y1 > d.y))) {
      prims.push({ type: 'box', mat: 'deck', ...boxFrom(c.x0, c.y0, -0.02, c.x1 - c.x0, c.y1 - c.y0, 0.07), shadow: 'receive', fl: 0 });
    }
  }
  for (const p of pools) {
    const k = 0.3; // borde de piedra
    prims.push({ type: 'box', mat: 'coping', ...boxFrom(p.x - k, p.y - k, 0, p.w + 2 * k, k, 0.06), fl: 0 });
    prims.push({ type: 'box', mat: 'coping', ...boxFrom(p.x - k, p.y + p.d, 0, p.w + 2 * k, k, 0.06), fl: 0 });
    prims.push({ type: 'box', mat: 'coping', ...boxFrom(p.x - k, p.y, 0, k, p.d, 0.06), fl: 0 });
    prims.push({ type: 'box', mat: 'coping', ...boxFrom(p.x + p.w, p.y, 0, k, p.d, 0.06), fl: 0 });
    prims.push({ type: 'box', mat: 'poolTile', ...boxFrom(p.x, p.y, -p.prof - 0.1, p.w, p.d, 0.1), fl: 0, shadow: 'receive' });
    for (const [x, y, w, d] of [[p.x, p.y, p.w, 0.02], [p.x, p.y + p.d - 0.02, p.w, 0.02], [p.x, p.y, 0.02, p.d], [p.x + p.w - 0.02, p.y, 0.02, p.d]]) {
      prims.push({ type: 'box', mat: 'poolTile', ...boxFrom(x, y, -p.prof, w, d, p.prof), fl: 0, shadow: 'receive' });
    }
    prims.push({ type: 'box', mat: 'water', ...boxFrom(p.x + 0.02, p.y + 0.02, -0.16, p.w - 0.04, p.d - 0.04, 0.02), fl: 0, shadow: 'none' });
    if (m.muebles !== false) for (const q of poolside(p, decks)) prims.push({ ...q, fl: 0 });
  }
  if (m.muebles !== false) {
    const avoid = [...m.rooms.map((r) => ({ x0: r.x - t, x1: r.x + r.w + t, y0: r.y - t, y1: r.y + r.d + t })), ...ext.map((e) => ({ x0: e.x - 0.4, x1: e.x + e.w + 0.4, y0: e.y - 0.4, y1: e.y + e.d + 0.4 }))];
    for (const q of landscaping(G, avoid)) prims.push({ ...q, fl: 0 });
  }

  for (let f = 1; f <= m.pisos; f++) {
    const rooms = roomsOf(m, f);
    const openings = openingsOf(m, f);
    const base = (f - 1) * H;
    const b = box(rooms, t);
    if (f === 1) prims.push({ type: 'box', mat: 'slab', ...boxFrom(b.minX, b.minY, -0.05, b.maxX - b.minX, b.maxY - b.minY, 0.05), fl: 1 });
    for (const r of rooms) {
      // Losa sobre cada piso (techo del piso / piso del siguiente) y acabado del piso.
      prims.push({ type: 'box', mat: 'slab', ...boxFrom(r.x - t / 2, r.y - t / 2, base + wallH, r.w + t, r.d + t, m.losa), fl: f, layer: 'ceiling' });
      prims.push({ type: 'box', mat: floorMaterial(r.nombre), ...boxFrom(r.x + t / 2, r.y + t / 2, base, r.w - t, r.d - t, 0.015), fl: f, shadow: 'receive' });
      if (m.muebles !== false) for (const q of furnishRoom(r, openings, t, base + 0.015)) prims.push({ ...q, fl: f });
    }

    const insideAny = (x, y) => rooms.some((r) => x > r.x + 1e-9 && x < r.x + r.w - 1e-9 && y > r.y + 1e-9 && y < r.y + r.d - 1e-9);
    // Muros: un solo tramo por línea compartida entre recintos.
    const lines = new Map();
    const add = (key, a, c) => {
      if (!lines.has(key)) lines.set(key, []);
      lines.get(key).push([a, c]);
    };
    for (const r of rooms) {
      add(`H|${r.y}`, r.x, r.x + r.w);
      add(`H|${r.y + r.d}`, r.x, r.x + r.w);
      add(`V|${r.x}`, r.y, r.y + r.d);
      add(`V|${r.x + r.w}`, r.y, r.y + r.d);
    }
    const ops = openings.map((o) => ({ o, g: openingGeom(o) }));
    for (const [key, list] of lines) {
      const [dir, posS] = key.split('|');
      const pos = Number(posS);
      const horiz = dir === 'H';
      for (const [a, c] of mergeIntervals(list)) {
        const here = ops
          .filter(({ g }) => g.horiz === horiz && Math.abs(g.at - pos) < 1e-6 && g.a0 >= a - 1e-6 && g.a1 <= c + 1e-6)
          .sort((p, q) => p.g.a0 - q.g.a0);
        // Cara de cada lado: pintura interior si da a un recinto, fachada si da afuera.
        const faceAt = (s0, s1, side) => {
          const mid = (s0 + s1) / 2, off = t / 2 + 0.05;
          const inside = horiz ? insideAny(mid, pos + side * off) : insideAny(pos + side * off, mid);
          return inside ? 'paint' : 'wall';
        };
        // Tramos llenos entre vanos; sobre y bajo cada vano, dinteles y antepechos.
        const piece = (s0, s1, z0, z1, mat = 'wall', thick = t) => {
          if (s1 - s0 < 1e-6 || z1 - z0 < 1e-6) return;
          const prim = horiz
            ? { type: 'box', mat, ...boxFrom(s0, pos - thick / 2, z0, s1 - s0, thick, z1 - z0), fl: f }
            : { type: 'box', mat, ...boxFrom(pos - thick / 2, s0, z0, thick, s1 - s0, z1 - z0), fl: f };
          if (mat === 'wall') {
            const lo = faceAt(s0, s1, -1), hi = faceAt(s0, s1, 1);
            prim.faces = horiz ? { s: lo, n: hi, top: 'wallTop' } : { w: lo, e: hi, top: 'wallTop' };
          }
          prims.push(prim);
        };
        let cursor = a - t / 2;
        for (const { o, g } of here) {
          piece(cursor, g.a0, base, base + wallH);
          const z0 = base + o.antepecho, z1 = Math.min(base + wallH, z0 + o.alto);
          piece(g.a0, g.a1, base, z0);
          piece(g.a0, g.a1, z1, base + wallH);
          if (o.tipo === 'ventana') {
            piece(g.a0, g.a1, z0, z1, 'glass', 0.03);
            // Marco de la ventana.
            piece(g.a0, g.a1, z0 - 0.02, z0 + 0.04, 'frame', t + 0.04);
            piece(g.a0, g.a1, z1 - 0.04, z1, 'frame', 0.08);
            piece(g.a0, g.a0 + 0.05, z0, z1, 'frame', 0.08);
            piece(g.a1 - 0.05, g.a1, z0, z1, 'frame', 0.08);
          } else {
            // Puerta entreabierta: hoja girada 70° hacia el interior del recinto.
            const leaf = 0.04, wdt = g.a1 - g.a0, h = z1 - z0;
            const ang = (70 * Math.PI) / 180;
            const hx = horiz ? g.a0 : pos, hy = horiz ? pos : g.a0;
            const along = horiz ? [1, 0] : [0, 1], into = horiz ? [0, g.inward] : [g.inward, 0];
            const dx = Math.cos(ang) * along[0] + Math.sin(ang) * into[0], dy = Math.cos(ang) * along[1] + Math.sin(ang) * into[1];
            prims.push({ type: 'box', mat: 'door', x: hx + (dx * wdt) / 2, y: hy + (dy * wdt) / 2, z: z0 + h / 2, w: wdt, d: leaf, h, rot: Math.atan2(dy, dx), fl: f });
            piece(g.a0, g.a0 + 0.05, z0, z1, 'frame', t + 0.02);
            piece(g.a1 - 0.05, g.a1, z0, z1, 'frame', t + 0.02);
            piece(g.a0, g.a1, z1 - 0.05, z1, 'frame', t + 0.02);
          }
          cursor = g.a1;
        }
        piece(cursor, c + t / 2, base, base + wallH);
      }
    }
  }

  // Cubierta sobre el último piso.
  const top = m.pisos * H;
  const b = box(roomsOf(m, m.pisos), t);
  const x0 = b.minX - OVER, x1 = b.maxX + OVER, y0 = b.minY - OVER, y1 = b.maxY + OVER;
  const rh = m.techo.altura || 1;
  const R = { layer: 'roof', fl: m.pisos };
  if (m.techo.tipo === 'plano') {
    const p = 0.3, e = 0.12;
    prims.push({ type: 'box', mat: 'wall', role: 'parapet', ...R, ...boxFrom(b.minX, b.minY, top, b.maxX - b.minX, e, p) });
    prims.push({ type: 'box', mat: 'wall', role: 'parapet', ...R, ...boxFrom(b.minX, b.maxY - e, top, b.maxX - b.minX, e, p) });
    prims.push({ type: 'box', mat: 'wall', role: 'parapet', ...R, ...boxFrom(b.minX, b.minY, top, e, b.maxY - b.minY, p) });
    prims.push({ type: 'box', mat: 'wall', role: 'parapet', ...R, ...boxFrom(b.maxX - e, b.minY, top, e, b.maxY - b.minY, p) });
  } else if (m.techo.tipo === 'dos aguas') {
    const ym = (b.minY + b.maxY) / 2, zr = top + rh;
    // Pendiente prolongada hasta el alero.
    const drop = (rh * OVER) / (ym - b.minY);
    const ze = top - drop;
    prims.push({ type: 'mesh', mat: 'roof', double: true, ...R, positions: [
      ...tri([x0, y0, ze], [x1, y0, ze], [x1, ym, zr]), ...tri([x0, y0, ze], [x1, ym, zr], [x0, ym, zr]),
      ...tri([x0, ym, zr], [x1, ym, zr], [x1, y1, ze]), ...tri([x0, ym, zr], [x1, y1, ze], [x0, y1, ze]),
    ] });
    for (const x of [b.minX, b.maxX]) {
      prims.push({ type: 'mesh', mat: 'gable', double: true, ...R, positions: tri([x, b.minY, top], [x, b.maxY, top], [x, ym, zr]) });
    }
  } else {
    // Un agua: baja hacia el sur.
    const slope = rh / (b.maxY - b.minY);
    const zs = top - slope * OVER, zn = top + rh + slope * OVER;
    prims.push({ type: 'mesh', mat: 'roof', double: true, ...R, positions: [
      ...tri([x0, y0, zs], [x1, y0, zs], [x1, y1, zn]), ...tri([x0, y0, zs], [x1, y1, zn], [x0, y1, zn]),
    ] });
    for (const x of [b.minX, b.maxX]) {
      prims.push({ type: 'mesh', mat: 'gable', double: true, ...R, positions: tri([x, b.minY, top], [x, b.maxY, top], [x, b.maxY, top + rh]) });
    }
  }
  return { prims, unit: 'm', pisos: m.pisos, focus: { minX: all.minX, maxX: all.maxX, minY: all.minY, maxY: all.maxY, maxZ: top + (m.techo.tipo === 'plano' ? 0.3 : rh) } };
}

/** Parte un rectángulo en celdas que no tocan los huecos (rectángulos interiores). */
function splitAround(G, holes) {
  if (!holes.length) return [G];
  const cx = (v) => Math.min(G.x1, Math.max(G.x0, v)), cy = (v) => Math.min(G.y1, Math.max(G.y0, v));
  const xs = [...new Set([G.x0, G.x1, ...holes.flatMap((h) => [cx(h.x0), cx(h.x1)])])].sort((a, b) => a - b);
  const ys = [...new Set([G.y0, G.y1, ...holes.flatMap((h) => [cy(h.y0), cy(h.y1)])])].sort((a, b) => a - b);
  const cells = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const c = { x0: xs[i], x1: xs[i + 1], y0: ys[j], y1: ys[j + 1] };
      const mx = (c.x0 + c.x1) / 2, my = (c.y0 + c.y1) / 2;
      if (c.x1 - c.x0 > 1e-6 && c.y1 - c.y0 > 1e-6 && !holes.some((h) => mx > h.x0 && mx < h.x1 && my > h.y0 && my < h.y1)) cells.push(c);
    }
  }
  return cells;
}

// ---------------------------------------------------------------- Pieza

function piezaSpec(m) {
  const prims = [];
  let size = 0;
  for (const s of m.solids) size = Math.max(size, s.h, s.w ?? s.r * 2, s.d ?? s.r * 2);
  const eps = Math.max(0.05, size * 0.002);
  for (const s of m.solids) {
    if (s.tipo === 'bloque') prims.push({ type: 'box', mat: 'metal', ...boxFrom(s.x, s.y, s.z, s.w, s.d, s.h) });
    else prims.push({ type: 'cyl', mat: 'metal', x: s.x, y: s.y, z: s.z, r: s.r, h: s.h });
  }
  // Sin operaciones booleanas: los vaciados se ven como superficies oscuras
  // apenas por encima de las caras que atraviesan.
  for (const c of m.cuts) {
    if (c.tipo === 'agujero') prims.push({ type: 'cyl', mat: 'hole', x: c.x, y: c.y, z: c.z0 - eps, r: c.r, h: c.z1 - c.z0 + 2 * eps, shadow: 'none' });
    else prims.push({ type: 'box', mat: 'hole', ...boxFrom(c.x, c.y, c.z0 - eps, c.w, c.d, c.z1 - c.z0 + 2 * eps), shadow: 'none' });
  }
  return { prims, unit: m.unidad };
}

// -------------------------------------------------------------- Terreno

function terrenoSpec(m) {
  const prims = [];
  const pts = m.vertices.map((v) => [v.x, v.y]);
  const b = bbox(pts);
  const h = heightField(m);
  const zs = [...m.vertices, ...m.spots].map((v) => v.z);
  const zmin = Math.min(...zs), zmax = Math.max(...zs);
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const relief = zmax - zmin;
  // Exageración vertical moderada para que el relieve se note.
  const ex = relief < 1e-6 ? 1 : Math.max(1, Math.min(4, Math.round((span * 0.12) / relief)));
  const base = -Math.max(1, relief * ex * 0.25);
  const Z = (z) => (z - zmin) * ex;

  const n = 90;
  const step = span / n;
  const nx = Math.ceil((b.maxX - b.minX) / step) + 1;
  const ny = Math.ceil((b.maxY - b.minY) / step) + 1;
  const positions = [], colors = [];
  const color = (z) => {
    const k = relief < 1e-6 ? 0.3 : (z - zmin) / relief;
    // Verde en lo bajo, ocre en lo alto.
    return [0.48 + 0.32 * k, 0.62 - 0.06 * k, 0.38 - 0.08 * k];
  };
  const vtx = (x, y) => {
    const z = h(x, y);
    positions.push(x, y, Z(z));
    colors.push(...color(z));
  };
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const x0 = b.minX + i * step, y0 = b.minY + j * step;
      const quads = [[[x0, y0], [x0 + step, y0], [x0 + step, y0 + step]], [[x0, y0], [x0 + step, y0 + step], [x0, y0 + step]]];
      for (const q of quads) {
        const cx = (q[0][0] + q[1][0] + q[2][0]) / 3, cy = (q[0][1] + q[1][1] + q[2][1]) / 3;
        if (pointInPolygon(cx, cy, pts)) for (const [x, y] of q) vtx(x, y);
      }
    }
  }
  prims.push({ type: 'mesh', mat: 'terrain', positions, colors, shadow: 'receive' });

  // Faldón: los linderos bajan hasta una base, como una maqueta.
  const skirt = [];
  const border = [];
  pts.forEach((a, i) => {
    const c = pts[(i + 1) % pts.length];
    const L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const k = Math.max(2, Math.ceil(L / step));
    for (let s = 0; s < k; s++) {
      const p = [a[0] + ((c[0] - a[0]) * s) / k, a[1] + ((c[1] - a[1]) * s) / k];
      const q = [a[0] + ((c[0] - a[0]) * (s + 1)) / k, a[1] + ((c[1] - a[1]) * (s + 1)) / k];
      const zp = Z(h(...p)), zq = Z(h(...q));
      skirt.push(...tri([p[0], p[1], base], [q[0], q[1], base], [q[0], q[1], zq]), ...tri([p[0], p[1], base], [q[0], q[1], zq], [p[0], p[1], zp]));
      border.push([p[0], p[1], zp + 0.05]);
    }
  });
  border.push(border[0]);
  prims.push({ type: 'mesh', mat: 'skirt', double: true, positions: skirt });
  prims.push({ type: 'line', mat: 'line', points: border });

  for (const c of m.construcciones) {
    const corners = [[c.x, c.y], [c.x + c.w, c.y], [c.x, c.y + c.d], [c.x + c.w, c.y + c.d]];
    const ground = Math.max(...corners.map(([x, y]) => Z(h(x, y))));
    const pool = /piscina|alberca|estanque/i.test(c.nombre);
    if (pool) prims.push({ type: 'box', mat: 'water', ...boxFrom(c.x, c.y, ground - 0.2, c.w, c.d, 0.25) });
    else {
      const foot = Math.min(...corners.map(([x, y]) => Z(h(x, y))));
      prims.push({ type: 'box', mat: 'build', ...boxFrom(c.x, c.y, foot - 0.2, c.w, c.d, ground - foot + 0.2 + 3) });
    }
  }
  return { prims, unit: 'm', exaggeration: ex };
}

// ------------------------------------------------------------- Comunes

function boxFrom(x, y, z, w, d, h) {
  return { x: x + w / 2, y: y + d / 2, z: z + h / 2, w, d, h };
}

function tri(a, b, c) {
  return [...a, ...b, ...c];
}

/** Primitivas 3D del modelo, sin depender de three.js. */
export function sceneSpec(model) {
  if (model.tipo === 'edificio') return edificioSpec(model);
  if (model.tipo === 'pieza') return piezaSpec(model);
  return terrenoSpec(model);
}

// ------------------------------------------------------------ three.js

function loadScript(src) {
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => fail(new Error(`No se pudo cargar ${src}`));
    document.head.append(s);
  });
}

let threePromise = null;
function loadThree() {
  threePromise ??= (async () => {
    if (!window.THREE) await loadScript(THREE_URL);
    const T = window.THREE;
    const have = {
      'controls/OrbitControls.js': () => T.OrbitControls,
      'environments/RoomEnvironment.js': () => T.RoomEnvironment,
    };
    for (const a of ADDONS) {
      if (have[a]()) continue;
      try { await loadScript(EX + a); } catch (e) { if (a.startsWith('controls')) throw e; }
    }
    return T;
  })();
  return threePromise;
}

// ------------------------------------------------- Texturas procedurales

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function canvas(n) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return [c, c.getContext('2d')];
}

function noise(ctx, n, amount, r) {
  const img = ctx.getImageData(0, 0, n, n);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (r() - 0.5) * amount;
    img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v;
  }
  ctx.putImageData(img, 0, 0);
}

const TEXTURES = {
  parquet(ctx, n, r) {
    // 12 tablas de ~20 cm por 2.4 m, juntas desfasadas.
    const rows = 12, h = n / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * n;
      while (x < n) {
        const L = n * (0.35 + r() * 0.3);
        const tone = 0.85 + r() * 0.3;
        ctx.fillStyle = `rgb(${Math.round(150 * tone)},${Math.round(98 * tone)},${Math.round(58 * tone)})`;
        ctx.fillRect(x, i * h, L, h);
        ctx.strokeStyle = 'rgba(60,35,15,0.18)';
        for (let k = 0; k < 6; k++) {
          ctx.beginPath();
          const y = i * h + r() * h;
          ctx.moveTo(x, y);
          ctx.bezierCurveTo(x + L * 0.3, y + (r() - 0.5) * 4, x + L * 0.6, y + (r() - 0.5) * 4, x + L, y + (r() - 0.5) * 3);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(40,22,10,0.55)';
        ctx.fillRect(x, i * h, 1.5, h);
        x += L;
      }
      ctx.fillStyle = 'rgba(40,22,10,0.5)';
      ctx.fillRect(0, i * h, n, 1.5);
    }
    noise(ctx, n, 14, r);
  },
  woodGrain(ctx, n, r) {
    ctx.fillStyle = '#b9b9b9';
    ctx.fillRect(0, 0, n, n);
    for (let k = 0; k < 90; k++) {
      ctx.strokeStyle = `rgba(0,0,0,${0.04 + r() * 0.08})`;
      ctx.lineWidth = 1 + r() * 2;
      ctx.beginPath();
      const y = r() * n;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(n * 0.3, y + (r() - 0.5) * 20, n * 0.7, y + (r() - 0.5) * 20, n, y);
      ctx.stroke();
    }
    noise(ctx, n, 10, r);
  },
  tiles(ctx, n, r) {
    const k = 2, s = n / k;
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
      const v = 228 + r() * 14;
      ctx.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
      ctx.fillRect(i * s, j * s, s, s);
      ctx.strokeStyle = 'rgba(150,140,120,0.25)';
      for (let q = 0; q < 5; q++) {
        ctx.beginPath();
        ctx.moveTo(i * s + r() * s, j * s);
        ctx.bezierCurveTo(i * s + r() * s, j * s + s * 0.3, i * s + r() * s, j * s + s * 0.7, i * s + r() * s, j * s + s);
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#b8b0a2';
    for (let i = 0; i <= k; i++) { ctx.fillRect(i * s - 1.5, 0, 3, n); ctx.fillRect(0, i * s - 1.5, n, 3); }
    noise(ctx, n, 6, r);
  },
  tilesWarm(ctx, n, r) {
    const k = 3, s = n / k;
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
      const v = 0.92 + r() * 0.1;
      ctx.fillStyle = `rgb(${Math.round(232 * v)},${Math.round(218 * v)},${Math.round(196 * v)})`;
      ctx.fillRect(i * s, j * s, s, s);
    }
    ctx.fillStyle = '#9c8f7c';
    for (let i = 0; i <= k; i++) { ctx.fillRect(i * s - 1.5, 0, 3, n); ctx.fillRect(0, i * s - 1.5, n, 3); }
    noise(ctx, n, 8, r);
  },
  concrete(ctx, n, r) {
    ctx.fillStyle = '#a9a7a2';
    ctx.fillRect(0, 0, n, n);
    noise(ctx, n, 26, r);
  },
  grass(ctx, n, r) {
    ctx.fillStyle = '#4f8a2e';
    ctx.fillRect(0, 0, n, n);
    for (let k = 0; k < 9000; k++) {
      const g = 90 + r() * 80;
      ctx.strokeStyle = `rgba(${Math.round(g * 0.45)},${Math.round(g)},${Math.round(g * 0.3)},0.7)`;
      ctx.beginPath();
      const x = r() * n, y = r() * n;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 6);
      ctx.stroke();
    }
    noise(ctx, n, 16, r);
  },
  deck(ctx, n, r) {
    const rows = 16, h = n / rows;
    for (let i = 0; i < rows; i++) {
      const tone = 0.88 + r() * 0.24;
      ctx.fillStyle = `rgb(${Math.round(176 * tone)},${Math.round(122 * tone)},${Math.round(78 * tone)})`;
      ctx.fillRect(0, i * h, n, h);
      ctx.strokeStyle = 'rgba(70,40,20,0.15)';
      for (let k = 0; k < 5; k++) {
        const y = i * h + r() * h;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(n, y + (r() - 0.5) * 3); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(45,25,10,0.7)';
      ctx.fillRect(0, i * h, n, 2);
    }
    noise(ctx, n, 12, r);
  },
  stone(ctx, n, r) {
    ctx.fillStyle = '#e9e3d6';
    ctx.fillRect(0, 0, n, n);
    noise(ctx, n, 18, r);
    ctx.fillStyle = 'rgba(120,110,95,0.5)';
    ctx.fillRect(0, 0, n, 2);
    ctx.fillRect(0, 0, 2, n);
  },
  mosaic(ctx, n, r) {
    const k = 12, s = n / k;
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
      const v = r();
      ctx.fillStyle = `rgb(${Math.round(70 + v * 40)},${Math.round(170 + v * 40)},${Math.round(205 + v * 30)})`;
      ctx.fillRect(i * s, j * s, s, s);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i <= k; i++) { ctx.fillRect(i * s - 1, 0, 2, n); ctx.fillRect(0, i * s - 1, n, 2); }
  },
  marble(ctx, n, r) {
    ctx.fillStyle = '#f2efe9';
    ctx.fillRect(0, 0, n, n);
    for (let k = 0; k < 14; k++) {
      ctx.strokeStyle = `rgba(150,140,130,${0.15 + r() * 0.2})`;
      ctx.lineWidth = 0.5 + r() * 1.5;
      ctx.beginPath();
      let x = r() * n, y = 0;
      ctx.moveTo(x, y);
      while (y < n) { x += (r() - 0.5) * 40; y += 20 + r() * 30; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  },
  roofTiles(ctx, n, r) {
    const rows = 6, h = n / rows, cols = 5, w = n / cols;
    for (let i = 0; i < rows; i++) for (let j = 0; j <= cols; j++) {
      const tone = 0.85 + r() * 0.25;
      const x = j * w - (i % 2 ? w / 2 : 0);
      const g = ctx.createLinearGradient(0, i * h, 0, (i + 1) * h);
      g.addColorStop(0, `rgb(${Math.round(150 * tone)},${Math.round(70 * tone)},${Math.round(45 * tone)})`);
      g.addColorStop(1, `rgb(${Math.round(190 * tone)},${Math.round(95 * tone)},${Math.round(60 * tone)})`);
      ctx.fillStyle = g;
      ctx.fillRect(x + 1, i * h, w - 2, h - 2);
    }
    noise(ctx, n, 10, r);
  },
  rug(ctx, n) {
    ctx.fillStyle = '#d9c7a6';
    ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = '#efe6d2';
    ctx.fillRect(n * 0.12, n * 0.12, n * 0.76, n * 0.76);
    ctx.strokeStyle = '#3d4a63';
    ctx.lineWidth = n * 0.03;
    ctx.strokeRect(n * 0.06, n * 0.06, n * 0.88, n * 0.88);
    ctx.lineWidth = n * 0.008;
    ctx.strokeRect(n * 0.12, n * 0.12, n * 0.76, n * 0.76);
    ctx.fillStyle = '#b5523b';
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      ctx.beginPath();
      const x = n * (0.22 + i * 0.112), y = n * (0.22 + j * 0.112);
      ctx.moveTo(x, y - n * 0.02); ctx.lineTo(x + n * 0.02, y); ctx.lineTo(x, y + n * 0.02); ctx.lineTo(x - n * 0.02, y);
      ctx.fill();
    }
    ctx.strokeStyle = '#3d4a63';
    ctx.lineWidth = n * 0.01;
    ctx.beginPath(); ctx.ellipse(n / 2, n / 2, n * 0.16, n * 0.12, 0, 0, Math.PI * 2); ctx.stroke();
  },
};

function makeTexture(THREE, name, renderer) {
  const n = name === 'grass' ? 512 : 1024;
  const [c, ctx] = canvas(n);
  TEXTURES[name](ctx, n, rng(name.length * 97 + 13));
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.encoding = THREE.sRGBEncoding;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

/** Ajusta las UV de una caja para que la textura quede a escala real. */
function scaleBoxUV(geo, w, h, d, tile) {
  const uv = geo.attributes.uv;
  // Caras de BoxGeometry: +x, −x, +y, −y, +z, −z (4 vértices cada una).
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = sizes[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * su) / tile, (uv.getY(i) * sv) / tile);
    }
  }
  uv.needsUpdate = true;
}

function toThree(spec, THREE, renderer, envMap) {
  const group = new THREE.Group();
  const mats = {};
  const textures = {};
  const material = (name, double) => {
    const key = name + (double ? ':2' : '');
    if (!mats[key]) {
      const p = MATERIALS[name] || MATERIALS.wall;
      if (name === 'line') {
        mats[key] = new THREE.LineBasicMaterial({ color: p.color });
      } else {
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(p.color).convertSRGBToLinear(),
          roughness: p.roughness ?? 0.8,
          metalness: p.metalness ?? 0,
          vertexColors: !!p.vertexColors,
          transparent: p.opacity !== undefined,
          opacity: p.opacity ?? 1,
          side: double ? THREE.DoubleSide : THREE.FrontSide,
          envMapIntensity: p.metalness ? 1 : 0.3,
        });
        if (p.opacity !== undefined) mat.depthWrite = false;
        if (p.emissive) {
          mat.emissive = new THREE.Color(p.emissive).convertSRGBToLinear();
          mat.emissiveIntensity = p.emissiveIntensity ?? 1;
        }
        if (p.tex) mat.map = textures[p.tex] ??= makeTexture(THREE, p.tex, renderer);
        if (envMap) mat.envMap = envMap;
        mats[key] = mat;
      }
    }
    return mats[key];
  };
  const SIDE_INDEX = { e: 0, w: 1, top: 2, bottom: 3, s: 4, n: 5 };
  // Modelo (x, y, z) → three (x, z, -y).
  for (const p of spec.prims) {
    let obj;
    if (p.type === 'box') {
      const geo = new THREE.BoxGeometry(p.w, p.h, p.d);
      const tile = MATERIALS[p.mat]?.tile;
      if (MATERIALS[p.mat]?.tex) scaleBoxUV(geo, p.w, p.h, p.d, tile || Math.max(p.w, p.d));
      let mat = material(p.mat);
      if (p.faces) {
        mat = Array.from({ length: 6 }, () => material(p.mat));
        for (const [k, v] of Object.entries(p.faces)) mat[SIDE_INDEX[k]] = material(v);
      }
      obj = new THREE.Mesh(geo, mat);
      obj.position.set(p.x, p.z, -p.y);
      if (p.rot) obj.rotation.y = p.rot;
    } else if (p.type === 'cyl') {
      const r2 = p.r2 ?? p.r;
      obj = new THREE.Mesh(new THREE.CylinderGeometry(r2, p.r, p.h, p.r > 0.3 ? 64 : 24), material(p.mat));
      if (p.axis === 'x') { obj.rotation.z = Math.PI / 2; obj.position.set(p.x, p.z, -p.y); }
      else if (p.axis === 'y') { obj.rotation.x = Math.PI / 2; obj.position.set(p.x, p.z, -p.y); }
      else obj.position.set(p.x, p.z + p.h / 2, -p.y);
    } else if (p.type === 'sphere') {
      obj = new THREE.Mesh(new THREE.SphereGeometry(p.r, 20, 14), material(p.mat));
      obj.position.set(p.x, p.z, -p.y);
      obj.scale.set(p.sx ?? 1, p.sz ?? 1, p.sy ?? 1);
      if (p.yaw !== undefined) {
        obj.rotation.order = 'YZX';
        obj.rotation.y = p.yaw;
        obj.rotation.z = -(p.pitch || 0);
      }
    } else if (p.type === 'mesh') {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(p.positions.length);
      for (let i = 0; i < p.positions.length; i += 3) {
        pos[i] = p.positions[i];
        pos[i + 1] = p.positions[i + 2];
        pos[i + 2] = -p.positions[i + 1];
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      // Colores por vértice en sRGB → lineales (la salida vuelve a sRGB).
      if (p.colors) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.colors.map((c) => Math.pow(c, 2.2))), 3));
      if (MATERIALS[p.mat]?.tex) {
        // Proyección en planta (x, y del modelo) para tejas y similares.
        const tile = MATERIALS[p.mat].tile || 1;
        const uv = new Float32Array((p.positions.length / 3) * 2);
        for (let i = 0, j = 0; i < p.positions.length; i += 3, j += 2) {
          uv[j] = p.positions[i] / tile;
          uv[j + 1] = (p.positions[i + 1] + p.positions[i + 2]) / tile;
        }
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      }
      g.computeVertexNormals();
      obj = new THREE.Mesh(g, material(p.mat, p.double));
    } else if (p.type === 'line') {
      const g = new THREE.BufferGeometry().setFromPoints(p.points.map(([x, y, z]) => new THREE.Vector3(x, z, -y)));
      obj = new THREE.Line(g, material('line'));
    }
    if (obj.isMesh) {
      const transparent = MATERIALS[p.mat]?.opacity !== undefined;
      obj.castShadow = p.shadow !== 'receive' && p.shadow !== 'none' && !transparent;
      obj.receiveShadow = p.shadow !== 'none';
    }
    obj.userData = { fl: p.fl, layer: p.layer };
    group.add(obj);
  }
  group.userData.textures = textures;
  group.userData.materials = mats;
  return group;
}

// ---------------------------------------------------------------- Vistas

/** ¿Se ve esta pieza con el modo elegido? (con techo: todo; sin techo: hasta el piso). */
export function visibleIn(view, ud) {
  if (view.roof || ud.fl === undefined) return true;
  if (ud.layer === 'roof') return false;
  if (ud.fl > view.floor) return false;
  if (ud.fl === view.floor && ud.layer === 'ceiling') return false;
  return true;
}

/**
 * Monta el render en `container`. Devuelve { dispose, toBlob, setModel }.
 */
export async function mount3d(container, model) {
  const THREE = await loadThree();
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.physicallyCorrectLights = false;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  const sky = new THREE.Color(0xe9eef2).convertSRGBToLinear();
  scene.background = sky;
  let envMap = null;
  if (THREE.RoomEnvironment) {
    const pm = new THREE.PMREMGenerator(renderer);
    envMap = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;
  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x8f7d62, envMap ? 0.45 : 0.8));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.normalBias = 0.02;
  sun.shadow.bias = -0.0002;
  scene.add(sun, sun.target);

  // Barra de vistas.
  const bar = document.createElement('div');
  bar.className = 'r3d-bar';
  container.append(bar);
  const view = { roof: false, floor: 1 };
  let pisos = 1, isBuilding = false, lastTipo = null;

  let group = null;
  let focus = null;
  let dirty = true;
  const requestRender = () => { dirty = true; };
  controls.addEventListener('change', requestRender);

  function applyView() {
    if (!group) return;
    group.traverse((o) => {
      if (o.isMesh || o.isLine) o.visible = visibleIn(view, o.userData);
    });
    renderBar();
    requestRender();
  }

  function frame(kind) {
    const { center, radius } = focus;
    // Distancia para que el modelo quepa en el encuadre.
    const fit = (radius / Math.sin((camera.fov * Math.PI) / 360)) * Math.max(1, 1 / camera.aspect) * 0.98;
    const dir = kind === 'top' ? [0, 1, 0.002] : kind === 'front' ? [0, 0.32, 1] : [-0.5, 1.15, 0.75];
    const k = fit / Math.hypot(...dir);
    camera.position.set(center.x + dir[0] * k, center.y + dir[1] * k, center.z + dir[2] * k);
    controls.target.copy(center);
    controls.update();
    requestRender();
  }

  function renderBar() {
    bar.replaceChildren();
    const btn = (label, on, fn, title) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (title) b.title = title;
      b.setAttribute('aria-pressed', String(!!on));
      b.addEventListener('click', fn);
      bar.append(b);
      return b;
    };
    if (isBuilding) {
      btn('Con techo', view.roof, () => { view.roof = true; applyView(); });
      btn('Sin techo', !view.roof, () => { view.roof = false; applyView(); }, 'Corte como maqueta, sin techo');
      if (pisos > 1 && !view.roof) {
        const sel = document.createElement('select');
        sel.setAttribute('aria-label', 'Piso');
        for (let f = 1; f <= pisos; f++) {
          const o = document.createElement('option');
          o.value = f;
          o.textContent = `Piso ${f}`;
          sel.append(o);
        }
        sel.value = view.floor;
        sel.addEventListener('change', () => { view.floor = Number(sel.value); applyView(); });
        bar.append(sel);
      }
      const sep = document.createElement('span');
      sep.className = 'sep';
      bar.append(sep);
    }
    btn('3/4', false, () => frame('iso'), 'Vista de tres cuartos');
    btn('Planta', false, () => frame('top'), 'Vista desde arriba');
    btn('Frente', false, () => frame('front'), 'Vista desde el sur');
  }

  function setModel(m) {
    if (group) {
      scene.remove(group);
      group.traverse((o) => { o.geometry?.dispose(); });
      Object.values(group.userData.materials || {}).forEach((mt) => mt.dispose());
      Object.values(group.userData.textures || {}).forEach((tx) => tx.dispose());
    }
    const spec = sceneSpec(m);
    group = toThree(spec, THREE, renderer, envMap);
    scene.add(group);
    isBuilding = m.tipo === 'edificio';
    pisos = spec.pisos || 1;
    if (view.floor > pisos) view.floor = pisos;
    const bb = new THREE.Box3();
    if (spec.focus) {
      const f = spec.focus;
      bb.set(new THREE.Vector3(f.minX, 0, -f.maxY), new THREE.Vector3(f.maxX, f.maxZ, -f.minY));
    } else bb.setFromObject(group);
    const size = bb.getSize(new THREE.Vector3());
    const center = bb.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z);
    if (isBuilding) center.y = Math.min(center.y, size.y * 0.3);
    // Se reencuadra si cambia el tipo de proyecto o la escala (p. ej. de mm a m).
    const first = !focus || m.tipo !== lastTipo || r > focus.r * 2 || r < focus.r / 2;
    lastTipo = m.tipo;
    focus = { center, r, radius: size.length() / 2 };
    camera.near = r / 100;
    camera.far = r * 8;
    camera.updateProjectionMatrix();
    controls.maxDistance = r * 8;
    if (first) frame('iso');
    // Sol alto desde el suroeste, con sombras que cubren todo el lote.
    const R = r * 1.2;
    sun.position.set(center.x - R * 0.7, center.y + R * 1.5, center.z + R * 0.9);
    sun.target.position.copy(center);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -R;
    sc.right = sc.top = R;
    sc.near = R * 0.1;
    sc.far = R * 5;
    sc.updateProjectionMatrix();
    applyView();
  }
  setModel(model);

  let W = 1, H = 1;
  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    W = w; H = h;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  const draw = () => renderer.render(scene, camera);
  let raf = 0;
  const loop = () => {
    controls.update();
    if (dirty) {
      dirty = false;
      draw();
    }
    raf = requestAnimationFrame(loop);
  };
  loop();

  return {
    setModel,
    /** PNG en alta resolución (el doble de píxeles de la pantalla). */
    toBlob: () => new Promise((ok) => {
      const pr = renderer.getPixelRatio();
      const hi = Math.min(3, pr * 2);
      renderer.setPixelRatio(hi);
      renderer.setSize(W, H, false);
      draw();
      renderer.domElement.toBlob((blob) => {
        renderer.setPixelRatio(pr);
        resize();
        ok(blob);
      }, 'image/png');
    }),
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      group?.traverse((o) => { o.geometry?.dispose(); });
      envMap?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      bar.remove();
    },
  };
}
