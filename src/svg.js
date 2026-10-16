// Motor de dibujo: "lápiz" con transformación modelo→papel, cotas y
// composición de láminas. Todas las medidas de papel están en mm.

import { escapeXml, niceScale, scaleLabel } from './util.js';

export const SHEET = { w: 420, h: 297, margin: 10, titleH: 26, titleW: 180 };

const STYLE = `
  .vis{stroke:#111;stroke-width:.5;fill:none;stroke-linejoin:round;stroke-linecap:round}
  .thick{stroke:#111;stroke-width:.7;fill:none;stroke-linejoin:round}
  .thin{stroke:#222;stroke-width:.25;fill:none}
  .hid{stroke:#333;stroke-width:.3;fill:none;stroke-dasharray:1.6 .8}
  .axis{stroke:#b03030;stroke-width:.18;fill:none;stroke-dasharray:5 1 .6 1}
  .dim{stroke:#1d4f91;stroke-width:.18;fill:none}
  .dimfill{fill:#1d4f91;stroke:none}
  .wall{fill:#3a3a3a;stroke:#111;stroke-width:.3}
  .cutfill{fill:url(#hatch);stroke:#111;stroke-width:.5}
  .solid{fill:#fff;stroke:#111;stroke-width:.5;stroke-linejoin:round}
  .face1{fill:#dfe6ee;stroke:#222;stroke-width:.35;stroke-linejoin:round}
  .face2{fill:#b9c6d4;stroke:#222;stroke-width:.35;stroke-linejoin:round}
  .face3{fill:#93a5b8;stroke:#222;stroke-width:.35;stroke-linejoin:round}
  .hole{fill:#4a5866;stroke:#222;stroke-width:.35}
  .glass{fill:#d6ecf7;stroke:#111;stroke-width:.3}
  .roof{fill:#efe4d6;stroke:#111;stroke-width:.5;stroke-linejoin:round}
  .ground{stroke:#5b4a2f;stroke-width:.6;fill:none}
  .groundfill{fill:#efe6d2;stroke:#5b4a2f;stroke-width:.5}
  .lot{fill:#f4f8ef;stroke:#111;stroke-width:.6}
  .build{fill:#e9e4dc;stroke:#111;stroke-width:.4}
  .contour{stroke:#a4703a;stroke-width:.2;fill:none}
  .contour5{stroke:#8a5a26;stroke-width:.4;fill:none}
  .sky{fill:none;stroke:none}
  .frame{fill:none;stroke:#111;stroke-width:.7}
  text{font-family:'Helvetica Neue',Arial,sans-serif;fill:#111}
  .dimtxt{fill:#1d4f91}
  .muted{fill:#555}
`;

const DEFS = `<defs><pattern id="hatch" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.6" height="1.6" fill="#fff"/><line x1="0" y1="0" x2="0" y2="1.6" stroke="#111" stroke-width=".25"/></pattern></defs>`;

/** Lápiz: dibuja en coordenadas de modelo (u a la derecha, v hacia arriba). */
export class Pen {
  constructor(k, ox, oy, bounds) {
    this.k = k;
    this.ox = ox;
    this.oy = oy;
    this.b = bounds;
    this.out = [];
  }
  X(u) { return this.ox + (u - this.b.minU) * this.k; }
  Y(v) { return this.oy - (v - this.b.minV) * this.k; }
  P([u, v]) { return `${r3(this.X(u))},${r3(this.Y(v))}`; }

