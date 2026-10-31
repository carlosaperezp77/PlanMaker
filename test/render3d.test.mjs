import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { sceneSpec, MATERIALS, visibleIn } from '../src/render3d.js';
import { furnishRoom, roomKinds } from '../src/furniture.js';
import { EXAMPLES } from '../src/examples.js';

const finite = (p) => Object.values(p).flat(Infinity).every((v) => typeof v !== 'number' || Number.isFinite(v));

for (const ex of EXAMPLES) {
  test(`el render 3D de "${ex.label}" produce primitivas válidas`, () => {
    const { prims } = sceneSpec(parse(ex.text));
    assert.ok(prims.length >= 3);
    for (const p of prims) {
      assert.ok(MATERIALS[p.mat], `material ${p.mat}`);
      assert.ok(finite(p), JSON.stringify(p).slice(0, 120));
      if (p.type === 'mesh') assert.equal(p.positions.length % 9, 0);
    }
  });
}

test('un muro compartido entre dos recintos se modela una sola vez', () => {
  const { prims } = sceneSpec(parse('casa\naltura 3\nhabitacion A 4x4 en 0,0\nhabitacion B 4x4 en 4,0'));
  const walls = prims.filter((p) => p.mat === 'wall' && !p.role);
  // Dos tramos horizontales (sur y norte, ya unidos) y tres verticales.
  assert.equal(walls.length, 5);
});

test('las puertas y ventanas abren huecos en el muro', () => {
  const { prims } = sceneSpec(parse('casa\naltura 3\nhabitacion A 4x4\npuerta A sur 1\nventana A norte 1.2'));
  assert.equal(prims.filter((p) => p.mat === 'door').length, 1);
  assert.equal(prims.filter((p) => p.mat === 'glass').length, 1);
  // Muro sur: dos tramos laterales + dintel; muro norte: dos laterales + antepecho + dintel.
  assert.equal(prims.filter((p) => p.mat === 'wall' && !p.role).length, 2 + 3 + 4);
});

test('terraza, piscina y "sin muebles" se leen en un edificio', () => {
  const m = parse('casa\nhabitacion Sala 5x4 en 0,0\nterraza 8x6 en 5,0\npiscina 5x2,5 en 6;1 prof 1.6\nsin muebles');
  assert.deepEqual(m.errors, []);
  assert.equal(m.muebles, false);
  assert.deepEqual(m.exteriores.map((e) => [e.tipo, e.x, e.y, e.w, e.d, e.prof]), [['terraza', 5, 0, 8, 6, 1.4], ['piscina', 6, 1, 5, 2.5, 1.6]]);
});

test('los dormitorios reciben cama dentro del recinto y sin tapar la puerta', () => {
  const room = { nombre: 'Dormitorio 1', x: 0, y: 0, w: 4, d: 4, piso: 1 };
  const door = { tipo: 'puerta', room, lado: 'S', ancho: 0.9, offset: 0.3, alto: 2.1, antepecho: 0, piso: 1 };
  const prims = furnishRoom(room, [door], 0.15, 0);
  assert.ok(prims.some((p) => p.mat === 'linen'), 'hay colchón');
  for (const p of prims.filter((q) => q.type === 'box')) {
    assert.ok(p.x - p.w / 2 >= 0.075 - 1e-6 && p.x + p.w / 2 <= 3.925 + 1e-6, `${p.mat} dentro en x`);
    assert.ok(p.y - p.d / 2 >= 0.075 - 1e-6 && p.y + p.d / 2 <= 3.925 + 1e-6, `${p.mat} dentro en y`);
    // Zona de paso de la puerta: x 0.2–1.3, y hasta ~1.1 m.
    const blocks = p.x + p.w / 2 > 0.2 && p.x - p.w / 2 < 1.3 && p.y - p.d / 2 < 1.0;
    assert.ok(!blocks, `${p.mat} tapa la puerta`);
  }
});

test('los recintos se reconocen por su nombre', () => {
  assert.deepEqual(roomKinds('Baño principal'), ['bath']);
  assert.deepEqual(roomKinds('Sala comedor'), ['living', 'dining']);
  assert.deepEqual(roomKinds('Dormitorio principal'), ['bedroom']);
  assert.deepEqual(roomKinds('Pasillo'), ['hall']);
});

test('sin techo se oculta la cubierta, el cielo raso del piso y los pisos de arriba', () => {
  const v = { roof: false, floor: 1 };
  assert.equal(visibleIn(v, { fl: 1, layer: 'roof' }), false);
  assert.equal(visibleIn(v, { fl: 1, layer: 'ceiling' }), false);
  assert.equal(visibleIn(v, { fl: 2 }), false);
  assert.equal(visibleIn(v, { fl: 1 }), true);
  assert.equal(visibleIn(v, { fl: 0 }), true);
  assert.equal(visibleIn({ roof: true, floor: 1 }, { fl: 2, layer: 'roof' }), true);
});

test('una piscina deja un hueco en el césped y lleva agua', () => {
  const { prims } = sceneSpec(parse('casa\nhabitacion Sala 5x4 en 0,0\npiscina 4x2 en 8,1'));
  assert.equal(prims.filter((p) => p.mat === 'water').length, 1);
  const grass = prims.filter((p) => p.mat === 'grass');
  assert.ok(grass.length > 1);
  assert.ok(!grass.some((g) => Math.abs(g.x - 10) < g.w / 2 - 1e-6 && Math.abs(g.y - 2) < g.d / 2 - 1e-6), 'el césped no cubre la piscina');
});
