import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { sceneSpec, MATERIALS } from '../src/render3d.js';
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