  raw(s) { this.out.push(s); }
  line(u1, v1, u2, v2, cls = 'vis') {
    this.out.push(`<line class="${cls}" x1="${r3(this.X(u1))}" y1="${r3(this.Y(v1))}" x2="${r3(this.X(u2))}" y2="${r3(this.Y(v2))}"/>`);
  }
  poly(pts, cls = 'vis', closed = true) {
    if (pts.length < 2) return;
    const tag = closed ? 'polygon' : 'polyline';
    this.out.push(`<${tag} class="${cls}" points="${pts.map((p) => this.P(p)).join(' ')}"/>`);
  }
  rect(u, v, w, h, cls = 'vis') {
    this.poly([[u, v], [u + w, v], [u + w, v + h], [u, v + h]], cls);
  }
  circle(u, v, r, cls = 'vis') {
    this.out.push(`<circle class="${cls}" cx="${r3(this.X(u))}" cy="${r3(this.Y(v))}" r="${r3(r * this.k)}"/>`);
  }
  /** Arco de (u0,v0) a (u1,v1) con radio r (modelo); sweep en sentido de papel. */
  arc(u0, v0, u1, v1, r, sweep, cls = 'thin') {
    this.out.push(`<path class="${cls}" d="M${this.P([u0, v0])} A${r3(r * this.k)},${r3(r * this.k)} 0 0 ${sweep ? 1 : 0} ${this.P([u1, v1])}"/>`);
  }
  /** Texto con tamaño en mm de papel; maxW (en unidades de modelo) lo reduce para que quepa. */
  text(u, v, str, { size = 2.5, anchor = 'middle', dx = 0, dy = 0, rotate = 0, cls = '', weight = '', maxW = 0 } = {}) {
    if (maxW > 0) size = Math.max(1.2, Math.min(size, (maxW * this.k) / (String(str).length * 0.62)));
    const x = r3(this.X(u) + dx);
    const y = r3(this.Y(v) + dy);
    const rot = rotate ? ` transform="rotate(${r3(rotate)} ${x} ${y})"` : '';
    const w = weight ? ` font-weight="${weight}"` : '';
    this.out.push(`<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" dominant-baseline="middle"${w}${cls ? ` class="${cls}"` : ''}${rot}>${escapeXml(str)}</text>`);
  }

