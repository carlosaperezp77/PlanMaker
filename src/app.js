// Interfaz: editor de instrucciones, vista previa con zoom y exportación.

import { parse } from './parser.js';
import { buildDocument, drawable, renderSheet, renderView } from './render.js';
import { EXAMPLES } from './examples.js';
import { describeToInstructions, prepareImage } from './ai.js';
import { mount3d } from './render3d.js';
import { svgToDxf, dxfBytes } from './dxf.js';

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
let imageLimits = { maxCount: 4 }; // sin visor: la API acepta varias imágenes
if (window.claude?.use) {
  $('print').hidden = true; // el visor no permite abrir el diálogo de impresión
  window.claude.use('downloads').then((d) => { host.downloads = d; }).catch(() => {});
  window.claude.use('sample').then((s) => {
    host.sample = s;
    if (s) {
      $('ai-key').closest('label').hidden = true;
      $('ai-key-note').hidden = true;
      s.limits?.().then((caps) => {
        imageLimits = caps?.images || null;
        $('ai-img-btn').hidden = !imageLimits;
        $('ai-cam-btn').hidden = !imageLimits;
        if (imageLimits) $('ai-img').accept = imageLimits.mediaTypes.join(',');
      }).catch(() => { $('ai-img-btn').hidden = true; $('ai-cam-btn').hidden = true; });
    }
  }).catch(() => {});
}

let doc = null;
const RENDER = -2;
let current = -1; // -1 = lámina completa, -2 = render 3D; si no, índice de vista
let model = null;
let viewer3d = null;
const stage3d = $('stage3d');
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
  model = parse(src.value);
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
  if (current >= doc.views.length || (prevTipo !== doc.tipoLabel && current !== RENDER)) current = -1;
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
  add('Render 3D', RENDER);
  doc.views.forEach((v, i) => add(v.title, i));
}

