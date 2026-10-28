// Ejemplos que aparecen en el selector de la app.

export const EXAMPLES = [
  {
    id: 'casa',
    label: 'Casa de dos pisos',
    text: `casa Familia Pérez
pisos 2
altura 2.8
muro 0.15
techo dos aguas altura 1.8

# Planta baja (x hacia el este, y hacia el norte)
habitacion Sala 6x4.5 en 0,0
habitacion Cocina 3.5x4.5 en 6,0
habitacion Comedor 4x3.5 en 0,4.5
habitacion Baño 2x3.5 en 4,4.5
habitacion Estudio 3.5x3.5 en 6,4.5

puerta Sala sur 1 a 2.5
ventana Sala sur 2 a 0.3
ventana Cocina sur 1.5
puerta Sala norte 0.9 a 1.5
puerta Comedor este 0.8
ventana Comedor oeste 1.5
ventana Comedor norte 1.2
ventana Baño norte 0.6 antepecho 1.6 alto 0.5
puerta Baño oeste 0.7
puerta Estudio oeste 0.8 a 1
ventana Estudio norte 1.5
ventana Estudio este 1.2
ventana Cocina este 1.2
puerta Cocina oeste 0.9 a 2

piso 2
habitacion Dormitorio 1 4.5x4.5 en 0,0
habitacion Dormitorio 2 5x4.5 en 4.5,0
habitacion Pasillo 9.5x1.2 en 0,4.5
habitacion Baño 2.5x2.3 en 0,5.7
habitacion Dormitorio 3 7x2.3 en 2.5,5.7
ventana Dormitorio 1 sur 1.5
ventana Dormitorio 2 sur 1.8
ventana Dormitorio 1 oeste 1.2
ventana Dormitorio 2 este 1.2
puerta Dormitorio 1 norte 0.8 a 3
puerta Dormitorio 2 norte 0.8 a 1
puerta Baño sur 0.7 a 1
puerta Dormitorio 3 sur 0.8 a 3
ventana Dormitorio 3 norte 2
ventana Baño norte 0.6 antepecho 1.6 alto 0.5`,
  },
  {
    id: 'villa',
    label: 'Casa con terraza y piscina',
    text: `casa Villa del Sol
altura 2.8
muro 0.2
techo dos aguas altura 1.6

habitacion Dormitorio 2 4x5 en 0,0
habitacion Sala comedor 7x5 en 4,0
habitacion Dormitorio principal 4.5x5 en 11,0
habitacion Baño 2.5x4 en 0,5
habitacion Cocina 4x4 en 2.5,5
habitacion Estudio 4.5x4 en 6.5,5
habitacion Baño principal 2.5x4 en 11,5
habitacion Vestidor 2x4 en 13.5,5

puerta Sala comedor sur 1 a 3
ventanal Sala comedor sur 2.4 a 4.3
ventana Sala comedor sur 1.2 a 0.8
puerta Dormitorio 2 este 0.9 a 3.8
ventana Dormitorio 2 sur 1.5
ventana Dormitorio 2 oeste 1.2
puerta Baño sur 0.8 a 1.5
ventana Baño norte 0.6 antepecho 1.6 alto 0.5
puerta Cocina sur 0.9 a 2.5
ventana Cocina norte 1.5
puerta Estudio sur 0.9 a 1
ventana Estudio norte 1.5
puerta Dormitorio principal oeste 0.9 a 3.8
ventanal Dormitorio principal este 2 a 1.5
ventana Dormitorio principal sur 1.5
puerta Baño principal sur 0.8 a 0.5
ventana Baño principal norte 0.6 antepecho 1.6 alto 0.5
puerta Vestidor sur 0.8 a 0.6

terraza 9x9 en 15.5,0
piscina 6x3 en 17,4.5`,
  },
  {
    id: 'pieza',
    label: 'Soporte mecánico',
    text: `pieza Soporte de rodamiento
material Acero SAE 1020

bloque 120x60x15
cilindro 40 alto 35 en 60,30
agujero 20 pasante en 60,30
agujero 10 pasante en 15,15
agujero 10 pasante en 105,15
agujero 10 pasante en 15,45
agujero 10 pasante en 105,45
ranura 8x24 prof 5 en 28,18`,
  },
  {
    id: 'terreno',
    label: 'Lote con pendiente',
    text: `terreno Lote 14 - Urbanización El Mirador

# Vértices en orden, con su cota (m)
punto 0,0 cota 100
punto 32,0 cota 101.2
punto 35,22 cota 104.5
punto 12,28 cota 105.8
punto -2,18 cota 103

cota 104 en 18,16
curvas cada 0.5
construccion Casa 12x9 en 10,6
construccion Piscina 6x3 en 24,4`,
  },
  {
    id: 'lote-rumbos',
    label: 'Terreno por rumbos',
    text: `terreno Parcela La Esperanza
# Levantamiento por lados: longitud y azimut desde el norte.
# El último lado (de vuelta a P1) se calcula solo.
lado 40 rumbo 90 cota 50
lado 25 rumbo 10 cota 51
lado 38 rumbo 265 cota 53
curvas cada 0.5`,
  },
  {
    id: 'brida',
    label: 'Brida simple',
    text: `pieza Brida
material Aluminio 6061
cilindro 100 alto 12 en 50,50
cilindro 50 alto 25 en 50,50 interior 30
agujero 10 pasante en 85,50
agujero 10 pasante en 15,50
agujero 10 pasante en 50,85
agujero 10 pasante en 50,15`,
  },
];

// Plantillas mínimas para «Nuevo plano».
export const STARTERS = {
  edificio: `casa Mi proyecto
pisos 1
altura 2.6
muro 0.15

# Escribe tus espacios: habitacion Nombre anchoxlargo en x,y
habitacion Sala 4x4 en 0,0
`,
  pieza: `pieza Mi pieza
material Acero

# Medidas en mm: bloque largoxanchoxalto
bloque 100x50x10
`,
  terreno: `terreno Mi lote

# Vértices en orden, con su cota (m)
punto 0,0 cota 100
punto 20,0 cota 100
punto 20,30 cota 101
punto 0,30 cota 101
`,
};
