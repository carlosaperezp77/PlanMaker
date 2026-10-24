// Asistente opcional: convierte una descripción libre ("una casa de dos pisos
// con tres cuartos...") en instrucciones de PlanMaker usando la API de Claude.
// La clave de API del usuario solo se guarda en su navegador.

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm';

const SYSTEM = `Eres el asistente de PlanMaker, una app que dibuja planos a partir de instrucciones de texto.
Convierte la descripción del usuario en instrucciones de PlanMaker. Responde SOLO con las instrucciones, sin explicaciones ni bloques de código. Puedes usar comentarios con #.

Reglas generales: una orden por línea; decimales con punto; coordenadas "x,y" (x hacia el este, y hacia el norte).
La primera línea indica el tipo: "edificio <nombre>" (o "casa <nombre>"), "pieza <nombre>" o "terreno <nombre>".

EDIFICIO (metros):
pisos N | altura H (entre pisos) | muro E (espesor) | techo plano | techo dos aguas altura H | techo un agua altura H
habitacion <Nombre> <ancho>x<fondo> en x,y      (x,y = esquina suroeste, a ejes de muro; las habitaciones vecinas comparten borde)
piso N                                           (las habitaciones siguientes van en ese piso; si un piso no tiene habitaciones repite la planta del piso 1)
puerta <Habitación> <norte|sur|este|oeste> [ancho] [a distancia desde el inicio del muro]
ventana <Habitación> <lado> [ancho] [a distancia] [antepecho H] [alto H]
Las distancias "a" se miden desde el extremo oeste (muros norte/sur) o sur (muros este/oeste).

PIEZA (milímetros):
material <texto>
bloque <largo>x<ancho>x<alto> [en x,y,z]
cilindro <diámetro> alto <alto> en x,y [interior <diámetro>]   (se apoya sobre lo que haya debajo)
agujero <diámetro> pasante en x,y | agujero <diámetro> prof <p> en x,y
ranura <largo>x<ancho> prof <p> en x,y   (x,y = esquina)

TERRENO (metros):
punto x,y cota z            (vértices en orden)
lado <longitud> rumbo <azimut°> [cota z]   (alternativa por poligonal; el último lado se cierra solo)
rectangulo <ancho>x<fondo>
cota z en x,y               (cota suelta interior)
curvas cada <intervalo>
construccion <Nombre> <ancho>x<fondo> en x,y

IMÁGENES: si el usuario adjunta imágenes (foto o escaneo de un plano, un croquis a mano, una foto de una pieza o de un terreno), úsalas como fuente principal: identifica el tipo de proyecto, lee las cotas y los nombres que se vean, respeta las proporciones y la distribución, y ubica puertas y ventanas donde aparecen. Si la imagen no tiene medidas, estímalas con proporciones realistas (una puerta mide unos 0.9 m) y dilo en un comentario # al inicio. El texto del usuario, si lo hay, manda sobre la imagen.

Elige medidas realistas cuando el usuario no las dé, y verifica que las habitaciones no se superpongan y que puertas y ventanas quepan en su muro.`;

let sdkPromise = null;

function userContent(description, current) {
  return current?.trim()
    ? `Instrucciones actuales:\n${current}\n\nCambios o descripción nueva:\n${description}`
    : description;
}

function clean(text) {
  return text.replace(/^```[a-z]*\n?|```$/gim, '').trim();
}

/**
 * Convierte la descripción. Si la página corre dentro de claude.ai y hay
 * `sample` (Claude sin clave propia), lo usa; si no, llama a la API con la clave.
 */
export async function describeToInstructions({ apiKey, description, current, sample, images = [] }) {
  const content = userContent(
    description || 'Dibuja el plano que muestran las imágenes adjuntas.',
    current,
  ) + (images.length ? `\n\n(${images.length > 1 ? `${images.length} imágenes adjuntas` : '1 imagen adjunta'}.)` : '');
  if (sample) {
    const opts = { modelTier: 'default' };
    if (images.length) opts.images = images.map((i) => i.blob);
    const { text } = await sample(`${SYSTEM}\n\n---\n\n${content}`, opts);
    const out = clean(text || '');
    if (!out) throw new Error('La respuesta llegó vacía.');
    return out;
  }
  if (!apiKey) throw new Error('Falta la clave de API de Anthropic.');
  sdkPromise ??= import(/* @vite-ignore */ SDK_URL);
  const { default: Anthropic } = await sdkPromise;
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    output_config: { effort: 'medium' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        ...images.map((i) => ({
          type: 'image',
          source: { type: 'base64', media_type: i.type, data: i.base64 },
        })),
        { type: 'text', text: content },
      ],
    }],
  });
  if (response.stop_reason === 'refusal') {
    throw new Error('El modelo no pudo atender esta descripción. Prueba a reformularla.');
  }
  const text = clean(response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n'));
  if (!text) throw new Error('La respuesta llegó vacía.');
  return text;
}

/**
 * Prepara una imagen para enviarla: la reduce a 1568 px por lado como máximo
 * (lo que el modelo aprovecha) y la pasa a JPEG. Devuelve el blob, su tipo,
 * su base64 y una URL para la miniatura.
 */
export async function prepareImage(file, maxSide = 1568) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo leer la imagen.'))), 'image/jpeg', 0.88));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { blob, type: 'image/jpeg', base64: btoa(bin), url: URL.createObjectURL(blob), name: file.name };
}
