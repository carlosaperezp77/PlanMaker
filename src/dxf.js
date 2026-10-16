// Exportación DXF (AutoCAD R12) a partir del SVG que genera PlanMaker.
// Las medidas quedan en mm de papel: el dibujo ya está a la escala indicada
// en la lámina. Cada clase de línea va en su propia capa.

const LAYERS = {
  vis: { color: 7, ltype: 'CONTINUOUS' },
  thick: { color: 7, ltype: 'CONTINUOUS' },
  solid: { color: 7, ltype: 'CONTINUOUS' },
  thin: { color: 8, ltype: 'CONTINUOUS' },
  hid: { color: 8, ltype: 'DASHED' },
  axis: { color: 1, ltype: 'CENTER' },
  dim: { color: 5, ltype: 'CONTINUOUS' },
  dimfill: { color: 5, ltype: 'CONTINUOUS' },
  dimtxt: { color: 5, ltype: 'CONTINUOUS' },
  wall: { color: 7, ltype: 'CONTINUOUS' },
  cutfill: { color: 7, ltype: 'CONTINUOUS' },
  glass: { color: 4, ltype: 'CONTINUOUS' },
  roof: { color: 30, ltype: 'CONTINUOUS' },
  contour: { color: 32, ltype: 'CONTINUOUS' },
  contour5: { color: 30, ltype: 'CONTINUOUS' },
  ground: { color: 32, ltype: 'CONTINUOUS' },
  groundfill: { color: 32, ltype: 'CONTINUOUS' },
  lot: { color: 3, ltype: 'CONTINUOUS' },
  build: { color: 7, ltype: 'CONTINUOUS' },
  frame: { color: 7, ltype: 'CONTINUOUS' },
  texto: { color: 7, ltype: 'CONTINUOUS' },
};

const attr = (s, name) => {
  const m = s.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? m[1] : null;
};
const num = (s, name) => Number(attr(s, name) ?? 0);

function unescapeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

const REPLACE = { '↧': 'prof. ', '–': '-', '—': '-', '·': '-' };

/**
 * El archivo se escribe en Windows-1252 ($DWGCODEPAGE ANSI_1252), que cubre
 * acentos, ñ, Ø, ° y ²; lo demás se sustituye por un equivalente.
 */
function dxfText(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (REPLACE[ch] !== undefined) out += REPLACE[ch];
    else if (c < 0x7f || (c >= 0xa0 && c <= 0xff)) out += ch;
    else out += '?';
  }
  return out;
}

/** Bytes Windows-1252 del texto DXF (todos sus caracteres son ≤ U+00FF). */
export function dxfBytes(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i);
  return out;
}