  /**
   * Cota alineada entre p1 y p2, desplazada `off` mm de papel a la izquierda
   * del sentido p1→p2. style: 'tick' (arquitectura) o 'arrow' (mecánica).
   */
  dim(p1, p2, off, label, style = 'tick') {
    const x1 = this.X(p1[0]), y1 = this.Y(p1[1]);
    const x2 = this.X(p2[0]), y2 = this.Y(p2[1]);
    const L = Math.hypot(x2 - x1, y2 - y1);
    if (L < 0.5) return;
    const ux = (x2 - x1) / L, uy = (y2 - y1) / L;
    // Normal a la "izquierda" en coordenadas de modelo (y de papel invertida).
    const nx = uy, ny = -ux;
    const a1 = [x1 + nx * off, y1 + ny * off];
    const a2 = [x2 + nx * off, y2 + ny * off];
    const ext = off > 0 ? 1.2 : -1.2;
    const o = [];
    o.push(`<line class="dim" x1="${r3(x1 + nx * Math.sign(off) * 0.8)}" y1="${r3(y1 + ny * Math.sign(off) * 0.8)}" x2="${r3(a1[0] + nx * ext)}" y2="${r3(a1[1] + ny * ext)}"/>`);
    o.push(`<line class="dim" x1="${r3(x2 + nx * Math.sign(off) * 0.8)}" y1="${r3(y2 + ny * Math.sign(off) * 0.8)}" x2="${r3(a2[0] + nx * ext)}" y2="${r3(a2[1] + ny * ext)}"/>`);
    o.push(`<line class="dim" x1="${r3(a1[0])}" y1="${r3(a1[1])}" x2="${r3(a2[0])}" y2="${r3(a2[1])}"/>`);
    if (style === 'arrow') {
      const ah = 2.2, aw = 0.6;
      for (const [p, s] of [[a1, 1], [a2, -1]]) {
        const bx = p[0] + ux * ah * s, by = p[1] + uy * ah * s;
        o.push(`<polygon class="dimfill" points="${r3(p[0])},${r3(p[1])} ${r3(bx + nx * aw)},${r3(by + ny * aw)} ${r3(bx - nx * aw)},${r3(by - ny * aw)}"/>`);
      }
    } else {
      for (const p of [a1, a2]) {
        const tx = (ux + nx) * 0.9, ty = (uy + ny) * 0.9;
        o.push(`<line class="dim" stroke-width=".4" x1="${r3(p[0] - tx)}" y1="${r3(p[1] - ty)}" x2="${r3(p[0] + tx)}" y2="${r3(p[1] + ty)}"/>`);
      }
    }
    let ang = (Math.atan2(uy, ux) * 180) / Math.PI;
    if (ang > 90.01 || ang < -89.99) ang += 180;
    // El texto va del lado exterior de la línea de cota.
    const side = off >= 0 ? 1 : -1;
    const mx = (a1[0] + a2[0]) / 2 + nx * 1.4 * side;
    const my = (a1[1] + a2[1]) / 2 + ny * 1.4 * side;
    const fs = L < 8 ? 1.8 : 2.2;
    o.push(`<text class="dimtxt" x="${r3(mx)}" y="${r3(my)}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${r3(ang)} ${r3(mx)} ${r3(my)})">${escapeXml(label)}</text>`);
    this.out.push(o.join(''));
  }
  /** Cota horizontal (u1→u2) a la altura v, desplazada off mm (negativo = abajo). */
  dimH(u1, u2, v, off, label, style) {
    this.dim([Math.min(u1, u2), v], [Math.max(u1, u2), v], -off, label, style);
  }
  /** Cota vertical (v1→v2) en u, desplazada off mm (negativo = izquierda). */
  dimV(v1, v2, u, off, label, style) {
    this.dim([u, Math.min(v1, v2)], [u, Math.max(v1, v2)], -off, label, style);
  }
  /** Línea de eje (centro) con prolongación de `ext` mm de papel. */
  axis(u1, v1, u2, v2, ext = 2) {
    const L = Math.hypot(u2 - u1, v2 - v1) || 1;
    const e = ext / this.k;
    const du = ((u2 - u1) / L) * e, dv = ((v2 - v1) / L) * e;
    this.line(u1 - du, v1 - dv, u2 + du, v2 + dv, 'axis');
  }
  /** Cruz de centro para un círculo de radio r. */
  centerMark(u, v, r) {
    this.axis(u - r, v, u + r, v);
    this.axis(u, v - r, u, v + r);
  }
  /** Marca de nivel (triángulo + texto), estilo arquitectónico. */
  level(u, v, label, side = 1) {
    const x = this.X(u), y = this.Y(v);
    const s = 1.4;
    this.out.push(`<polygon class="dimfill" points="${r3(x)},${r3(y)} ${r3(x - s)},${r3(y - s * 1.4)} ${r3(x + s)},${r3(y - s * 1.4)}"/>`);
    this.out.push(`<line class="dim" x1="${r3(x - s * 2)}" y1="${r3(y)}" x2="${r3(x + 14 * side)}" y2="${r3(y)}"/>`);
    this.out.push(`<text class="dimtxt" x="${r3(x + 2 * side)}" y="${r3(y - 2.6)}" font-size="2.2" text-anchor="${side > 0 ? 'start' : 'end'}" dominant-baseline="middle">${escapeXml(label)}</text>`);
  }
}

function r3(v) {
  return Math.round(v * 1000) / 1000;
}

/**
 * Una vista es { title, kind: 'ortho' | 'free', bounds:{minU,maxU,minV,maxV},
 * pad (mm de papel alrededor para cotas), draw(pen) }.
 * Las vistas 'ortho' de una lámina comparten escala normalizada.
 */
function fitK(view, w, h) {
  const pad = view.pad ?? 12;
  const bw = Math.max(view.bounds.maxU - view.bounds.minU, 1e-6);
  const bh = Math.max(view.bounds.maxV - view.bounds.minV, 1e-6);
  return Math.min((w - 2 * pad) / bw, (h - 2 * pad - 8) / bh);
}

