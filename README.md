# PlanMaker

Aplicación web que convierte instrucciones de texto en planos técnicos: plantas,
fachadas o alzados, cortes, perfiles y vistas isométricas, listos para exportar.
Funciona en el navegador, sin instalar nada ni servidor propio.

Tres tipos de proyecto:

| Tipo | Unidades | Vistas que genera |
| --- | --- | --- |
| **Edificio** (`casa`, `edificio`…) | m | Planta por piso con muros, puertas, ventanas, áreas y cotas · Fachada sur · Fachada este · Corte A-A · Volumetría isométrica |
| **Pieza mecánica** (`pieza`) | mm | Alzado · Vista lateral izquierda · Planta (primer diedro, ISO E) con cotas, ejes y líneas ocultas · Isométrica |
| **Terreno** (`terreno`, `lote`…) | m | Planta con linderos, cotas de vértices, curvas de nivel y construcciones · Cuadro de coordenadas con distancias y rumbos · Perfiles longitudinal y transversal |

Las vistas de cada lámina comparten una escala normalizada (1:50, 1:100, 2:1…)
y la lámina A3 incluye marco, cajetín y notas (área útil, volumen, desnivel…).

Además, la pestaña **Render 3D** muestra el modelo con luz y sombras para
girarlo y acercarlo con el ratón o los dedos: la casa con sus muros, vanos,
losas y cubierta; la pieza con sus agujeros y ranuras; el terreno como maqueta
con su relieve y construcciones. En los edificios cada recinto se amuebla
según su nombre (camas, sofás, comedor, cocina, baños…), con pisos de madera o
cerámica, césped, palmeras, y terrazas y piscinas si se indican. Se puede ver
**sin techo**, como maqueta (piso por piso), o **con techo**, y el PNG se
exporta al doble de resolución. Usa three.js, que se carga desde CDN solo al
abrir esa pestaña.

## Uso

```bash
npm start          # http://localhost:5173
npm test           # pruebas
npm run build      # dist/planmaker.html, un único archivo que se abre sin servidor
```

**+ Nuevo plano** borra todo y empieza con una plantilla mínima de edificio,
pieza mecánica o terreno. Escribe las instrucciones a la izquierda; el plano se
actualiza al instante. Cada
vista puede verse sola y exportarse como **SVG**, **PNG**, **DXF** (AutoCAD y
otros CAD, con una capa por tipo de línea, en mm de papel a la escala de la
lámina) o **PDF** (Imprimir → Guardar como PDF, en A3 horizontal). El render 3D
se descarga como PNG.

La pestaña **Describir con IA** convierte una descripción libre ("una casa de
un piso con tres dormitorios…") en instrucciones usando la API de Claude, con
la clave de API de quien la usa (se guarda solo en su navegador). El botón
**Subir imagen** permite subir (o pegar con Ctrl+V, o arrastrar) una foto o escaneo de un plano, y **Foto** la toma con la cámara (la del teléfono, o la cámara web en una computadora), un croquis a mano o la
foto de una pieza, y Claude lo convierte en instrucciones. El botón
**Dictar** permite describirlo hablando, con el reconocimiento de voz del
navegador (Chrome, Edge o Safari; pide permiso para el micrófono la primera vez).
Dentro de la vista previa de claude.ai el navegador no da el micrófono a la
página; ahí el botón pone el cursor en el cuadro e indica cómo usar el dictado
del sistema (Windows + H, Fn dos veces en Mac o el micrófono del teclado del
teléfono), y la IA funciona sin clave.

## Cámara en la vista previa de claude.ai

La vista previa de claude.ai no puede usar la cámara de la computadora. Ahí
«Foto» abre `camara.html` (publicada en GitHub Pages) en una ventana aparte;
la foto vuelve sola a PlanMaker o queda copiada para pegarla con Ctrl+V.

## App de Android

`android/` envuelve la app web en un WebView. GitHub Actions genera
`PlanMaker.apk` en cada cambio (artefacto del flujo «App de Android») y la
publica junto a la página: https://carlosaperezp77.github.io/PlanMaker/PlanMaker.apk .
Para compilar en local: `npm run build` y luego `gradle assembleDebug` en
`android/` (requiere el SDK de Android). En la app, «Foto» abre la cámara, los
archivos se guardan con el selector de Android e Imprimir usa el servicio de
impresión del teléfono. Describir con IA necesita una clave API de Anthropic.

## Instrucciones

Una orden por línea; `#` para comentarios. Coordenadas `x,y` con x hacia el este
e y hacia el norte. Se aceptan decimales con punto o coma (`0,9`).

### Edificio

```text
casa Familia Pérez
pisos 2
altura 2.8                      # entre pisos
muro 0.15                       # espesor
techo dos aguas altura 1.8      # o: techo plano / techo un agua altura 1
habitacion Sala 6x4.5 en 0,0    # ancho x fondo, esquina suroeste (a ejes de muro)
habitacion Cocina 3.5x4.5       # sin "en": se coloca a continuación
puerta Sala sur 1 a 2.5         # lado, ancho, distancia desde el extremo oeste/sur
ventana Cocina este 1.2 antepecho 1 alto 1.2
piso 2                          # lo que sigue va en el piso 2
habitacion Dormitorio 1 4.5x4.5 en 0,0
```

Un piso sin habitaciones propias repite la planta del piso 1.

### Pieza mecánica

```text
pieza Soporte de rodamiento
material Acero SAE 1020
bloque 120x60x15                 # largo x ancho x alto [en x,y,z]
cilindro 40 alto 35 en 60,30     # se apoya sobre lo que haya debajo; "interior 20" lo hace hueco
agujero 20 pasante en 60,30
agujero 8 prof 10 en 15,15
ranura 8x24 prof 5 en 28,18      # x,y = esquina
```

### Terreno

```text
terreno Lote 14
punto 0,0 cota 100               # vértices en orden
punto 32,0 cota 101.2
punto 35,22 cota 104.5
punto 12,28 cota 105.8
cota 104 en 18,16                # cota suelta
curvas cada 0.5
construccion Casa 12x9 en 10,6
```

También `rectangulo 20x30`, o una poligonal por rumbos: `lado 40 rumbo 90 cota 50`
(azimut en grados desde el norte; si no cierra, el último lado se calcula solo).

## Estructura

- `src/parser.js` — interpreta las instrucciones y valida (los errores indican la línea).
- `src/svg.js` — motor de dibujo: transformación a escala, cotas, lámina y cajetín.
- `src/views/` — vistas de edificio, pieza y terreno.
- `src/render3d.js` — render 3D (primitivas del modelo → three.js).
- `src/dxf.js` — conversión de la lámina SVG a DXF R12.
- `src/app.js` — interfaz, zoom, exportación. `src/ai.js` — asistente opcional.
