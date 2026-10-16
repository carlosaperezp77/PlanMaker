import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';
import { buildDocument, renderSheet } from '../src/render.js';
import { svgToDxf } from '../src/dxf.js';
import { EXAMPLES } from '../src/examples.js';

for (const ex of EXAMPLES) {
  test(`DXF de "${ex.label}" bien formado`, () => {
    const dxf = svgToDxf(renderSheet(buildDocument(parse(ex.text))));
    const lines = dxf.trimEnd().split('\n');
    assert.equal(lines.length % 2, 0, 'pares código/valor');
    for (let i = 0; i < lines.length; i += 2) assert.match(lines[i], /^\d+$/, `código en línea ${i + 1}`);
    assert.doesNotMatch(dxf, /NaN|undefined/);
    assert.match(dxf, /^0\nSECTION\n2\nHEADER/);
    assert.match(dxf, /0\nEOF\n$/);
    assert.ok((dxf.match(/\nLINE\n/g) || []).length > 10);
    assert.ok((dxf.match(/\nTEXT\n/g) || []).length > 5);
    // Todo cabe en Windows-1252 (Latin-1 visible).
    assert.ok(/^[\x00-\x7e\xa0-\xff]*$/.test(dxf));
  });
}

test('el texto y la cara Y se invierten correctamente', () => {
  const svg = '<svg viewBox="0 0 100 50"><line class="vis" x1="0" y1="0" x2="10" y2="10"/><text x="5" y="40" font-size="2" text-anchor="middle">Baño</text></svg>';
  const dxf = svgToDxf(svg);
  assert.match(dxf, /LINE\n8\nVIS\n10\n0\n20\n50\n30\n0\n11\n10\n21\n40/);
  assert.match(dxf, /\nBaño\n/);
});
