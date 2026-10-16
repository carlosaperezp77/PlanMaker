// Renderiza los ejemplos a SVG/PNG para revisión visual: node scripts/snap.mjs <dir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { parse } from '../src/parser.js';
import { buildDocument, renderSheet } from '../src/render.js';
import { EXAMPLES } from '../src/examples.js';

const out = process.argv[2] || 'snap';
mkdirSync(out, { recursive: true });
for (const ex of EXAMPLES) {
  const model = parse(ex.text);
  if (model.errors.length) console.log(ex.id, model.errors);
  writeFileSync(`${out}/${ex.id}.svg`, renderSheet(buildDocument(model)));
}
console.log('ok');
