// Utilidades compartidas: normalización de texto, números y escalas.

/** Minúsculas y sin acentos, para comparar palabras clave. */
export function norm(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Redondea para mostrar cotas: quita ceros sobrantes. */
export function fmt(n, decimals = 2) {
  if (!isFinite(n)) return '?';
  const r = Number(n.toFixed(decimals));
  return String(Object.is(r, -0) ? 0 : r);
}

export function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const NICE_SCALES = [
  1 / 5000, 1 / 2500, 1 / 2000, 1 / 1000, 1 / 750, 1 / 500, 1 / 400, 1 / 300,
  1 / 250, 1 / 200, 1 / 150, 1 / 125, 1 / 100, 1 / 75, 1 / 50, 1 / 25, 1 / 20,
  1 / 10, 1 / 5, 1 / 2, 1, 2, 5, 10, 20, 50,
];

/**
 * Elige la mayor escala normalizada que no supere `ratio`
 * (ratio = mm de papel por mm reales).
 */
export function niceScale(ratio) {
  let best = NICE_SCALES[0];
  for (const s of NICE_SCALES) if (s <= ratio * 1.0001) best = s;
  return best;
}

export function scaleLabel(s) {
  if (s >= 1) return `${fmt(s, 0)}:1`;
  return `1:${fmt(1 / s, 0)}`;
}

/** Área con signo (fórmula del polígono / Gauss). */
export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function bbox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Envolvente convexa (cadena monótona de Andrew). */
export function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const pt of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pt) <= 0) lower.pop();
    lower.push(pt);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const pt = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pt) <= 0) upper.pop();
    upper.push(pt);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/** Rumbo (azimut desde el norte, horario) en grados de un vector. */
export function azimuth(dx, dy) {
  let a = (Math.atan2(dx, dy) * 180) / Math.PI;
  if (a < 0) a += 360;
  return a;
}

/** Azimut a rumbo de topografía, p. ej. "N 45°30' E". */
export function bearing(az) {
  let ns, ew, ang;
  if (az <= 90) { ns = 'N'; ew = 'E'; ang = az; }
  else if (az <= 180) { ns = 'S'; ew = 'E'; ang = 180 - az; }
  else if (az <= 270) { ns = 'S'; ew = 'O'; ang = az - 180; }
  else { ns = 'N'; ew = 'O'; ang = 360 - az; }
  let d = Math.floor(ang);
  let m = Math.round((ang - d) * 60);
  if (m === 60) { d += 1; m = 0; }
  return `${ns} ${d}°${String(m).padStart(2, '0')}' ${ew}`;
}