function placeView(view, k, cx, cy, cw, ch) {
  const bw = (view.bounds.maxU - view.bounds.minU) * k;
  const bh = (view.bounds.maxV - view.bounds.minV) * k;
  const ox = cx + (cw - bw) / 2;
  const oy = cy + 8 + (ch - 8 + bh) / 2;
  const pen = new Pen(k, ox, oy, view.bounds);
  view.draw(pen);
  return pen.out.join('\n');
}

/**
 * Lámina A3 horizontal con marco, cajetín y vistas en cuadrícula.
 * doc: { nombre, tipoLabel, unidad, unitMM, material?, notas?: string[], views }
 */
export function composeSheet(doc) {
  const { w: W, h: H, margin: M, titleH, titleW } = SHEET;
  const views = doc.views;
  const n = views.length;
  // doc.layout permite que una vista ocupe varias celdas: { cols, rows, cells: [{c, r, cs, rs}] }.
  const cols = doc.layout?.cols ?? (n > 4 ? 3 : n > 1 ? 2 : 1);
  const rows = doc.layout?.rows ?? Math.ceil(n / cols);
  const areaW = W - 2 * M;
  const areaH = H - 2 * M - titleH;
  const unitW = areaW / cols;
  const unitH = areaH / rows;
  const cellOf = (i) => {
    const s = doc.layout?.cells?.[i] ?? { c: i % cols, r: Math.floor(i / cols) };
    return { c: s.c, r: s.r, cw: unitW * (s.cs ?? 1), ch: unitH * (s.rs ?? 1) };
  };
  const ks = views.map((v, i) => (v.kind === 'ortho' ? fitK(v, cellOf(i).cw, cellOf(i).ch) : Infinity));
  const sc = ks.some(isFinite) ? (() => {
    const s = niceScale(Math.min(...ks) / doc.unitMM);
    return { s, k: s * doc.unitMM };
  })() : null;

  const parts = [];
  views.forEach((view, i) => {
    const { c, r, cw, ch } = cellOf(i);
    const cx = M + c * unitW, cy = M + r * unitH;
    const k = view.kind === 'ortho' ? sc.k : Math.min(fitK(view, cw, ch), view.maxK ?? Infinity);
    parts.push(`<g>${placeView(view, k, cx, cy, cw, ch)}</g>`);
    const sub = view.kind === 'ortho' ? `ESC. ${scaleLabel(sc.s)}` : view.subtitle || 'Sin escala';
    parts.push(`<text x="${r3(cx + cw / 2)}" y="${r3(cy + 5)}" font-size="3.4" font-weight="700" text-anchor="middle">${escapeXml(view.title.toUpperCase())}</text>`);
    parts.push(`<text class="muted" x="${r3(cx + cw / 2)}" y="${r3(cy + 9)}" font-size="2.2" text-anchor="middle">${escapeXml(sub)}</text>`);
    if (c > 0) parts.push(`<line class="thin" stroke="#bbb" x1="${r3(cx)}" y1="${r3(cy + 2)}" x2="${r3(cx)}" y2="${r3(cy + ch - 2)}" style="stroke:#ccc"/>`);
    if (r > 0) parts.push(`<line class="thin" x1="${r3(cx + 2)}" y1="${r3(cy)}" x2="${r3(cx + cw - 2)}" y2="${r3(cy)}" style="stroke:#ccc"/>`);
  });

  parts.push(titleBlock(doc, sc ? scaleLabel(sc.s) : 'S/E'));
  parts.push(`<rect class="frame" x="${M}" y="${M}" width="${W - 2 * M}" height="${H - 2 * M}"/>`);
  parts.push(`<rect class="thin" x="4" y="4" width="${W - 8}" height="${H - 8}"/>`);

  return wrapSvg(parts.join('\n'), W, H, doc.nombre);
}

