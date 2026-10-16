// Empaqueta la app en un solo HTML autocontenido: dist/planmaker.html
// (útil para abrirlo sin servidor o compartirlo). Cada módulo se envuelve en
// su propia función para conservar su ámbito; import/export se traducen.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { posix } from 'node:path';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const order = [
  'src/util.js', 'src/svg.js', 'src/parser.js',
  'src/views/edificio.js', 'src/views/pieza.js', 'src/views/terreno.js',
  'src/render.js', 'src/examples.js', 'src/ai.js', 'src/render3d.js', 'src/dxf.js', 'src/app.js',
];

function wrap(file) {
  let code = read(file);
  const names = [];
  code = code.replace(/^import \{([^}]+)\} from '([^']+)';\n/gm, (_, list, from) => {
    const dep = posix.normalize(posix.join(posix.dirname(file), from));
    if (!order.includes(dep)) throw new Error(`${file}: dependencia desconocida ${dep}`);
    return `const {${list}} = __mods['${dep}'];\n`;
  });
  code = code.replace(/^export (async function|function|const|let|class) (\w+)/gm, (_, kw, name) => {
    names.push(name);
    return `${kw} ${name}`;
  });
  if (/^(import|export) /m.test(code)) throw new Error(`${file}: import/export no soportado`);
  return `__mods['${file}'] = (() => {\n${code}\nreturn { ${names.join(', ')} };\n})();\n`;
}

const js = 'const __mods = {};\n' + order.map(wrap).join('\n');
const html = read('index.html')
  .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${read('styles.css')}</style>`)
  .replace('<script type="module" src="src/app.js"></script>', () => `<script type="module">\n${js}</script>`);
mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/planmaker.html', root), html);
console.log(`dist/planmaker.html (${(html.length / 1024).toFixed(0)} KB)`);

// Variante para publicar como Artifact de claude.ai: sin doctype/html/head/body,
// porque el visor añade su propio esqueleto.
const fragment = html
  .replace(/<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*/i, '')
  .replace(/<\/head>\s*<body>/i, '')
  .replace(/<\/body>\s*<\/html>\s*$/i, '');
writeFileSync(new URL('dist/planmaker-artifact.html', root), fragment);
