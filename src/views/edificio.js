// Vistas de un edificio: plantas por piso, fachadas sur y este, corte A-A e
// isométrica. Ejes: x hacia el este, y hacia el norte, z hacia arriba.

import { fmt } from '../util.js';

const C30 = Math.cos(Math.PI / 6);
const OVERHANG = 0.4;

/** Habitaciones del piso p; si el piso no tiene propias, repite la planta tipo (piso 1). */
export function roomsOf(m, p) {
  const own = m.rooms.filter((r) => r.piso === p);
  return own.length ? own : m.rooms.filter((r) => r.piso === 1);
}
export function openingsOf(m, p) {
  const own = m.rooms.some((r) => r.piso === p);
  return m.openings.filter((o) => o.piso === (own ? p : 1));
}

export function box(rooms, t = 0) {
  return {
    minX: Math.min(...rooms.map((r) => r.x)) - t / 2,
    maxX: Math.max(...rooms.map((r) => r.x + r.w)) + t / 2,
    minY: Math.min(...rooms.map((r) => r.y)) - t / 2,
    maxY: Math.max(...rooms.map((r) => r.y + r.d)) + t / 2,
  };
}

/** Geometría de un vano sobre su muro: inicio/fin a lo largo y posición del muro. */
export function openingGeom(o) {
  const r = o.room;
  switch (o.lado) {
    case 'S': return { horiz: true, a0: r.x + o.offset, a1: r.x + o.offset + o.ancho, at: r.y, inward: 1 };
    case 'N': return { horiz: true, a0: r.x + o.offset, a1: r.x + o.offset + o.ancho, at: r.y + r.d, inward: -1 };
    case 'O': return { horiz: false, a0: r.y + o.offset, a1: r.y + o.offset + o.ancho, at: r.x, inward: 1 };
    default: return { horiz: false, a0: r.y + o.offset, a1: r.y + o.offset + o.ancho, at: r.x + r.w, inward: -1 };
  }
}

function inside(rooms, x, y) {
  return rooms.some((r) => x > r.x + 1e-9 && x < r.x + r.w - 1e-9 && y > r.y + 1e-9 && y < r.y + r.d - 1e-9);
}

/** ¿El vano da al exterior? Se mira justo al otro lado del muro. */
function isExterior(o, rooms, t) {
  const g = openingGeom(o);
  const mid = (g.a0 + g.a1) / 2;
  const out = g.at - g.inward * t;
  return g.horiz ? !inside(rooms, mid, out) : !inside(rooms, out, mid);
}

