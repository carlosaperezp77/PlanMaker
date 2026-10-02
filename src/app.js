// Interfaz: editor de instrucciones, vista previa con zoom y exportación.

import { parse } from './parser.js';
import { buildDocument, drawable, renderSheet, renderView } from './render.js';
import { EXAMPLES } from './examples.js';
import { describeToInstructions } from './ai.js';

const $ = (id) => document.getElementById(id);
const src = $('src');
const errorsEl = $('errors');
const viewsEl = $('views');
const stage = $('stage');
const paper = $('paper');

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};

// Dentro de claude.ai (artifact) las descargas y la IA pasan por el visor.
const host = { downloads: null, sample: null };
if (window.claude?.use) {
  $('print').hidden = true; // el visor no permite abrir el diálogo de impresión
  window.claude.use('downloads').then((d) => { host.downloads = d; }).catch(() => {});
  window.claude.use('sample').then((s) => {
    host.sample = s;
    if (s) {
      $('ai-key').closest('label').hidden = true;
      $('ai-key-note').hidden = true;
    }
  }).catch(() => {});
}

let doc = null;
let current = -1; // -1 = lámina completa; si no, índice de vista
let svgText = '';

// ------------------------------------------------------------ Ejemplos

for (const ex of EXAMPLES) {
  const o = document.createElement('option');
  o.value = ex.id;
  o.textContent = ex.label;
  $('examples').append(o);
}
$('examples').addEventListener('change', (e) => {
  const ex = EXAMPLES.find((x) => x.id === e.target.value);
  if (!ex) return;
  src.value = ex.text;
  current = -1;
  update(true);
});

// ---------------------------------------------------------- Pestañas

document.querySelectorAll('.tabs button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    document.querySelectorAll('.pane').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
  });
});

// ------------------------------------------------------------ Render

function update(refit = false) {
  store.set('planmaker:text', src.value);
  const model = parse(src.value);
  showErrors(model.errors || []);
  if (!drawable(model)) {
    doc = null;
    viewsEl.innerHTML = '';
    paper.innerHTML = '';
    if (!stage.querySelector('.empty')) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'Escribe instrucciones o elige un ejemplo para ver el plano.';
      stage.append(e);
    }
    return;
  }
  stage.querySelector('.empty')?.remove();
  const prevTipo = doc?.tipoLabel;
  try {
    doc = buildDocument(model);
  } catch (err) {
    showErrors([...(model.errors || []), { line: 0, msg: `No se pudo dibujar: ${err.message}` }]);
    return;
  }
  if (current >= doc.views.length || prevTipo !== doc.tipoLabel) current = -1;
  renderTabs();
  draw(refit || prevTipo !== doc.tipoLabel);
}

function showErrors(errors) {
  errorsEl.innerHTML = '';
  if (!errors.length) {
    const li = document.createElement('li');
    li.className = 'ok';
    li.textContent = 'Sin errores.';
    errorsEl.append(li);
    return;
  }
  for (const e of errors) {
    const li = document.createElement('li');
    li.textContent = e.line ? `Línea ${e.line}: ${e.msg}` : e.msg;
    if (e.line) li.addEventListener('click', () => selectLine(e.line));
    errorsEl.append(li);
  }
}

function selectLine(n) {
  const lines = src.value.split('\n');
  const start = lines.slice(0, n - 1).reduce((s, l) => s + l.length + 1, 0);
  src.focus();
  src.setSelectionRange(start, start + lines[n - 1].length);
}

function renderTabs() {
  viewsEl.innerHTML = '';
  const add = (label, i) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(i === current));
    b.addEventListener('click', () => {
      current = i;
      renderTabs();
      draw(true);
    });
    viewsEl.append(b);
  };
  add('Lámina completa', -1);
  doc.views.forEach((v, i) => add(v.title, i));
}

function draw(refit) {
  svgText = current < 0 ? renderSheet(doc) : renderView(doc, current);
  paper.innerHTML = svgText;
  const svg = paper.querySelector('svg');
  // Tamaño en px a 4 px por mm; el zoom se aplica con transform.
  const vb = svg.viewBox.baseVal;
  svg.setAttribute('width', vb.width * 4);
  svg.setAttribute('height', vb.height * 4);
  if (refit) fit();
  else apply();
}

let debounce = 0;
src.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => update(false), 250);
});

// ------------------------------------------------------ Zoom y paneo

