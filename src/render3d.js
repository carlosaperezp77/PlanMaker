// Render 3D: el modelo se describe primero como primitivas sencillas
// (cajas, cilindros, mallas) y luego se monta con three.js, que se carga
// desde CDN solo cuando se abre la vista.
//
// Coordenadas de modelo: x este, y norte, z arriba. En three.js: x, z→y, y→-z.

import { roomsOf, openingsOf, box, openingGeom } from './views/edificio.js';
import { heightField, pointInPolygon } from './views/terreno.js';
import { bbox } from './util.js';

const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';

export const MATERIALS = {
  wall: { color: 0xf2efe9, roughness: 0.9 },
  slab: { color: 0xc9c4bb, roughness: 0.9 },
  glass: { color: 0x9fc9e6, roughness: 0.1, metalness: 0.1, opacity: 0.55 },
  door: { color: 0x8a5a36, roughness: 0.7 },
  roof: { color: 0xa5543a, roughness: 0.8 },
  gable: { color: 0xe6e0d6, roughness: 0.9 },
  ground: { color: 0xc4cfb2, roughness: 1 },
  metal: { color: 0xaeb7c1, roughness: 0.45, metalness: 0.35 },
  hole: { color: 0x22272e, roughness: 0.9 },
  terrain: { color: 0xffffff, roughness: 1, vertexColors: true },
  skirt: { color: 0x8c7356, roughness: 1 },
  build: { color: 0xe9e4dc, roughness: 0.85 },
  water: { color: 0x4fa3d1, roughness: 0.15, metalness: 0.1 },
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

  const all = box(m.rooms, t);
  prims.push({ type: 'box', mat: 'ground', ...boxFrom(all.minX - 3, all.minY - 3, -0.3, all.maxX - all.minX + 6, all.maxY - all.minY + 6, 0.3), shadow: 'receive' });

  for (let f = 1; f <= m.pisos; f++) {
    const rooms = roomsOf(m, f);
    const openings = openingsOf(m, f);
    const base = (f - 1) * H;
    const b = box(rooms, t);
    if (f === 1) prims.push({ type: 'box', mat: 'slab', ...boxFrom(b.minX, b.minY, -0.05, b.maxX - b.minX, b.maxY - b.minY, 0.05) });
    // Losa sobre cada piso (techo del piso / piso del siguiente).
    for (const r of rooms) prims.push({ type: 'box', mat: 'slab', ...boxFrom(r.x - t / 2, r.y - t / 2, base + wallH, r.w + t, r.d + t, m.losa) });

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
        // Tramos llenos entre vanos; sobre y bajo cada vano, dinteles y antepechos.
        const piece = (s0, s1, z0, z1, mat = 'wall', thick = t) => {
          if (s1 - s0 < 1e-6 || z1 - z0 < 1e-6) return;
          prims.push(horiz
            ? { type: 'box', mat, ...boxFrom(s0, pos - thick / 2, z0, s1 - s0, thick, z1 - z0) }
            : { type: 'box', mat, ...boxFrom(pos - thick / 2, s0, z0, thick, s1 - s0, z1 - z0) });
        };
        let cursor = a - t / 2;
        for (const { o, g } of here) {
          piece(cursor, g.a0, base, base + wallH);
          const z0 = base + o.antepecho, z1 = Math.min(base + wallH, z0 + o.alto);
          piece(g.a0, g.a1, base, z0);
          piece(g.a0, g.a1, z1, base + wallH);
          if (o.tipo === 'ventana') piece(g.a0, g.a1, z0, z1, 'glass', 0.03);
          else piece(g.a0, g.a1, z0, z1, 'door', 0.05);
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
  if (m.techo.tipo === 'plano') {
    const p = 0.3, e = 0.12;
    prims.push({ type: 'box', mat: 'wall', role: 'parapet', ...boxFrom(b.minX, b.minY, top, b.maxX - b.minX, e, p) });
    prims.push({ type: 'box', mat: 'wall', role: 'parapet', ...boxFrom(b.minX, b.maxY - e, top, b.maxX - b.minX, e, p) });
    prims.push({ type: 'box', mat: 'wall', role: 'parapet', ...boxFrom(b.minX, b.minY, top, e, b.maxY - b.minY, p) });
    prims.push({ type: 'box', mat: 'wall', role: 'parapet', ...boxFrom(b.maxX - e, b.minY, top, e, b.maxY - b.minY, p) });
  } else if (m.techo.tipo === 'dos aguas') {
    const ym = (b.minY + b.maxY) / 2, zr = top + rh;
    // Pendiente prolongada hasta el alero.
    const drop = (rh * OVER) / (ym - b.minY);
    const ze = top - drop;
    prims.push({ type: 'mesh', mat: 'roof', double: true, positions: [
      ...tri([x0, y0, ze], [x1, y0, ze], [x1, ym, zr]), ...tri([x0, y0, ze], [x1, ym, zr], [x0, ym, zr]),
      ...tri([x0, ym, zr], [x1, ym, zr], [x1, y1, ze]), ...tri([x0, ym, zr], [x1, y1, ze], [x0, y1, ze]),
    ] });
    for (const x of [b.minX, b.maxX]) {
      prims.push({ type: 'mesh', mat: 'gable', double: true, positions: tri([x, b.minY, top], [x, b.maxY, top], [x, ym, zr]) });
    }
  } else {
    // Un agua: baja hacia el sur.
    const slope = rh / (b.maxY - b.minY);
    const zs = top - slope * OVER, zn = top + rh + slope * OVER;
    prims.push({ type: 'mesh', mat: 'roof', double: true, positions: [
      ...tri([x0, y0, zs], [x1, y0, zs], [x1, y1, zn]), ...tri([x0, y0, zs], [x1, y1, zn], [x0, y1, zn]),
    ] });
    for (const x of [b.minX, b.maxX]) {
      prims.push({ type: 'mesh', mat: 'gable', double: true, positions: tri([x, b.minY, top], [x, b.maxY, top], [x, b.maxY, top + rh]) });
    }
  }
  return { prims, unit: 'm' };
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
    if (!window.THREE.OrbitControls) await loadScript(ORBIT_URL);
    return window.THREE;
  })();
  return threePromise;
}