export function svgToDxf(svg) {
  const vb = (svg.match(/viewBox="([^"]+)"/)?.[1] || '0 0 420 297').split(/\s+/).map(Number);
  const H = vb[3];
  const ents = [];
  const used = new Set(['0']);
  const stack = [[0, 0]];
  const off = () => stack[stack.length - 1];
  const P = (x, y) => [x + off()[0], H - (y + off()[1])];
  const layerOf = (a) => {
    const cls = (attr(a, 'class') || '').split(/\s+/)[0];
    const l = LAYERS[cls] ? cls.toUpperCase() : '0';
    used.add(l);
    return l;
  };
  const line = (l, a, b) => ents.push(`0\nLINE\n8\n${l}\n10\n${f(a[0])}\n20\n${f(a[1])}\n30\n0\n11\n${f(b[0])}\n21\n${f(b[1])}\n31\n0`);
  const pline = (l, pts, closed) => {
    if (pts.length < 2) return;
    const v = pts.map((p) => `0\nVERTEX\n8\n${l}\n10\n${f(p[0])}\n20\n${f(p[1])}\n30\n0`).join('\n');
    ents.push(`0\nPOLYLINE\n8\n${l}\n66\n1\n70\n${closed ? 1 : 0}\n10\n0\n20\n0\n30\n0\n${v}\n0\nSEQEND\n8\n${l}`);
  };

  const re = /<(\/?)([a-zA-Z]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>([^<]*)/g;
  let m;
  while ((m = re.exec(svg))) {
    const [, close, tag, a, , after] = m;
    if (tag === 'g') {
      if (close) { if (stack.length > 1) stack.pop(); continue; }
      const t = attr(a, 'transform')?.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);
      stack.push(t ? [off()[0] + Number(t[1]), off()[1] + Number(t[2])] : off());
      continue;
    }
    if (close || ['svg', 'title', 'style', 'defs', 'pattern'].includes(tag)) continue;
    if (/width="100%"/.test(a)) continue; // fondo blanco
    const l = layerOf(a);
    if (tag === 'line') {
      line(l, P(num(a, 'x1'), num(a, 'y1')), P(num(a, 'x2'), num(a, 'y2')));
    } else if (tag === 'polygon' || tag === 'polyline') {
      const pts = (attr(a, 'points') || '').trim().split(/\s+/).map((p) => p.split(',').map(Number)).map(([x, y]) => P(x, y));
      pline(l, pts, tag === 'polygon');
    } else if (tag === 'rect') {
      const x = num(a, 'x'), y = num(a, 'y'), w = num(a, 'width'), h = num(a, 'height');
      pline(l === '0' ? 'FRAME' : l, [P(x, y), P(x + w, y), P(x + w, y + h), P(x, y + h)], true);
      used.add('FRAME');
    } else if (tag === 'circle') {
      const [cx, cy] = P(num(a, 'cx'), num(a, 'cy'));
      ents.push(`0\nCIRCLE\n8\n${l}\n10\n${f(cx)}\n20\n${f(cy)}\n30\n0\n40\n${f(num(a, 'r'))}`);
    } else if (tag === 'path') {
      // Solo M/L (curvas de nivel, arcos ya muestreados); una "A" se aproxima con su cuerda.
      const d = attr(a, 'd') || '';
      let cur = null;
      for (const [, cmd, args] of d.matchAll(/([MLA])([^MLA]*)/g)) {
        const n = args.trim().split(/[\s,]+/).map(Number);
        const pt = P(n[n.length - 2], n[n.length - 1]);
        if (cmd !== 'M' && cur) line(l, cur, pt);
        cur = pt;
      }
    } else if (tag === 'text') {
      const s = unescapeXml(after).trim();
      if (!s) continue;
      const tl = l === '0' ? 'TEXTO' : l;
      used.add(tl);
      const [x, y] = P(num(a, 'x'), num(a, 'y'));
      const size = Number(attr(a, 'font-size') || 2.5) * 0.72;
      const anchor = attr(a, 'text-anchor');
      const h = anchor === 'middle' ? 1 : anchor === 'end' ? 2 : 0;
      const rot = attr(a, 'transform')?.match(/rotate\(([-\d.]+)/);
      const ang = rot ? -Number(rot[1]) : 0;
      ents.push(`0\nTEXT\n8\n${tl}\n10\n${f(x)}\n20\n${f(y)}\n30\n0\n40\n${f(size)}\n1\n${dxfText(s)}\n50\n${f(ang)}\n72\n${h}\n11\n${f(x)}\n21\n${f(y)}\n31\n0\n73\n2`);
    }
  }

  const ltypes = [
    '0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0',
    '0\nLTYPE\n2\nDASHED\n70\n0\n3\n__ __ __\n72\n65\n73\n2\n40\n2.4\n49\n1.6\n49\n-0.8',
    '0\nLTYPE\n2\nCENTER\n70\n0\n3\n____ _ ____\n72\n65\n73\n4\n40\n7.6\n49\n5.0\n49\n-1.0\n49\n0.6\n49\n-1.0',
  ];
  const layers = [...used].map((name) => {
    const d = LAYERS[name.toLowerCase()] || { color: 7, ltype: 'CONTINUOUS' };
    return `0\nLAYER\n2\n${name}\n70\n0\n62\n${d.color}\n6\n${d.ltype}`;
  });
  return [
    '0\nSECTION\n2\nHEADER',
    '9\n$ACADVER\n1\nAC1009',
    '9\n$DWGCODEPAGE\n3\nANSI_1252',
    '9\n$INSUNITS\n70\n4',
    `9\n$EXTMIN\n10\n0\n20\n0\n30\n0\n9\n$EXTMAX\n10\n${f(vb[2])}\n20\n${f(H)}\n30\n0`,
    '0\nENDSEC',
    '0\nSECTION\n2\nTABLES',
    `0\nTABLE\n2\nLTYPE\n70\n${ltypes.length}`, ...ltypes, '0\nENDTAB',
    `0\nTABLE\n2\nLAYER\n70\n${layers.length}`, ...layers, '0\nENDTAB',
    '0\nENDSEC',
    '0\nSECTION\n2\nENTITIES', ...ents, '0\nENDSEC',
    '0\nEOF',
  ].join('\n') + '\n';
}

function f(v) {
  return String(Math.round(v * 10000) / 10000);
}