function draw(refit) {
  const is3d = current === RENDER;
  stage.hidden = is3d;
  stage3d.hidden = !is3d;
  for (const id of ['zoom-in', 'zoom-out', 'zoom-fit', 'dl-svg', 'dl-dxf']) $(id).hidden = is3d;
  if (!window.claude?.use) $('print').hidden = is3d;
  if (is3d) {
    svgText = '';
    show3d();
    return;
  }
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

async function show3d() {
  $('msg').textContent = '';
  try {
    if (viewer3d) viewer3d.setModel(model);
    else {
      stage3d.dataset.loading = 'Cargando el render…';
      viewer3d = await mount3d(stage3d, model);
    }
  } catch (err) {
    $('msg').textContent = `No se pudo mostrar el render 3D: ${err.message}`;
  } finally {
    delete stage3d.dataset.loading;
  }
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
window.addEventListener('resize', () => { if (current !== RENDER) fit(); });

// --------------------------------------------------------- Exportar

function fileName(ext) {
  const base = (doc?.nombre || 'plano')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'plano';
  const part = current === RENDER ? 'render3d' : current < 0 ? 'lamina' : doc.views[current].title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_').toLowerCase();
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

$('dl-dxf').addEventListener('click', () => {
  if (!svgText) return;
  download(new Blob([dxfBytes(svgToDxf(svgText))], { type: 'application/dxf' }), fileName('dxf'));
});

$('dl-png').addEventListener('click', async () => {
  if (current === RENDER) {
    const blob = await viewer3d?.toBlob();
    if (blob) download(blob, fileName('png'));
    return;
  }
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
  if (recog) recog.stop();
  const description = $('ai-text').value.trim();
  const status = $('ai-status');
  if (!description && !aiImages.length) {
    status.textContent = 'Escribe una descripción o sube una imagen.';
    return;
  }
  const btn = $('ai-go');
  btn.disabled = true;
  status.textContent = aiImages.length ? 'Leyendo la imagen y generando instrucciones…' : 'Generando instrucciones…';
  try {
    const text = await describeToInstructions({
      apiKey: aiKey.value.trim(),
      description,
      current: $('ai-keep').checked ? src.value : '',
      sample: host.sample,
      images: aiImages,
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

// ------------------------------------------------- Imágenes adjuntas

let aiImages = [];
const thumbs = $('ai-thumbs');
if (!window.claude?.use) $('ai-img-btn').hidden = $('ai-cam-btn').hidden = false;

function renderThumbs() {
  thumbs.replaceChildren(...aiImages.map((img, i) => {
    const li = document.createElement('li');
    const im = document.createElement('img');
    im.src = img.url;
    im.alt = img.name || `Imagen ${i + 1}`;
    const rm = document.createElement('button');
    rm.type = 'button';
    rm.textContent = '×';
    rm.title = 'Quitar imagen';
    rm.setAttribute('aria-label', `Quitar ${im.alt}`);
    rm.addEventListener('click', () => {
      URL.revokeObjectURL(img.url);
      aiImages.splice(i, 1);
      renderThumbs();
    });
    li.append(im, rm);
    return li;
  }));
}

async function addImageFiles(files) {
  const status = $('ai-status');
  if ($('ai-img-btn').hidden) {
    status.textContent = 'Esta vista no permite enviar imágenes a Claude.';
    return;
  }
  const max = imageLimits?.maxCount || 1;
  for (const f of files) {
    if (aiImages.length >= max) {
      status.textContent = `Puedes adjuntar hasta ${max} ${max > 1 ? 'imágenes' : 'imagen'}.`;
      break;
    }
    if (imageLimits?.maxInputBytes && f.size > imageLimits.maxInputBytes) {
      status.textContent = `"${f.name}" es demasiado grande.`;
      continue;
    }
    try {
      aiImages.push(await prepareImage(f));
      status.textContent = 'Imagen lista. Agrega detalles si quieres y pulsa Generar instrucciones.';
    } catch {
      status.textContent = `No se pudo abrir "${f.name || 'la imagen'}". Prueba con una foto JPG o PNG.`;
    }
  }
  renderThumbs();
}

$('ai-img').addEventListener('change', (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  addImageFiles(files);
});

// ------------------------------------------------------- Tomar foto
// En el teléfono, el campo con capture="environment" abre la cámara trasera.
// En una computadora se usa la cámara web en un diálogo; si no hay acceso,
// se avisa y se puede subir o pegar la imagen.

const isTouch = window.matchMedia?.('(pointer: coarse)').matches;
const camInput = $('ai-cam');
const camDialog = $('cam-dialog');
const camVideo = $('cam-video');
let camStream = null;

camInput.addEventListener('change', (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  addImageFiles(files);
});

function stopCamera() {
  camStream?.getTracks().forEach((t) => t.stop());
  camStream = null;
  camVideo.srcObject = null;
  if (camDialog.open) camDialog.close();
}

$('ai-cam-btn').addEventListener('click', async (e) => {
  if (isTouch || !navigator.mediaDevices?.getUserMedia || !camDialog.showModal) return; // abre la cámara del teléfono
  e.preventDefault();
  const status = $('ai-status');
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } }, audio: false });
    camVideo.srcObject = camStream;
    camDialog.showModal();
  } catch (err) {
    stopCamera();
    status.textContent = err?.name === 'NotFoundError'
      ? 'No se encontró ninguna cámara. Usa "Subir imagen" o pega una captura con Ctrl+V.'
      : 'No hay permiso para usar la cámara aquí. Usa "Subir imagen" o pega una captura con Ctrl+V.';
  }
});

$('cam-cancel').addEventListener('click', stopCamera);
camDialog.addEventListener('close', stopCamera);
$('cam-shot').addEventListener('click', async () => {
  const w = camVideo.videoWidth, h = camVideo.videoHeight;
  if (!w || !h) return;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(camVideo, 0, 0, w, h);
  const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.92));
  stopCamera();
  if (blob) addImageFiles([new File([blob], 'foto.jpg', { type: 'image/jpeg' })]);
});

const imagesIn = (list) => [...(list || [])].filter((f) => f.type?.startsWith('image/'));
const showAiTab = () => document.querySelector('.tabs button[data-tab="ai"]').click();

// Pegar una imagen (Ctrl+V / Cmd+V) en cualquier parte la adjunta a "Describir con IA".
document.addEventListener('paste', (e) => {
  const files = imagesIn([...(e.clipboardData?.items || [])].filter((it) => it.kind === 'file').map((it) => it.getAsFile()));
  if (!files.length) return;
  e.preventDefault();
  showAiTab();
  addImageFiles(files);
});

// Arrastrar y soltar imágenes sobre el panel de la izquierda.
const editor = document.querySelector('.editor');
editor.addEventListener('dragover', (e) => {
  if ([...(e.dataTransfer?.items || [])].some((it) => it.kind === 'file')) {
    e.preventDefault();
    editor.classList.add('dropping');
  }
});
editor.addEventListener('dragleave', (e) => { if (!editor.contains(e.relatedTarget)) editor.classList.remove('dropping'); });
editor.addEventListener('drop', (e) => {
  editor.classList.remove('dropping');
  const files = imagesIn(e.dataTransfer?.files);
  if (!files.length) return;
  e.preventDefault();
  showAiTab();
  addImageFiles(files);
});

// --------------------------------------------------- Dictado por voz

// Web Speech API (Chrome, Edge, Safari). Donde no existe, el botón no aparece.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const PAGES_URL = 'https://carlosaperezp77.github.io/PlanMaker/';
const micBtn = $('ai-mic');
const micStatus = $('ai-mic-status');
let recog = null;

const MIC_ERRORS = {
  'not-allowed': 'No hay permiso para usar el micrófono. Actívalo en el navegador o usa el dictado del teclado.',
  'service-not-allowed': 'Este navegador o visor no permite el dictado aquí. Puedes usar el dictado del teclado de tu teléfono.',
  'audio-capture': 'No se encontró ningún micrófono.',
  'network': 'El dictado necesita conexión a internet.',
  'no-speech': 'No se oyó nada. Vuelve a intentarlo.',
  'language-not-supported': 'El dictado en español no está disponible en este navegador.',
};

function setListening(on) {
  micBtn.setAttribute('aria-pressed', String(on));
  micBtn.querySelector('span').textContent = on ? 'Detener' : 'Dictar';
}

function startDictation() {
  const box = $('ai-text');
  recog = new Recognition();
  recog.lang = /^es\b/i.test(navigator.language) ? navigator.language : 'es-ES';
  recog.continuous = true;
  recog.interimResults = true;
  let base = box.value;
  let failed = false;
  recog.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript.trim();
      if (!t) continue;
      if (e.results[i].isFinal) {
        base = base && !/\s$/.test(base) ? `${base} ${t}` : base + t;
      } else {
        interim += (interim ? ' ' : '') + t;
      }
    }
    box.value = interim ? (base ? `${base} ${interim}` : interim) : base;
    micStatus.textContent = 'Escuchando…';
  };
  recog.onerror = (e) => {
    if (e.error === 'aborted') return;
    failed = true;
    const blocked = e.error === 'not-allowed' || e.error === 'service-not-allowed';
    micStatus.textContent = blocked && window.claude?.use
      ? `La vista previa de claude.ai no deja usar el micrófono. Abre la app en ${PAGES_URL} o usa el dictado del teclado.`
      : MIC_ERRORS[e.error] || `Error de dictado: ${e.error}`;
  };
  recog.onend = () => {
    box.value = base;
    recog = null;
    setListening(false);
    if (!failed) micStatus.textContent = '';
  };
  try {
    recog.start();
    setListening(true);
    micStatus.textContent = 'Escuchando… habla con naturalidad.';
  } catch (err) {
    recog = null;
    micStatus.textContent = `No se pudo iniciar el dictado: ${err.message}`;
  }
}

// La vista previa de claude.ai no da acceso al micrófono, pero el dictado del
// sistema (Windows + H, el de macOS o el micrófono del teclado del teléfono)
// sí escribe en el cuadro de texto. El botón enseña cómo activarlo.
function systemDictationHint() {
  const ua = navigator.userAgent;
  const pf = navigator.userAgentData?.platform || ua;
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return 'Toca el micrófono 🎤 de tu teclado y habla.';
  if (/Mac/i.test(pf)) return 'Pulsa dos veces la tecla Fn (o 🎤) para dictar y habla.';
  if (/Win/i.test(pf)) return 'Pulsa las teclas Windows + H para dictar y habla.';
  return 'Activa el dictado por voz de tu sistema y habla.';
}

if (window.claude?.use) {
  micBtn.hidden = false;
  micBtn.addEventListener('click', () => {
    const box = $('ai-text');
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
    micStatus.textContent = systemDictationHint();
  });
} else if (Recognition) {
  micBtn.hidden = false;
  micBtn.addEventListener('click', () => {
    if (recog) recog.stop();
    else startDictation();
  });
}

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
