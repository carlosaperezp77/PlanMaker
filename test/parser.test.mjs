import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/parser.js';

test('detecta el tipo por la primera línea o por las palabras usadas', () => {
  assert.equal(parse('casa X\nhabitacion A 3x3').tipo, 'edificio');
  assert.equal(parse('bloque 10x10x10').tipo, 'pieza');
  assert.equal(parse('punto 0,0\npunto 1,0\npunto 0,1').tipo, 'terreno');
  assert.equal(parse('hola').tipo, null);
});

test('habitaciones con nombres de varias palabras, coma decimal y posición automática', () => {
  const m = parse('casa\nhabitacion Dormitorio 2 4x3\nsala 5,5x4\nhabitacion Baño 2x2 en 0,3');
  assert.deepEqual(m.errors, []);
  assert.deepEqual(m.rooms.map((r) => [r.nombre, r.x, r.y, r.w, r.d]), [
    ['Dormitorio 2', 0, 0, 4, 3],
    ['sala', 4, 0, 5.5, 4],
    ['Baño', 0, 3, 2, 2],
  ]);
});

test('puertas y ventanas: lado, ancho, posición y validación', () => {
  const m = parse('casa\nhabitacion Sala 5x4\npuerta Sala sur 1 a 2\nventana sala norte\npuerta Sala este 9\npuerta Cocina sur');
  const [p, v] = m.openings;
  assert.equal(p.lado, 'S');
  assert.equal(p.ancho, 1);
  assert.equal(p.offset, 2);
  assert.equal(v.lado, 'N');
  assert.equal(v.ancho, 1.2);
  assert.equal(v.offset, (5 - 1.2) / 2);
  assert.equal(m.errors.length, 2);
  assert.match(m.errors[0].msg, /no cabe/);
  assert.match(m.errors[1].msg, /Cocina/);
});

test('pisos: el número de pisos crece con "piso N"', () => {
  const m = parse('casa\nhabitacion A 3x3\npiso 3\nhabitacion B 3x3');
  assert.equal(m.pisos, 3);
  assert.equal(m.rooms[1].piso, 3);
});

test('pieza: los sólidos se apilan y los agujeros parten de la cara superior', () => {
  const m = parse('pieza\nbloque 100x50x10\ncilindro 20 alto 30 en 50,25\nagujero 8 prof 5 en 10,10\nagujero 6 pasante en 50,25');
  assert.deepEqual(m.errors, []);
  assert.equal(m.solids[1].z, 10);
  assert.deepEqual([m.cuts[0].z0, m.cuts[0].z1], [5, 10]);
  assert.deepEqual([m.cuts[1].z0, m.cuts[1].z1], [0, 40]);
});

test('pieza: agujero fuera de la pieza es un error', () => {
  const m = parse('pieza\nbloque 10x10x10\nagujero 3 en 50,50');
  assert.equal(m.cuts.length, 0);
  assert.match(m.errors[0].msg, /no cae/);
});

test('terreno por rumbos: calcula vértices y el lado de cierre', () => {
  const m = parse('terreno\nlado 10 rumbo 90\nlado 10 rumbo 0\nlado 10 rumbo 270');
  assert.deepEqual(m.errors, []);
  assert.deepEqual(m.vertices.map((v) => [v.x, v.y]), [[0, 0], [10, 0], [10, 10], [0, 10]]);
  assert.equal(Math.round(m.cierre.dist), 10);
  assert.equal(Math.round(m.cierre.az), 180);
});

test('terreno rectangular y cotas sueltas', () => {
  const m = parse('lote 20x30\ncota 101,5 en 5,5\ncurvas cada 0.25');
  assert.equal(m.vertices.length, 4);
  assert.deepEqual(m.spots, [{ x: 5, y: 5, z: 101.5 }]);
  assert.equal(m.curvas, 0.25);
});