function toThree(spec, THREE) {
  const group = new THREE.Group();
  const mats = {};
  const material = (name, double) => {
    const key = name + (double ? ':2' : '');
    if (!mats[key]) {
      const p = MATERIALS[name];
      mats[key] = name === 'line'
        ? new THREE.LineBasicMaterial({ color: p.color })
        : new THREE.MeshStandardMaterial({
          color: p.color,
          roughness: p.roughness ?? 0.8,
          metalness: p.metalness ?? 0,
          vertexColors: !!p.vertexColors,
          transparent: p.opacity !== undefined,
          opacity: p.opacity ?? 1,
          side: double ? THREE.DoubleSide : THREE.FrontSide,
        });
    }
    return mats[key];
  };
  // Modelo (x, y, z) → three (x, z, -y).
  for (const p of spec.prims) {
    let obj;
    if (p.type === 'box') {
      obj = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), material(p.mat));
      obj.position.set(p.x, p.z, -p.y);
    } else if (p.type === 'cyl') {
      obj = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, p.h, 64), material(p.mat));
      obj.position.set(p.x, p.z + p.h / 2, -p.y);
    } else if (p.type === 'mesh') {
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(p.positions.length);
      for (let i = 0; i < p.positions.length; i += 3) {
        pos[i] = p.positions[i];
        pos[i + 1] = p.positions[i + 2];
        pos[i + 2] = -p.positions[i + 1];
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      if (p.colors) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.colors), 3));
      g.computeVertexNormals();
      obj = new THREE.Mesh(g, material(p.mat, p.double));
    } else if (p.type === 'line') {
      const g = new THREE.BufferGeometry().setFromPoints(p.points.map(([x, y, z]) => new THREE.Vector3(x, z, -y)));
      obj = new THREE.Line(g, material('line'));
    }
    if (obj.isMesh) {
      obj.castShadow = p.shadow !== 'receive' && p.shadow !== 'none' && MATERIALS[p.mat].opacity === undefined;
      obj.receiveShadow = p.shadow !== 'none';
    }
    group.add(obj);
  }
  return group;
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
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe7ee);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1e6);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6f6252, 0.6));
  const sun = new THREE.DirectionalLight(0xfff6e8, 0.85);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);

  let group = null;
  function setModel(m) {
    if (group) {
      scene.remove(group);
      group.traverse((o) => { o.geometry?.dispose(); });
    }
    group = toThree(sceneSpec(m), THREE);
    scene.add(group);
    const bb = new THREE.Box3().setFromObject(group);
    const size = bb.getSize(new THREE.Vector3());
    const center = bb.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z);
    // Vista de tres cuartos desde el suroeste, como la isométrica.
    camera.position.set(center.x - r * 1.3, center.y + r * 0.95, center.z + r * 1.5);
    camera.near = r / 500;
    camera.far = r * 50;
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.maxDistance = r * 10;
    controls.update();
    sun.position.set(center.x - r * 0.8, center.y + r * 1.6, center.z + r * 1.1);
    sun.target.position.copy(center);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -r;
    sc.right = sc.top = r;
    sc.near = r * 0.1;
    sc.far = r * 5;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0005;
  }
  setModel(model);

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let raf = 0;
  const loop = () => {
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  loop();

  return {
    setModel,
    toBlob: () => new Promise((ok) => {
      renderer.render(scene, camera);
      renderer.domElement.toBlob(ok, 'image/png');
    }),
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      group?.traverse((o) => { o.geometry?.dispose(); });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