const view = { s: 1, x: 0, y: 0 };

function apply() {
  paper.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
}

function fit() {
  const svg = paper.querySelector('svg');
  if (!svg) return;
  const w = Number(svg.getAttribute('width')), h = Number(svg.getAttribute('height'));
  const r = stage.getBoundingClientRect();
  view.s = Math.min((r.width - 24) / w, (r.height - 24) / h);
  view.x = (r.width - w * view.s) / 2;
  view.y = (r.height - h * view.s) / 2;
  apply();
}

function zoomAt(factor, cx, cy) {
  const s = Math.max(0.05, Math.min(20, view.s * factor));
  const k = s / view.s;
  view.x = cx - (cx - view.x) * k;
  view.y = cy - (cy - view.y) * k;
  view.s = s;
  apply();
}

stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });

const pointers = new Map();
let pinch = null;
stage.addEventListener('pointerdown', (e) => {
  stage.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
  }
});
stage.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const r = stage.getBoundingClientRect();
    zoomAt(d / pinch, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
    pinch = d;
  } else if (pointers.size === 1) {
    view.x += e.clientX - prev[0];
    view.y += e.clientY - prev[1];
    apply();
  }
});
const release = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
};
stage.addEventListener('pointerup', release);
stage.addEventListener('pointercancel', release);

const center = () => {
  const r = stage.getBoundingClientRect();
  return [r.width / 2, r.height / 2];
};
$('zoom-in').addEventListener('click', () => zoomAt(1.25, ...center()));
$('zoom-out').addEventListener('click', () => zoomAt(0.8, ...center()));
$('zoom-fit').addEventListener('click', fit);
window.addEventListener('resize', () => fit());

// --------------------------------------------------------- Exportar

function fileName(ext) {
  const base = (doc?.nombre || 'plano')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'plano';
  const part = current < 0 ? 'lamina' : doc.views[current].title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').toLowerCase();
  return `${base}_${part}.${ext}`;
}

async function download(blob, name) {
  if (host.downloads) {
    try {
      await host.downloads.save({ filename: name, data: blob });
    } catch (err) {
      if (err?.code !== 'declined') $('msg').textContent = `No se pudo guardar: ${err?.message || err}`;
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

$('dl-svg').addEventListener('click', () => {
  if (!svgText) return;
  download(new Blob([svgText], { type: 'image/svg+xml' }), fileName('svg'));
});

$('dl-png').addEventListener('click', async () => {
  if (!svgText) return;
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = url; });
  // 8 px por mm ≈ 200 ppp.
  const vb = paper.querySelector('svg').viewBox.baseVal;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vb.width * 8);
  canvas.height = Math.round(vb.height * 8);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  canvas.toBlob((b) => b && download(b, fileName('png')), 'image/png');
});

$('print').addEventListener('click', () => {
  if (!svgText) return;
  $('print-area').innerHTML = svgText;
  window.print();
});

// ------------------------------------------------------- Asistente IA

const aiKey = $('ai-key');
aiKey.value = store.get('planmaker:key') || '';
aiKey.addEventListener('change', () => store.set('planmaker:key', aiKey.value.trim()));

$('ai-go').addEventListener('click', async () => {
  const description = $('ai-text').value.trim();
  const status = $('ai-status');
  if (!description) {
    status.textContent = 'Escribe primero una descripción.';
    return;
  }
  const btn = $('ai-go');
  btn.disabled = true;
  status.textContent = 'Generando instrucciones…';
  try {
    const text = await describeToInstructions({
      apiKey: aiKey.value.trim(),
      description,
      current: $('ai-keep').checked ? src.value : '',
      sample: host.sample,
    });
    src.value = text;
    current = -1;
    update(true);
    status.textContent = 'Listo. Revisa las instrucciones en la pestaña Instrucciones.';
    document.querySelector('.tabs button[data-tab="text"]').click();
  } catch (err) {
    status.textContent = `No se pudo generar: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});

// ------------------------------------------------------------ Inicio

src.value = store.get('planmaker:text') || EXAMPLES[0].text;
const match = EXAMPLES.find((x) => x.text === src.value);
$('examples').value = match ? match.id : '';
if (!match) {
  const o = document.createElement('option');
  o.value = '';
  o.textContent = '(tus instrucciones)';
  $('examples').prepend(o);
  $('examples').value = '';
}
update(true);
