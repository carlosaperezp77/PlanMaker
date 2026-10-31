// Convierte las instrucciones (texto, una orden por línea) en un modelo.
//
// Tres tipos de proyecto: "edificio", "pieza" (mecánica) y "terreno".
// Las líneas que empiezan con # son comentarios.

import { norm } from './util.js';

const NUM = '-?\\d+(?:\\.\\d+)?';
const DIMS_RE = new RegExp(`(${NUM})\\s*(?:x|×|por)\\s*(${NUM})(?:\\s*(?:x|×|por)\\s*(${NUM}))?`, 'i');

const TYPE_WORDS = {
  edificio: ['edificio', 'casa', 'vivienda', 'edificacion', 'apartamento', 'local', 'bodega', 'oficina'],
  pieza: ['pieza', 'mecanica', 'parte', 'componente'],
  terreno: ['terreno', 'lote', 'parcela', 'predio', 'finca'],
};

const SIDES = {
  norte: 'N', n: 'N', arriba: 'N', fondo: 'N', posterior: 'N',
  sur: 'S', s: 'S', abajo: 'S', frente: 'S', frontal: 'S',
  este: 'E', e: 'E', derecha: 'E', oriente: 'E',
  oeste: 'O', o: 'O', w: 'O', izquierda: 'O', occidente: 'O', poniente: 'O',
};

/**
 * Saca un grupo de coordenadas que sigue a `keyword` ("en 3,4" o "en 3;4;1").
 * Con ";" como separador, la coma se interpreta como decimal.
 */
function takeCoords(line, keyword) {
  const re = new RegExp(`\\b${keyword}\\s*\\(?\\s*(${NUM}(?:[.,]\\d+)?(?:\\s*[;,]\\s*${NUM}(?:[.,]\\d+)?){1,2})\\s*\\)?`, 'i');
  const m = line.match(re);
  if (!m) return { coords: null, rest: line };
  const raw = m[1];
  const parts = raw.includes(';')
    ? raw.split(';').map((p) => p.trim().replace(',', '.'))
    : raw.split(',').map((p) => p.trim());
  const coords = parts.map(Number);
  if (coords.some((c) => !isFinite(c))) return { coords: null, rest: line };
  return { coords, rest: line.slice(0, m.index) + ' ' + line.slice(m.index + m[0].length) };
}

/** Coma decimal ("0,9") a punto, fuera de grupos de coordenadas. */
function decimalComma(s) {
  return s.replace(/(\d),(\d)/g, '$1.$2');
}

function takeDims(line) {
  const m = line.match(DIMS_RE);
  if (!m) return { dims: null, rest: line };
  const dims = [m[1], m[2], m[3]].filter((v) => v !== undefined).map(Number);
  return { dims, rest: line.slice(0, m.index) + ' ' + line.slice(m.index + m[0].length) };
}

/** Valor tras una palabra clave: "alto 3", "prof: 10", "cota 101.5". */
function kv(line, keys) {
  const re = new RegExp(`\\b(?:${keys.join('|')})\\s*[:=]?\\s*(${NUM})`, 'i');
  const m = norm(line).match(re);
  return m ? Number(m[1]) : null;
}

function numbers(line) {
  return (line.match(new RegExp(NUM, 'g')) || []).map(Number);
}