const uniq = (arr) => [...new Set(arr.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);

function planView(m, piso, title, cut) {
  const rooms = roomsOf(m, piso);
  const openings = openingsOf(m, piso);
  const t = m.muro;
  const b = box(rooms, t);
  return {
    title,
    kind: 'ortho',
    pad: 22,
    bounds: { minU: b.minX, maxU: b.maxX, minV: b.minY, maxV: b.maxY },
    draw(p) {
      // Piso de cada recinto y muros (poché).
      for (const r of rooms) p.rect(r.x, r.y, r.w, r.d, 'solid');
      for (const r of rooms) {
        p.rect(r.x - t / 2, r.y - t / 2, r.w + t, t, 'wall');
        p.rect(r.x - t / 2, r.y + r.d - t / 2, r.w + t, t, 'wall');
        p.rect(r.x - t / 2, r.y - t / 2, t, r.d + t, 'wall');
        p.rect(r.x + r.w - t / 2, r.y - t / 2, t, r.d + t, 'wall');
      }
      for (const o of openings) {
        const g = openingGeom(o);
        const gap = (cls) => (g.horiz
          ? p.rect(g.a0, g.at - t / 2 - 0.01, g.a1 - g.a0, t + 0.02, cls)
          : p.rect(g.at - t / 2 - 0.01, g.a0, t + 0.02, g.a1 - g.a0, cls));
        gap('solid');
        if (o.tipo === 'ventana') {
          gap('glass');
          if (g.horiz) p.line(g.a0, g.at, g.a1, g.at, 'thin');
          else p.line(g.at, g.a0, g.at, g.a1, 'thin');
        } else {
          // Hoja y abatimiento hacia el interior del recinto.
          const a = o.ancho;
          const hinge = g.horiz ? [g.a0, g.at] : [g.at, g.a0];
          const along = g.horiz ? [1, 0] : [0, 1];
          const into = g.horiz ? [0, g.inward] : [g.inward, 0];
          const leafEnd = [hinge[0] + into[0] * a, hinge[1] + into[1] * a];
          p.line(hinge[0], hinge[1], leafEnd[0], leafEnd[1], 'vis');
          const arc = [];
          for (let i = 0; i <= 16; i++) {
            const th = (i / 16) * (Math.PI / 2);
            arc.push([hinge[0] + a * (Math.cos(th) * along[0] + Math.sin(th) * into[0]), hinge[1] + a * (Math.cos(th) * along[1] + Math.sin(th) * into[1])]);
          }
          p.poly(arc, 'thin', false);
        }
      }
      for (const r of rooms) {
        p.text(r.x + r.w / 2, r.y + r.d / 2, r.nombre.toUpperCase(), { size: 2.4, dy: -1.6, weight: '600', maxW: r.w - t });
        p.text(r.x + r.w / 2, r.y + r.d / 2, `${fmt(r.w * r.d)} m²`, { size: 2, dy: 1.6, cls: 'muted', maxW: r.w - t });
      }
      // Cadenas de cotas: sur (x) y oeste (y), más la total.
      const xs = uniq(rooms.flatMap((r) => [r.x, r.x + r.w]));
      const ys = uniq(rooms.flatMap((r) => [r.y, r.y + r.d]));
      for (let i = 0; i + 1 < xs.length; i++) p.dimH(xs[i], xs[i + 1], b.minY, 8, fmt(xs[i + 1] - xs[i]));
      p.dimH(xs[0], xs[xs.length - 1], b.minY, 15, fmt(xs[xs.length - 1] - xs[0]));
      for (let i = 0; i + 1 < ys.length; i++) p.dimV(ys[i], ys[i + 1], b.minX, -8, fmt(ys[i + 1] - ys[i]));
      p.dimV(ys[0], ys[ys.length - 1], b.minX, -15, fmt(ys[ys.length - 1] - ys[0]));

      if (cut) {
        // Línea de corte A-A (vertical, mirando al oeste).
        p.axis(cut.x, b.minY, cut.x, b.maxY, 6);
        for (const v of [b.minY, b.maxY]) {
          const dir = v === b.minY ? 1 : -1;
          p.text(cut.x, v, 'A', { size: 3, weight: '700', dx: -3.5, dy: 7 * dir, cls: 'dimtxt' });
          const x = p.X(cut.x), y = p.Y(v) + 6.5 * dir;
          p.raw(`<polygon class="dimfill" points="${x},${y} ${x - 2.4},${y - 0.9} ${x - 2.4},${y + 0.9}"/>`);
        }
      }
      // Norte.
      const nx = p.X(b.maxX) + 8, ny = p.Y(b.maxY) - 4;
      p.raw(`<g transform="translate(${nx.toFixed(2)},${ny.toFixed(2)})"><polygon class="dimfill" points="0,-4 2,3 0,1.6 -2,3"/><text x="0" y="-6" font-size="2.6" text-anchor="middle" font-weight="700">N</text></g>`);
    },
  };
}

/**
 * Fachada desde el sur (u = x) o desde el este (u = y).
 */
function facadeView(m, from) {
  const H = m.altura;
  const t = m.muro;
  const isSouth = from === 'S';
  const ext = (rooms) => {
    const b = box(rooms, t);
    return isSouth ? [b.minX, b.maxX] : [b.minY, b.maxY];
  };
  const floors = Array.from({ length: m.pisos }, (_, i) => i + 1);
  const [u0, u1] = ext(m.rooms);
  const top = m.pisos * H;
  const roofH = m.techo.tipo === 'plano' ? 0.3 : m.techo.altura;
  return {
    title: isSouth ? 'Fachada sur' : 'Fachada este',
    kind: 'ortho',
    pad: 20,
    bounds: { minU: u0 - OVERHANG - 1, maxU: u1 + OVERHANG + 1, minV: -0.3, maxV: top + roofH },
    draw(p) {
      p.rect(u0 - OVERHANG - 1, -0.3, u1 - u0 + 2 * OVERHANG + 2, 0.3, 'groundfill');
      for (const f of floors) {
        const rooms = roomsOf(m, f);
        const [a, b] = ext(rooms);
        const base = (f - 1) * H;
        p.rect(a, base, b - a, H, 'solid');
        p.line(a, base, b, base, 'thin');
        for (const o of openingsOf(m, f)) {
          if (o.lado !== from || !isExterior(o, rooms, t)) continue;
          const g = openingGeom(o);
          const z = base + o.antepecho;
          if (o.tipo === 'ventana') {
            p.rect(g.a0, z, g.a1 - g.a0, o.alto, 'glass');
            p.line((g.a0 + g.a1) / 2, z, (g.a0 + g.a1) / 2, z + o.alto, 'thin');
            p.line(g.a0 - 0.05, z, g.a1 + 0.05, z, 'vis');
          } else {
            p.rect(g.a0, z, g.a1 - g.a0, o.alto, 'build');
            p.line(g.a1 - 0.12, z + o.alto * 0.45, g.a1 - 0.12, z + o.alto * 0.55, 'vis');
          }
        }
      }
      const [a, b] = ext(roomsOf(m, m.pisos));
      if (m.techo.tipo === 'plano') {
        p.rect(a, top, b - a, 0.3, 'roof');
      } else if (m.techo.tipo === 'dos aguas') {
        // Cumbrera paralela a x: el sur ve el faldón, el este ve el hastial.
        if (isSouth) p.poly([[a - OVERHANG, top], [b + OVERHANG, top], [b, top + roofH], [a, top + roofH]], 'roof');
        else p.poly([[a - OVERHANG, top - 0.1], [b + OVERHANG, top - 0.1], [(a + b) / 2, top + roofH]], 'roof');
      } else {
        // Un agua: cae hacia el sur.
        if (isSouth) p.poly([[a - OVERHANG, top], [b + OVERHANG, top], [b + OVERHANG, top + roofH], [a - OVERHANG, top + roofH]], 'roof');
        else p.poly([[a - OVERHANG, top - 0.1], [b + OVERHANG, top + roofH], [b + OVERHANG, top + roofH + 0.15], [a - OVERHANG, top + 0.05]], 'roof');
      }
      p.dimH(u0, u1, -0.3, 7, fmt(u1 - u0));
      p.level(u1 + OVERHANG + 0.6, 0, '±0.00');
      for (const f of floors.slice(1)) p.level(u1 + OVERHANG + 0.6, (f - 1) * H, `+${fmt((f - 1) * H)}`);
      p.level(u1 + OVERHANG + 0.6, top, `+${fmt(top)}`);
      if (roofH > 0.31) p.level(u1 + OVERHANG + 0.6, top + roofH, `+${fmt(top + roofH)}`);
    },
  };
}

/** Corte A-A por el plano x = cut.x, mirando al oeste (u = y). */
function sectionView(m, cut) {
  const H = m.altura;
  const t = m.muro;
  const top = m.pisos * H;
  const all = box(m.rooms, t);
  const roofH = m.techo.tipo === 'plano' ? 0.3 : m.techo.altura;
  return {
    title: 'Corte A-A',
    kind: 'ortho',
    pad: 20,
    bounds: { minU: all.minY - OVERHANG - 1, maxU: all.maxY + OVERHANG + 1, minV: -0.6, maxV: top + roofH },
    draw(p) {
      p.rect(all.minY - OVERHANG - 1, -0.6, all.maxY - all.minY + 2 * OVERHANG + 2, 0.6, 'groundfill');
      let topSpan = null;
      for (let f = 1; f <= m.pisos; f++) {
        const rooms = roomsOf(m, f).filter((r) => cut.x > r.x && cut.x < r.x + r.w);
        if (!rooms.length) continue;
        const base = (f - 1) * H;
        const openings = openingsOf(m, f);
        const y0 = Math.min(...rooms.map((r) => r.y)) - t / 2;
        const y1 = Math.max(...rooms.map((r) => r.y + r.d)) + t / 2;
        topSpan = [y0, y1];
        // Losa de piso / entrepiso.
        p.rect(y0, base - m.losa, y1 - y0, m.losa, 'cutfill');
        for (const r of rooms) {
          for (const side of ['S', 'N']) {
            const wy = side === 'S' ? r.y : r.y + r.d;
            const o = openings.find((o) => o.room === r && o.lado === side && (() => {
              const g = openingGeom(o);
              return cut.x >= g.a0 && cut.x <= g.a1;
            })());
            const segs = o
              ? [[base, base + o.antepecho], [base + o.antepecho + o.alto, base + H - m.losa]]
              : [[base, base + H - m.losa]];
            for (const [z0, z1] of segs) if (z1 - z0 > 1e-6) p.rect(wy - t / 2, z0, t, z1 - z0, 'cutfill');
            if (o?.tipo === 'ventana') p.rect(wy - 0.02, base + o.antepecho, 0.04, o.alto, 'glass');
          }
          p.text(r.y + r.d / 2, base + (H - m.losa) / 2, r.nombre.toUpperCase(), { size: 2.2, weight: '600', maxW: r.d - t });
        }
        // Altura libre, una vez por piso, en el primer recinto.
        const r0 = rooms.reduce((a, b) => (b.y < a.y ? b : a));
        p.dimV(base, base + H - m.losa, r0.y + t / 2, 3, fmt(H - m.losa));
      }
      if (topSpan) {
        const [y0, y1] = topSpan;
        p.rect(y0, top - m.losa, y1 - y0, m.losa, 'cutfill');
        if (m.techo.tipo === 'dos aguas') {
          // El corte es perpendicular a la cumbrera: se ve el hastial.
          p.poly([[y0 - OVERHANG, top], [y1 + OVERHANG, top], [(y0 + y1) / 2, top + roofH]], 'roof');
        } else if (m.techo.tipo === 'un agua') {
          p.poly([[y0 - OVERHANG, top], [y1 + OVERHANG, top + roofH], [y1 + OVERHANG, top + roofH + 0.15], [y0 - OVERHANG, top + 0.15]], 'roof');
        } else {
          p.rect(y0, top, t, 0.3, 'cutfill');
          p.rect(y1 - t, top, t, 0.3, 'cutfill');
        }
      }
      p.level(all.maxY + OVERHANG + 0.6, 0, '±0.00');
      for (let f = 2; f <= m.pisos; f++) p.level(all.maxY + OVERHANG + 0.6, (f - 1) * H, `+${fmt((f - 1) * H)}`);
      p.level(all.maxY + OVERHANG + 0.6, top, `+${fmt(top)}`);
    },
  };
}

/**
 * Orden de pintado para cajas alineadas a los ejes vistas desde (-x, -y, +z):
 * por pisos y, dentro de cada piso, primero las que quedan detrás (más al
 * este o al norte) de otras.
 */
function paintOrder(items) {
  const behind = (a, b) => a.r.x >= b.r.x + b.r.w - 1e-9 || a.r.y >= b.r.y + b.r.d - 1e-9;
  const out = [];
  const floors = [...new Set(items.map((i) => i.f))].sort((a, b) => a - b);
  for (const f of floors) {
    const rest = items.filter((i) => i.f === f);
    while (rest.length) {
      // La caja con menos cajas restantes detrás de ella es la más lejana.
      let best = 0, bestN = Infinity;
      rest.forEach((b, i) => {
        const n = rest.filter((a) => a !== b && behind(a, b) && !behind(b, a)).length;
        if (n < bestN) { bestN = n; best = i; }
      });
      out.push(rest.splice(best, 1)[0]);
    }
  }
  return out;
}

function isoView(m) {
  const H = m.altura;
  const t = m.muro;
  const P = (x, y, z) => [(x - y) * C30, z + (x + y) * 0.5];
  const items = [];
  for (let f = 1; f <= m.pisos; f++) {
    for (const r of roomsOf(m, f)) items.push({ r, f, base: (f - 1) * H });
  }
  const top = m.pisos * H;
  const roofH = m.techo.tipo === 'plano' ? 0 : m.techo.altura;
  const all = box(m.rooms, t);
  const pts = [];
  for (const x of [all.minX - OVERHANG, all.maxX + OVERHANG]) for (const y of [all.minY - OVERHANG, all.maxY + OVERHANG]) for (const z of [0, top + roofH]) pts.push(P(x, y, z));
  const us = pts.map((q) => q[0]), vs = pts.map((q) => q[1]);
  return {
    title: 'Volumetría isométrica',
    kind: 'free',
    pad: 8,
    bounds: { minU: Math.min(...us), maxU: Math.max(...us), minV: Math.min(...vs), maxV: Math.max(...vs) },
    draw(p) {
      for (const { r, f, base } of paintOrder(items)) {
        const x = r.x - t / 2, y = r.y - t / 2, w = r.w + t, d = r.d + t, h = H;
        p.poly([P(x, y, base), P(x + w, y, base), P(x + w, y, base + h), P(x, y, base + h)], 'face2');
        p.poly([P(x, y, base), P(x, y + d, base), P(x, y + d, base + h), P(x, y, base + h)], 'face3');
        p.poly([P(x, y, base + h), P(x + w, y, base + h), P(x + w, y + d, base + h), P(x, y + d, base + h)], 'face1');
        const rooms = roomsOf(m, f);
        for (const o of openingsOf(m, f)) {
          if (o.room !== r || !['S', 'O'].includes(o.lado) || !isExterior(o, rooms, t)) continue;
          const g = openingGeom(o);
          const z0 = base + o.antepecho, z1 = z0 + o.alto;
          const cls = o.tipo === 'ventana' ? 'glass' : 'build';
          if (o.lado === 'S') p.poly([P(g.a0, y, z0), P(g.a1, y, z0), P(g.a1, y, z1), P(g.a0, y, z1)], cls);
          else p.poly([P(x, g.a0, z0), P(x, g.a1, z0), P(x, g.a1, z1), P(x, g.a0, z1)], cls);
        }
      }
      if (m.techo.tipo !== 'plano') {
        const b = box(roomsOf(m, m.pisos), t);
        const x0 = b.minX - OVERHANG, x1 = b.maxX + OVERHANG, y0 = b.minY - OVERHANG, y1 = b.maxY + OVERHANG;
        if (m.techo.tipo === 'dos aguas') {
          const ym = (b.minY + b.maxY) / 2, zr = top + roofH;
          p.poly([P(x0, ym, zr), P(x1, ym, zr), P(x1, y1, top), P(x0, y1, top)], 'roof');
          p.poly([P(b.minX, b.minY, top), P(b.minX, b.maxY, top), P(b.minX, ym, zr)], 'face3');
          p.poly([P(x0, y0, top), P(x1, y0, top), P(x1, ym, zr), P(x0, ym, zr)], 'roof');
        } else {
          p.poly([P(x0, y0, top), P(x1, y0, top), P(x1, y1, top + roofH), P(x0, y1, top + roofH)], 'roof');
        }
      }
    },
  };
}

export function edificioViews(m) {
  const f1 = roomsOf(m, 1);
  const b = box(f1, 0);
  const cx = (b.minX + b.maxX) / 2;
  // El corte pasa por el centro del recinto que cruza el eje central.
  const host = f1.find((r) => cx > r.x && cx < r.x + r.w) || f1.find((r) => cx >= r.x && cx <= r.x + r.w) || f1[0];
  const cut = { x: host.x + host.w / 2 };

  const definedFloors = [...new Set(m.rooms.map((r) => r.piso))].sort((a, b) => a - b);
  const views = definedFloors.map((f) =>
    planView(m, f, m.pisos === 1 ? 'Planta arquitectónica' : definedFloors.length === 1 ? 'Planta tipo' : `Planta piso ${f}`, f === definedFloors[0] ? cut : null));
  views.push(facadeView(m, 'S'), facadeView(m, 'E'), sectionView(m, cut), isoView(m));
  return views;
}

export function edificioNotes(m) {
  const per = [];
  let total = 0;
  for (let f = 1; f <= m.pisos; f++) {
    const a = roomsOf(m, f).reduce((s, r) => s + r.w * r.d, 0);
    total += a;
    per.push(a);
  }
  const notes = [`Cotas en m, a ejes de muro (muro ${fmt(m.muro * 100)} cm).`];
  notes.push(`Área útil: ${fmt(total)} m² en ${m.pisos} piso${m.pisos > 1 ? 's' : ''}${m.pisos > 1 ? ` (${per.map((a) => fmt(a)).join(' + ')})` : ''}.`);
  notes.push(`Altura entre pisos ${fmt(m.altura)} m. Techo ${m.techo.tipo}.`);
  const ext = m.openings.length;
  if (ext) notes.push(`${m.openings.filter((o) => o.tipo === 'puerta').length} puertas y ${m.openings.filter((o) => o.tipo === 'ventana').length} ventanas.`);
  return notes;
}