function titleBlock(doc, scale) {
  const { w: W, h: H, margin: M, titleH, titleW } = SHEET;
  const x0 = W - M - titleW, y0 = H - M - titleH;
  const date = doc.fecha || new Date().toISOString().slice(0, 10);
  const o = [];
  o.push(`<rect fill="#fff" class="vis" x="${x0}" y="${y0}" width="${titleW}" height="${titleH}"/>`);
  o.push(`<line class="vis" x1="${x0}" y1="${y0 + 12}" x2="${x0 + titleW}" y2="${y0 + 12}"/>`);
  o.push(`<text x="${x0 + 3}" y="${y0 + 4}" font-size="2" class="muted">PROYECTO</text>`);
  o.push(`<text x="${x0 + 3}" y="${y0 + 9.2}" font-size="4.6" font-weight="700">${escapeXml(doc.nombre)}</text>`);
  const cells = [
    ['TIPO', doc.tipoLabel],
    ['ESCALA', scale],
    ['UNIDADES', doc.unidad],
    ['FECHA', date],
  ];
  if (doc.material) cells.splice(1, 0, ['MATERIAL', doc.material]);
  const cw = titleW / cells.length;
  cells.forEach(([k, v], i) => {
    const x = x0 + i * cw;
    if (i) o.push(`<line class="vis" x1="${x}" y1="${y0 + 12}" x2="${x}" y2="${y0 + titleH}"/>`);
    o.push(`<text x="${r3(x + 2.5)}" y="${y0 + 15.5}" font-size="2" class="muted">${k}</text>`);
    o.push(`<text x="${r3(x + 2.5)}" y="${y0 + 21}" font-size="3.2">${escapeXml(v)}</text>`);
  });
  o.push(`<text x="${x0 + titleW - 3}" y="${y0 + 4}" font-size="2" class="muted" text-anchor="end">PlanMaker</text>`);
  if (doc.notas?.length) {
    o.push(`<text x="${M + 3}" y="${y0 + 4}" font-size="2" class="muted">NOTAS</text>`);
    doc.notas.slice(0, 4).forEach((t, i) => {
      o.push(`<text x="${M + 3}" y="${r3(y0 + 9 + i * 4.4)}" font-size="2.6">${escapeXml(t)}</text>`);
    });
    o.push(`<line class="thin" x1="${M}" y1="${y0}" x2="${x0}" y2="${y0}" style="stroke:#ccc"/>`);
  }
  return o.join('\n');
}

/** Una sola vista en su propia hoja, a escala normalizada si es ortogonal. */
export function composeSingle(view, unitMM, maxW = 380, maxH = 260) {
  let k, sub;
  if (view.kind === 'ortho') {
    const s = niceScale(fitK(view, maxW, maxH) / unitMM);
    k = s * unitMM;
    sub = `ESC. ${scaleLabel(s)}`;
  } else {
    k = Math.min(fitK(view, maxW, maxH), view.maxK ?? Infinity);
    sub = view.subtitle || 'Sin escala';
  }
  const pad = view.pad ?? 12;
  const w = (view.bounds.maxU - view.bounds.minU) * k + 2 * pad;
  const h = (view.bounds.maxV - view.bounds.minV) * k + 2 * pad + 16;
  const W = Math.max(w, 90), H = h;
  const body = placeView(view, k, 0, 8, W, H - 8);
  const head = `<text x="${r3(W / 2)}" y="6" font-size="3.4" font-weight="700" text-anchor="middle">${escapeXml(view.title.toUpperCase())}</text>` +
    `<text class="muted" x="${r3(W / 2)}" y="10" font-size="2.2" text-anchor="middle">${escapeXml(sub)}</text>`;
  return wrapSvg(head + body, W, H, view.title);
}

function wrapSvg(inner, W, H, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${r3(W)}mm" height="${r3(H)}mm" viewBox="0 0 ${r3(W)} ${r3(H)}">` +
    `<title>${escapeXml(title)}</title><style>${STYLE}</style>${DEFS}` +
    `<rect width="100%" height="100%" fill="#fff"/>${inner}</svg>`;
}

