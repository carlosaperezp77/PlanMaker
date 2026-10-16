// Del modelo a la lámina: elige las vistas según el tipo de proyecto.

import { composeSheet, composeSingle } from './svg.js';
import { edificioViews, edificioNotes } from './views/edificio.js';
import { piezaViews, piezaNotes } from './views/pieza.js';
import { terrenoViews, terrenoNotes } from './views/terreno.js';

const UNIT_MM = { mm: 1, cm: 10, m: 1000 };

export function buildDocument(model) {
  let views, notas, tipoLabel, layout;
  if (model.tipo === 'edificio') {
    views = edificioViews(model);
    notas = edificioNotes(model);
    tipoLabel = 'Arquitectónico';
  } else if (model.tipo === 'pieza') {
    views = piezaViews(model);
    notas = piezaNotes(model);
    tipoLabel = 'Pieza mecánica';
  } else {
    views = terrenoViews(model);
    notas = terrenoNotes(model, views);
    tipoLabel = 'Topográfico';
    // La planta ocupa la mitad izquierda; tabla y perfiles a la derecha.
    layout = { cols: 2, rows: 3, cells: [{ c: 0, r: 0, rs: 3 }, { c: 1, r: 0 }, { c: 1, r: 1 }, { c: 1, r: 2 }] };
  }
  return {
    nombre: model.nombre,
    tipoLabel,
    unidad: model.unidad,
    unitMM: UNIT_MM[model.unidad] ?? 1,
    material: model.material,
    notas,
    views,
    layout,
  };
}

/** ¿El modelo tiene lo mínimo para dibujarse? */
export function drawable(model) {
  if (!model?.tipo) return false;
  if (model.tipo === 'edificio') return model.rooms.length > 0;
  if (model.tipo === 'pieza') return model.solids.length > 0;
  return model.vertices.length >= 3;
}

export function renderSheet(doc) {
  return composeSheet(doc);
}

export function renderView(doc, i) {
  return composeSingle(doc.views[i], doc.unitMM);
}