/** Palabras del nombre: desde `start` hasta el primer número o palabra reservada. */
function nameFrom(words, start, stop = []) {
  const out = [];
  for (let i = start; i < words.length; i++) {
    const w = words[i];
    const n = norm(w);
    if (/^-?\d/.test(w) || stop.includes(n)) break;
    out.push(w);
  }
  return out.join(' ').replace(/^["']|["']$/g, '');
}

function detectType(lines) {
  for (const { text } of lines) {
    const first = norm(text.split(/\s+/)[0]);
    for (const [tipo, words] of Object.entries(TYPE_WORDS)) if (words.includes(first)) return tipo;
  }
  const all = norm(lines.map((l) => l.text).join('\n'));
  if (/\b(habitacion|cuarto|ambiente|puerta|ventana|pisos)\b/.test(all)) return 'edificio';
  if (/\b(bloque|agujero|cilindro|ranura|taladro)\b/.test(all)) return 'pieza';
  if (/\b(punto|lado|vertice|rumbo)\b/.test(all)) return 'terreno';
  return null;
}

export function parse(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((t, i) => ({ text: t.replace(/#.*$/, '').trim(), n: i + 1 }))
    .filter((l) => l.text);

  const tipo = detectType(lines);
  const errors = [];
  if (!tipo) {
    return {
      tipo: null,
      errors: [{ line: 0, msg: 'Empieza con "edificio", "pieza" o "terreno" para indicar qué dibujar.' }],
    };
  }
  const parsers = { edificio: parseEdificio, pieza: parsePieza, terreno: parseTerreno };
  const model = parsers[tipo](lines, errors);
  model.tipo = tipo;
  model.errors = errors;
  return model;
}

function headerName(text, tipo) {
  const words = text.split(/\s+/);
  if (TYPE_WORDS[tipo].includes(norm(words[0]))) return words.slice(1).join(' ');
  return null;
}

// ---------------------------------------------------------------- Edificio

function parseEdificio(lines, errors) {
  const m = {
    nombre: 'Edificio',
    unidad: 'm',
    pisos: 1,
    altura: 2.7,
    muro: 0.15,
    losa: 0.15,
    techo: { tipo: 'plano', altura: 0 },
    rooms: [],
    openings: [],
    exteriores: [], // terrazas y piscinas a nivel del suelo
    muebles: true,
  };
  let piso = 1;
  let cursorX = 0;
  const lastXByPiso = {};

  for (const { text, n } of lines) {
    const words = text.split(/\s+/);
    const kw = norm(words[0]);

    if (TYPE_WORDS.edificio.includes(kw)) {
      const name = headerName(text, 'edificio');
      if (name) m.nombre = name;
      continue;
    }
    if (kw === 'nombre') { m.nombre = words.slice(1).join(' '); continue; }

    if (['pisos', 'niveles', 'plantas'].includes(kw)) {
      const v = numbers(text)[0];
      if (v >= 1) m.pisos = Math.round(v);
      else errors.push({ line: n, msg: 'Número de pisos inválido.' });
      continue;
    }
    if (kw === 'piso' || kw === 'nivel' || kw === 'planta') {
      const v = numbers(text)[0];
      if (v >= 1) {
        piso = Math.round(v);
        m.pisos = Math.max(m.pisos, piso);
      } else errors.push({ line: n, msg: 'Indica el número de piso, p. ej. "piso 2".' });
      continue;
    }
    if (kw === 'altura' || kw === 'alto') {
      const v = numbers(decimalComma(text))[0];
      if (v > 0) m.altura = v; else errors.push({ line: n, msg: 'Altura inválida.' });
      continue;
    }
    if (kw === 'muro' || kw === 'muros' || kw === 'pared' || kw === 'paredes') {
      const v = numbers(decimalComma(text))[0];
      if (v > 0) m.muro = v; else errors.push({ line: n, msg: 'Espesor de muro inválido.' });
      continue;
    }
    if (kw === 'losa') {
      const v = numbers(decimalComma(text))[0];
      if (v > 0) m.losa = v;
      continue;
    }
    if (kw === 'techo' || kw === 'cubierta' || kw === 'tejado') {
      const t = norm(text);
      const h = kv(decimalComma(text), ['altura', 'alto', 'cumbrera']);
      if (/dos aguas|a dos|gable|inclinad/.test(t)) m.techo = { tipo: 'dos aguas', altura: h ?? 1.5 };
      else if (/un agua|una agua|mono/.test(t)) m.techo = { tipo: 'un agua', altura: h ?? 1 };
      else m.techo = { tipo: 'plano', altura: h ?? 0 };
      continue;
    }

    if (['habitacion', 'cuarto', 'ambiente', 'espacio', 'recinto', 'sala', 'dormitorio', 'cocina', 'bano'].includes(kw)) {
      // "habitacion Sala 5x4 en 0,0" — en sala/cocina/baño la palabra ya es el nombre.
      const isGeneric = ['habitacion', 'cuarto', 'ambiente', 'espacio', 'recinto'].includes(kw);
      const { coords, rest } = takeCoords(text, 'en');
      const dm = decimalComma(rest).match(DIMS_RE);
      if (!dm) {
        errors.push({ line: n, msg: 'Falta el tamaño de la habitación, p. ej. "5x4".' });
        continue;
      }
      const dims = [Number(dm[1]), Number(dm[2])];
      const nameWords = rest.slice(0, dm.index).trim().split(/\s+/).slice(isGeneric ? 1 : 0);
      while (nameWords.length && ['de', 'en'].includes(norm(nameWords[nameWords.length - 1]))) nameWords.pop();
      const name = nameWords.join(' ').replace(/^["']|["']$/g, '');
      if (!name) {
        errors.push({ line: n, msg: 'Falta el nombre de la habitación.' });
        continue;
      }
      const [w, d] = dims;
      let x, y;
      if (coords) [x, y] = coords;
      else {
        x = lastXByPiso[piso] ?? cursorX;
        y = 0;
      }
      lastXByPiso[piso] = x + w;
      cursorX = Math.max(cursorX, x + w);
      m.rooms.push({ nombre: name, x, y, w, d, piso, line: n });
      continue;
    }

    if (kw === 'terraza' || kw === 'deck' || kw === 'piscina' || kw === 'alberca' || kw === 'pileta') {
      // "terraza 8x5 en 10,0" · "piscina 6x3 en 12,1 prof 1.5"
      const tipo = kw === 'terraza' || kw === 'deck' ? 'terraza' : 'piscina';
      const { coords, rest } = takeCoords(text, 'en');
      const clean = decimalComma(rest);
      const dm = clean.match(DIMS_RE);
      if (!dm) {
        errors.push({ line: n, msg: `Falta el tamaño de la ${tipo}, p. ej. "${tipo} 6x3 en 10,0".` });
        continue;
      }
      const [x, y] = coords || [cursorX + 1, 0];
      const prof = kv(clean, ['prof', 'profundidad']) ?? 1.4;
      m.exteriores.push({ tipo, x, y, w: Number(dm[1]), d: Number(dm[2]), prof, line: n });
      continue;
    }
    if (kw === 'muebles' || kw === 'mobiliario' || (kw === 'sin' && /^mueb/.test(norm(words[1] || '')))) {
      m.muebles = !(kw === 'sin' || /\b(no|sin|ninguno)\b/.test(norm(text.slice(words[0].length))));
      continue;
    }

    if (kw === 'puerta' || kw === 'ventana' || kw === 'porton' || kw === 'ventanal') {
      const tipo = kw === 'puerta' || kw === 'porton' ? 'puerta' : 'ventana';
      const clean = decimalComma(text);
      const cw = clean.split(/\s+/);
      const si = cw.findIndex((w, i) => i > 0 && SIDES[norm(w)]);
      if (si < 0) {
        errors.push({ line: n, msg: 'Indica el lado: norte, sur, este u oeste.' });
        continue;
      }
      const lado = SIDES[norm(cw[si])];
      const roomName = cw.slice(1, si).filter((w) => !['de', 'del', 'en', 'la', 'el', 'muro', 'pared', 'lado'].includes(norm(w))).join(' ');
      const room = findRoom(m.rooms, roomName, piso);
      if (!room) {
        errors.push({ line: n, msg: `No encuentro la habitación "${roomName}". Defínela antes de la ${tipo}.` });
        continue;
      }
      const tail = cw.slice(si + 1).join(' ');
      const nums = numbers(tail.replace(/\b(a|desde|ancho|alto|altura|antepecho)\s*[:=]?\s*-?\d+(\.\d+)?/gi, ''));
      const ancho = kv(tail, ['ancho']) ?? nums[0] ?? (tipo === 'puerta' ? (kw === 'porton' ? 2.5 : 0.9) : (kw === 'ventanal' ? 2.4 : 1.2));
      const wallLen = lado === 'N' || lado === 'S' ? room.w : room.d;
      // Posición: distancia desde el inicio del muro ("a 1.5"); si no, centrada.
      let offset = kv(tail, ['a', 'desde']) ?? (wallLen - ancho) / 2;
      if (offset + ancho > wallLen + 1e-9 || offset < 0) {
        errors.push({ line: n, msg: `La ${tipo} no cabe en el muro ${lado} de ${room.nombre} (${wallLen} m).` });
        offset = Math.max(0, Math.min(offset, wallLen - ancho));
      }
      const alto = kv(tail, ['alto', 'altura']) ?? (tipo === 'puerta' ? (kw === 'porton' ? 2.4 : 2.1) : (kw === 'ventanal' ? 2.1 : 1.2));
      const antepecho = tipo === 'puerta' ? 0 : kv(tail, ['antepecho']) ?? (kw === 'ventanal' ? 0 : 1.0);
      m.openings.push({ tipo, room, lado, ancho: Math.min(ancho, wallLen), offset, alto, antepecho, piso: room.piso, line: n });
      continue;
    }

    errors.push({ line: n, msg: `No entiendo "${words[0]}". Usa habitacion, puerta, ventana, terraza, piscina, pisos, altura, muro o techo.` });
  }

  if (!m.rooms.length) errors.push({ line: 0, msg: 'Agrega al menos una habitación, p. ej. "habitacion Sala 5x4".' });
  return m;
}

function findRoom(rooms, name, piso) {
  const k = norm(name);
  if (!k) return null;
  const same = rooms.filter((r) => norm(r.nombre) === k);
  return same.find((r) => r.piso === piso) || same[same.length - 1] ||
    rooms.find((r) => norm(r.nombre).startsWith(k)) || null;
}

// ------------------------------------------------------------------- Pieza

function parsePieza(lines, errors) {
  const m = { nombre: 'Pieza', unidad: 'mm', material: '', solids: [], cuts: [] };

  const topAt = (x, y) => {
    let top = null;
    for (const s of m.solids) {
      const inside = s.tipo === 'bloque'
        ? x >= s.x - 1e-9 && x <= s.x + s.w + 1e-9 && y >= s.y - 1e-9 && y <= s.y + s.d + 1e-9
        : Math.hypot(x - s.x, y - s.y) <= s.r + 1e-9;
      if (inside) top = Math.max(top ?? -Infinity, s.z + s.h);
    }
    return top;
  };
  const bottom = () => Math.min(0, ...m.solids.map((s) => s.z));

  for (const { text, n } of lines) {
    const words = text.split(/\s+/);
    const kw = norm(words[0]);

    if (TYPE_WORDS.pieza.includes(kw)) {
      const name = headerName(text, 'pieza');
      if (name) m.nombre = name;
      continue;
    }
    if (kw === 'nombre') { m.nombre = words.slice(1).join(' '); continue; }
    if (kw === 'material') { m.material = words.slice(1).join(' '); continue; }
    if (kw === 'unidad' || kw === 'unidades') { m.unidad = words[1] || 'mm'; continue; }

    if (['bloque', 'placa', 'base', 'prisma', 'caja'].includes(kw)) {
      const { coords, rest } = takeCoords(text, 'en');
      const { dims } = takeDims(decimalComma(rest));
      if (!dims || dims.length < 3) {
        errors.push({ line: n, msg: 'El bloque necesita largo x ancho x alto, p. ej. "bloque 100x60x20".' });
        continue;
      }
      const [w, d, h] = dims;
      const [x = 0, y = 0, z] = coords || [];
      m.solids.push({ tipo: 'bloque', x, y, z: z ?? (coords ? topAt(x, y) ?? 0 : 0), w, d, h, line: n });
      continue;
    }

    if (['cilindro', 'eje', 'buje', 'tubo'].includes(kw)) {
      const { coords, rest } = takeCoords(text, 'en');
      const clean = decimalComma(rest);
      const h = kv(clean, ['alto', 'altura', 'largo']);
      const dia = kv(clean, ['diametro', 'd', 'ø']) ?? numbers(clean.replace(/\b(alto|altura|largo)\s*[:=]?\s*-?\d+(\.\d+)?/gi, ''))[0];
      if (!(dia > 0) || !(h > 0)) {
        errors.push({ line: n, msg: 'El cilindro necesita diámetro y alto, p. ej. "cilindro 30 alto 40 en 50,30".' });
        continue;
      }
      const [x = dia / 2, y = dia / 2, z] = coords || [];
      const base = z ?? topAt(x, y) ?? 0;
      m.solids.push({ tipo: 'cilindro', x, y, z: base, r: dia / 2, h, line: n });
      const interior = kv(clean, ['interior', 'hueco']);
      if (interior > 0) m.cuts.push({ tipo: 'agujero', x, y, r: interior / 2, z0: bottom(), z1: base + h, line: n });
      continue;
    }

    if (['agujero', 'taladro', 'barreno', 'orificio'].includes(kw)) {
      const { coords, rest } = takeCoords(text, 'en');
      const clean = decimalComma(rest);
      const prof = kv(clean, ['prof', 'profundidad']);
      const dia = kv(clean, ['diametro', 'd', 'ø']) ?? numbers(clean.replace(/\b(prof|profundidad)\s*[:=]?\s*-?\d+(\.\d+)?/gi, ''))[0];
      if (!(dia > 0) || !coords) {
        errors.push({ line: n, msg: 'El agujero necesita diámetro y posición, p. ej. "agujero 10 en 20,30".' });
        continue;
      }
      const [x, y] = coords;
      const top = topAt(x, y);
      if (top === null) {
        errors.push({ line: n, msg: `El agujero en ${x},${y} no cae sobre ningún sólido.` });
        continue;
      }
      const z0 = prof > 0 && !/pasante/.test(norm(text)) ? top - prof : bottom();
      m.cuts.push({ tipo: 'agujero', x, y, r: dia / 2, z0, z1: top, line: n });
      continue;
    }

    if (['ranura', 'cajera', 'bolsillo', 'rebaje', 'vaciado'].includes(kw)) {
      const { coords, rest } = takeCoords(text, 'en');
      const clean = decimalComma(rest);
      const { dims } = takeDims(clean);
      const prof = kv(clean, ['prof', 'profundidad']);
      if (!dims || !coords) {
        errors.push({ line: n, msg: 'La ranura necesita largo x ancho, profundidad y posición, p. ej. "ranura 40x10 prof 5 en 30,25".' });
        continue;
      }
      const [w, d] = dims;
      const [x, y] = coords;
      const top = topAt(x + w / 2, y + d / 2);
      if (top === null) {
        errors.push({ line: n, msg: 'La ranura no cae sobre ningún sólido.' });
        continue;
      }
      const z0 = prof > 0 && !/pasante/.test(norm(text)) ? top - prof : bottom();
      m.cuts.push({ tipo: 'ranura', x, y, w, d, z0, z1: top, line: n });
      continue;
    }

    errors.push({ line: n, msg: `No entiendo "${words[0]}". Usa bloque, cilindro, agujero, ranura o material.` });
  }

  if (!m.solids.length) errors.push({ line: 0, msg: 'Agrega al menos un sólido, p. ej. "bloque 100x60x20".' });
  return m;
}

// ----------------------------------------------------------------- Terreno

function parseTerreno(lines, errors) {
  const m = { nombre: 'Terreno', unidad: 'm', vertices: [], spots: [], construcciones: [], curvas: null };
  let cursor = null;
  let usedSides = false;

  for (const { text, n } of lines) {
    const words = text.split(/\s+/);
    const kw = norm(words[0]);

    if (TYPE_WORDS.terreno.includes(kw)) {
      const name = headerName(text, 'terreno');
      // "terreno 20x30" crea un lote rectangular.
      const { dims, rest } = takeDims(decimalComma(name || ''));
      if (dims) {
        const [w, d] = dims;
        m.vertices.push({ x: 0, y: 0, z: 0 }, { x: w, y: 0, z: 0 }, { x: w, y: d, z: 0 }, { x: 0, y: d, z: 0 });
        const r = rest.trim();
        if (r) m.nombre = r;
      } else if (name) m.nombre = name;
      continue;
    }
    if (kw === 'nombre') { m.nombre = words.slice(1).join(' '); continue; }

    if (kw === 'rectangulo' || kw === 'rectangular') {
      const { dims } = takeDims(decimalComma(text));
      if (!dims) { errors.push({ line: n, msg: 'Indica el tamaño, p. ej. "rectangulo 20x30".' }); continue; }
      const [w, d] = dims;
      m.vertices.push({ x: 0, y: 0, z: 0 }, { x: w, y: 0, z: 0 }, { x: w, y: d, z: 0 }, { x: 0, y: d, z: 0 });
      continue;
    }

    if (kw === 'punto' || kw === 'vertice' || kw === 'p') {
      const { coords, rest } = takeCoords(text, words[0]);
      if (!coords) { errors.push({ line: n, msg: 'Indica las coordenadas, p. ej. "punto 0,0 cota 100".' }); continue; }
      const z = kv(decimalComma(rest), ['cota', 'z', 'nivel', 'elevacion']) ?? coords[2] ?? 0;
      m.vertices.push({ x: coords[0], y: coords[1], z });
      cursor = [coords[0], coords[1]];
      continue;
    }

    if (kw === 'lado' || kw === 'tramo') {
      // "lado 25 rumbo 90 cota 101" — rumbo = azimut en grados desde el norte.
      const clean = decimalComma(text);
      const az = kv(clean, ['rumbo', 'azimut', 'angulo', 'direccion']);
      const z = kv(clean, ['cota', 'nivel', 'elevacion']);
      const len = numbers(clean.replace(/\b(rumbo|azimut|angulo|direccion|cota|nivel|elevacion)\s*[:=]?\s*-?\d+(\.\d+)?/gi, ''))[0];
      if (!(len > 0) || az === null) {
        errors.push({ line: n, msg: 'El lado necesita longitud y rumbo, p. ej. "lado 25 rumbo 90".' });
        continue;
      }
      usedSides = true;
      if (!cursor) {
        cursor = [0, 0];
        if (!m.vertices.length) m.vertices.push({ x: 0, y: 0, z: z ?? 0 });
      }
      const rad = (az * Math.PI) / 180;
      const x = cursor[0] + len * Math.sin(rad);
      const y = cursor[1] + len * Math.cos(rad);
      const last = m.vertices[m.vertices.length - 1];
      const back = m.vertices[0];
      if (Math.hypot(x - back.x, y - back.y) < 1e-6 && m.vertices.length > 2) {
        cursor = [x, y];
        continue; // cerró el polígono
      }
      m.vertices.push({ x: round6(x), y: round6(y), z: z ?? last?.z ?? 0 });
      cursor = [x, y];
      continue;
    }

    if (kw === 'cota' || kw === 'nivel') {
      const { coords, rest } = takeCoords(text, 'en');
      const z = numbers(decimalComma(rest))[0];
      if (coords && z !== undefined) m.spots.push({ x: coords[0], y: coords[1], z });
      else if (z !== undefined && m.vertices.length) m.vertices[m.vertices.length - 1].z = z;
      else errors.push({ line: n, msg: 'Usa "cota 101.5 en 10,12".' });
      continue;
    }

    if (kw === 'curvas' || kw === 'curva') {
      const v = numbers(decimalComma(text))[0];
      m.curvas = v > 0 ? v : 0.5;
      continue;
    }

    if (['construccion', 'casa', 'edificio', 'edificacion', 'piscina', 'area', 'zona'].includes(kw)) {
      const { coords, rest } = takeCoords(text, 'en');
      const { dims } = takeDims(decimalComma(rest));
      if (!dims || !coords) {
        errors.push({ line: n, msg: 'Usa "construccion Casa 10x8 en 5,5".' });
        continue;
      }
      const name = kw === 'construccion' || kw === 'area' || kw === 'zona' ? nameFrom(words, 1, ['de', 'en']) : words[0];
      m.construcciones.push({ nombre: name || 'Construcción', x: coords[0], y: coords[1], w: dims[0], d: dims[1] });
      continue;
    }

    errors.push({ line: n, msg: `No entiendo "${words[0]}". Usa punto, lado, rectangulo, cota, curvas o construccion.` });
  }

  if (m.vertices.length < 3) errors.push({ line: 0, msg: 'El terreno necesita al menos 3 puntos (o "rectangulo 20x30").' });
  else if (usedSides) {
    // Si la poligonal no regresa al inicio, el último lado se cierra recto.
    const a = m.vertices[m.vertices.length - 1], b = m.vertices[0];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist > 1e-3) {
      let az = (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
      if (az < 0) az += 360;
      m.cierre = { dist, az };
    }
  }
  return m;
}

function round6(v) {
  return Math.round(v * 1e6) / 1e6;
}
