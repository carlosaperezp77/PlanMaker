import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { buildDocument, renderSheet, renderView } from '../src/render.js';
import { EXAMPLES } from '../src/examples.js';
import { contours } from '../src/views/terreno.js';
import { niceScale, scaleLabel, bearing } from '../src/util.js';

for (const ex of EXAMPLES) {
  test(`el ejemplo "${ex.label}" se dibuja sin errores ni valores inválidos`, () => {
    const model = parse(ex.text);
    assert.deepEqual(model.errors, []);
    const doc = buildDocument(model);
    const sheet = renderSheet(doc);
    assert.match(sheet, /^<svg[^>]+viewBox="0 0 420 297"/);
    assert.doesNotMatch(sheet, /NaN|Infinity|undefined/);
    doc.views.forEach((_, i) => assert.doesNotMatch(renderView(doc, i), /NaN|Infinity|undefined/));
  });
}

test('las vistas de un edificio incluyen una planta por piso definido', () => {
  const doc = buildDocument(parse('casa\nhabitacion A 4x4\npiso 2\nhabitacion B 4x4'));
  assert.deepEqual(doc.views.map((v) => v.title), [
    'Planta piso 1', 'Planta piso 2', 'Fachada sur', 'Fachada este', 'Corte A-A', 'Volumetría isométrica',
  ]);
});

test('la lámina usa una escala normalizada común', () => {
  const sheet = renderSheet(buildDocument(parse('pieza\nbloque 100x60x20')));
  const scales = [...sheet.matchAll(/ESC\. ([\d:]+)/g)].map((m) => m[1]);
  assert.equal(new Set(scales).size, 1);
  assert.equal(scales.length, 3);
});

test('escalas y rumbos', () => {
  assert.equal(scaleLabel(niceScale(0.009)), '1:125');
  assert.equal(scaleLabel(niceScale(1.3)), '1:1');
  assert.equal(scaleLabel(niceScale(3)), '2:1');
  assert.equal(bearing(45), "N 45°00' E");
  assert.equal(bearing(200.5), "S 20°30' O");
});

test('curvas de nivel en un plano inclinado', () => {
  const m = parse('terreno\npunto 0,0 cota 0\npunto 10,0 cota 0\npunto 10,10 cota 2\npunto 0,10 cota 2');
  const levels = contours(m, 0.5).map((c) => c.z);
  assert.ok(levels.includes(1));
  assert.ok(levels.every((z) => z >= 0 && z <= 2));
});
