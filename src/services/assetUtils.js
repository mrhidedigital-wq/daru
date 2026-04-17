// AssetManagerUtils.js
// Utilidades compartidas del AssetManager:
//   - Paleta de colores
//   - Tipos de sujeto / etiquetas de vistas
//   - Gemini image generation (con referencias)
//   - Compresión canvas antes de subir
//   - Upload a Supabase Storage (base64 y File)
//   - Prompts de sujeto, escena, frame inicio, frame final
//   - Constantes cinematográficas (PLANOS, ANGULOS_H/V, LENTES, DESENFOQUE)
//
// CONTRATO ANTI-ALUCINACIÓN:
// Todas las imágenes generadas aquí son SAGRADAS.
// El DAG las lee desde subject_assets y scene_assets.
// NUNCA inventa sujeto, escena o frame desde cero en el DAG.

import { supabase } from '../lib/supabase/client';

// ============================================================
// PALETA
// ============================================================
export const C = {
  bg:      '#0F0F0F',
  panel:   '#1A1A1A',
  card:    '#222222',
  border:  '#2E2E2E',
  accent:  '#00A8E8',
  success: '#00D084',
  warning: '#FFB800',
  error:   '#FF4757',
  text:    '#DDDDDD',
  muted:   '#777777',
  dim:     '#444444',
  purple:  '#9B59B6',
};

// ============================================================
// TIPOS DE SUJETO
// ============================================================
export const SUBJECT_TYPES = [
  { id: 'person',   label: 'PERSONA',   icon: '👤', views: ['frontal', 'tres_cuartos', 'perfil'] },
  { id: 'vehicle',  label: 'VEHÍCULO',  icon: '🚗', views: ['frente', 'lateral', 'tres_cuartos_trasero'] },
  { id: 'moto',     label: 'MOTO',      icon: '🏍️', views: ['frente', 'lateral', 'tres_cuartos'] },
  { id: 'animal',   label: 'ANIMAL',    icon: '🐕', views: ['frente', 'lateral', 'tres_cuartos'] },
  { id: 'object',   label: 'OBJETO',    icon: '📦', views: ['frente', 'lado', 'arriba'] },
  { id: 'place',    label: 'LUGAR',     icon: '🏢', views: ['frente', 'angulo', 'detalle'] },
];

export const VIEW_LABELS = {
  frontal:              'FRONTAL',
  tres_cuartos:         '3/4',
  perfil:               'PERFIL',
  frente:               'FRENTE',
  lateral:              'LATERAL',
  tres_cuartos_trasero: '3/4 TRASERO',
  lado:                 'LADO',
  arriba:               'ARRIBA',
  angulo:               'ÁNGULO',
  detalle:              'DETALLE',
};

// ============================================================
// CONSTANTES CINEMATOGRÁFICAS
// ============================================================
export const PLANOS = [
  { value: 'gran_plano_general',       label: 'Gran Plano General' },
  { value: 'plano_general',            label: 'Plano General' },
  { value: 'plano_entero',             label: 'Plano Entero' },
  { value: 'plano_americano',          label: 'Plano Americano' },
  { value: 'plano_medio',              label: 'Plano Medio' },
  { value: 'primer_plano',             label: 'Primer Plano' },
  { value: 'primerisimo_primer_plano', label: 'P.P.P.' },
];

export const ANGULOS_H = [
  { value: 'frontal',          label: 'Frontal' },
  { value: 'tres_cuartos_der', label: '3/4 Der.' },
  { value: 'tres_cuartos_izq', label: '3/4 Izq.' },
  { value: 'lateral_der',      label: 'Lat. Der.' },
  { value: 'lateral_izq',      label: 'Lat. Izq.' },
];

export const ANGULOS_V = [
  { value: 'normal',       label: 'Normal' },
  { value: 'picado',       label: 'Picado' },
  { value: 'contrapicado', label: 'Contrapicado' },
  { value: 'cenital',      label: 'Cenital' },
  { value: 'nadir',        label: 'Nadir' },
  { value: 'holandes',     label: 'Holandés' },
];

export const LENTES = [
  { value: '24mm',  label: '24mm',  fov: 84, desc: 'gran angular — distorsión, espacio amplio' },
  { value: '35mm',  label: '35mm',  fov: 63, desc: 'reportaje — perspectiva natural amplia' },
  { value: '50mm',  label: '50mm',  fov: 47, desc: 'estándar — visión humana natural' },
  { value: '85mm',  label: '85mm',  fov: 28, desc: 'retrato — compresión, bokeh natural' },
  { value: '135mm', label: '135mm', fov: 18, desc: 'teleobjetivo — compresión fuerte, bokeh intenso' },
];

export const DESENFOQUE = [
  { value: 'nitido',       label: 'Nítido',      desc: 'todo en foco, f/8 o más' },
  { value: 'bokeh_suave',  label: 'Bokeh suave', desc: 'fondo ligeramente desenfocado, f/2.8' },
  { value: 'bokeh_fuerte', label: 'Bokeh fuerte',desc: 'fondo muy desenfocado, f/1.4' },
  { value: 'rack_focus',   label: 'Rack focus',  desc: 'transición de foco entre planos' },
];

// Usado internamente en prompts — no en UI selectors
export const PLANO_DESCRIPCION = {
  gran_plano_general:       { en: 'extreme wide shot',  body: 'the subject appears very small within a vast environment, full landscape dominant' },
  plano_general:            { en: 'wide shot',          body: 'full body visible from head to toe, environment clearly visible around the subject' },
  plano_entero:             { en: 'full shot',          body: 'complete body from head to toe fills the frame, minimal environment visible' },
  plano_americano:          { en: 'american shot',      body: 'framed from mid-thigh up, hands and upper body clearly visible' },
  plano_medio:              { en: 'medium shot',        body: 'framed from waist up, arms and torso fully visible, subject fills most of frame' },
  primer_plano:             { en: 'close-up',           body: 'face and shoulders only, facial expression and details are the focus' },
  primerisimo_primer_plano: { en: 'extreme close-up',   body: 'face fills entire frame, eyes and mouth dominant, no body visible' },
};

export const ANGULO_DESCRIPCION_H = {
  frontal:          'camera placed directly in front of the subject — subject faces the lens straight on',
  tres_cuartos_der: 'camera faces the subject straight on — subject has turned 45° to their OWN right, showing their right cheek and right shoulder as the dominant side (classic three-quarter portrait)',
  tres_cuartos_izq: 'camera faces the subject straight on — subject has turned 45° to their OWN left, showing their left cheek and left shoulder as the dominant side (classic three-quarter portrait)',
  lateral_der:      'camera placed at 90° to the subject\'s right — subject is in pure side profile, nose and body facing left in frame',
  lateral_izq:      'camera placed at 90° to the subject\'s left — subject is in pure side profile, nose and body facing right in frame',
};

export const ANGULO_DESCRIPCION_V = {
  normal:       'camera at eye level — neutral, natural perspective',
  picado:       'camera positioned HIGH above the subject, tilted DOWN — high angle shot, subject looks smaller and dominated',
  contrapicado: 'camera positioned LOW below the subject, tilted UP — low angle shot looking upward, subject looks powerful and imposing',
  cenital:      "camera directly overhead pointing straight down — top-down 90° bird's eye view",
  nadir:        "camera pointing straight up from floor level — extreme low worm's eye view",
  holandes:     'dutch tilt — camera tilted diagonally 15-30°, horizon is slanted, creates tension and unease',
};

// ============================================================
// GEMINI — Conversión URL → inline data
// ============================================================
export async function urlToInlineData(url) {
  if (!url) return null;
  try {
    if (url.startsWith('data:')) {
      const [header, data] = url.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
      return { mimeType, data };
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const mimeType = blob.type || 'image/jpeg';
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ mimeType, data: reader.result.split(',')[1] });
      reader.onerror  = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ============================================================
// GEMINI — Generación con referencias opcionales
// refImages: array de URLs (null se filtra automáticamente)
// aspectRatio: '16:9' | '9:16'
// ============================================================
export async function generateImageWithGemini(prompt, refImages = [], aspectRatio = '16:9') {
  const endpoint = '/api/llm';

  // ── Orden: imágenes primero, texto al final (Google docs) ─────
  const userParts = [];
  const inlineImages = await Promise.all(
    refImages.filter(Boolean).map(url => urlToInlineData(url))
  );
  for (const img of inlineImages.filter(Boolean)) {
    userParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  userParts.push({ text: prompt });

  const body = {
    action: 'gemini-proxy',
    contents: [{ role: 'user', parts: userParts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: { aspectRatio },
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini: ${err?.error?.message || res.status}`);
  }

  const data = await res.json();
  const resParts = data.candidates?.[0]?.content?.parts || [];
  const imgPart  = resParts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imgPart) throw new Error('Gemini no devolvió imagen');

  return `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
}

// ── Edición de ángulo con conversación multi-turno ────────────
// Simula que la frontal fue generada en el turno anterior del modelo.
// Esto hace que Gemini trate el nuevo prompt como edición real
// (no como generación con referencia de estilo).
//
// Estructura:
//   Turn 1 user:  "genera esta escena"
//   Turn 1 model: [imagen frontal]
//   Turn 2 user:  "cambia el ángulo a lateral derecho"  ← Gemini edita
export async function generateImageWithConversation(frontalPrompt, frontalImage, editPrompt, aspectRatio = '16:9') {
  const endpoint = '/api/llm';

  // Convertir la imagen frontal a inline data
  const frontalInline = await urlToInlineData(frontalImage);
  if (!frontalInline) throw new Error('No se pudo leer la imagen frontal');

  const body = {
    action: 'gemini-proxy',
    contents: [
      // Turno 1: usuario pidió la escena frontal
      {
        role: 'user',
        parts: [{ text: frontalPrompt }],
      },
      // Turno 1: modelo respondió con la imagen frontal
      {
        role: 'model',
        parts: [{ inlineData: { mimeType: frontalInline.mimeType, data: frontalInline.data } }],
      },
      // Turno 2: usuario pide cambiar el ángulo
      {
        role: 'user',
        parts: [{ text: editPrompt }],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageConfig: { aspectRatio },
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini: ${err?.error?.message || res.status}`);
  }

  const data = await res.json();
  const resParts = data.candidates?.[0]?.content?.parts || [];
  const imgPart  = resParts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (!imgPart) throw new Error('Gemini no devolvió imagen');

  return `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
}

// ============================================================
// COMPRESIÓN — canvas antes de subir
// Reduce ~4MB → ~300-500KB. maxPx=1280, quality=0.75
// ============================================================
export async function compressBase64Image(base64DataUrl, maxPx = 1280, quality = 0.72) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      // Forzar 1280x720 para 16:9 o 720x1280 para 9:16 — ahorra peso y tokens
      const isVertical = height > width;
      if (isVertical) {
        width  = 720;
        height = 1280;
      } else {
        width  = 1280;
        height = 720;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(base64DataUrl); // fallback sin comprimir
    img.src = base64DataUrl;
  });
}

// ============================================================
// UPLOAD — base64 a Supabase (comprime automáticamente)
// ============================================================
export async function uploadBase64ToSupabase(base64DataUrl, bucket, path) {
  const compressed  = await compressBase64Image(base64DataUrl);
  const [header, data] = compressed.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const byteChars = atob(data);
  const byteArr   = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArr], { type: mimeType });

  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    upsert: true, contentType: mimeType,
  });
  if (error) throw new Error(`Storage upload: ${error.message}`);

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return `${urlData.publicUrl}?t=${Date.now()}`;
}

// ============================================================
// UPLOAD — File directo a Supabase
// ============================================================
export async function uploadFileToSupabase(file, bucket, path) {
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw new Error(`Storage upload: ${error.message}`);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

// ============================================================
// PROMPTS — Sujeto (turnaround 3 vistas)
// ============================================================
export function buildSubjectViewPrompt(subject, viewId, viewKey) {
  const type      = SUBJECT_TYPES.find(t => t.id === subject.type);
  const typeLabel = type?.label?.toLowerCase() || 'sujeto';
  const base      = subject.description || `${typeLabel} genérico`;

  const angleMap = {
    frontal:              'EXACT straight-on front view, camera at eye level, facing directly at camera',
    tres_cuartos:         'EXACT three-quarter view, 45 degrees to the right',
    perfil:               'EXACT side profile view, 90 degrees, facing right',
    frente:               'EXACT front view facing directly at camera',
    lateral:              'EXACT side view at 90 degrees',
    tres_cuartos_trasero: 'EXACT three-quarter rear view, 135 degrees',
    lado:                 'EXACT side view at 90 degrees',
    arriba:               'EXACT top-down overhead view',
    angulo:               'EXACT angled architectural view',
    detalle:              'EXACT close-up detail shot',
  };
  const angle = angleMap[viewId] || 'front view';

  const consistencyNote =
    viewKey === 'front'
      ? 'This is the BASE REFERENCE VIEW. Generate with maximum detail and accuracy.'
      : viewKey === 'three_quarter'
      ? `CRITICAL: A reference image of the SAME subject from the front is provided.
MUST maintain IDENTICAL: face, skin tone, hair style/color, clothing, body type, height, age.
ONLY change the camera angle to: ${angle}. NOTHING else changes.`
      : `CRITICAL: Reference images of the SAME subject from front and three-quarter are provided.
MUST maintain IDENTICAL: face, skin tone, hair style/color, clothing, body type.
ONLY change the camera angle to: ${angle}. NOTHING else changes.`;

  return `CHARACTER REFERENCE SHEET — ${angle.toUpperCase()}.

SUBJECT: ${base}

${consistencyNote}

TECHNICAL:
- Clean neutral background (pure white or light grey studio)
- Full body visible, centered in frame
- Professional studio lighting, flat and even
- Photorealistic, high detail
- Single subject only — NO multiple angles in one image
- NO text, NO watermarks, NO props unless in description`;
}

// ============================================================
// THREE.JS — Render geométrico del ángulo de cámara
// ============================================================
// INVESTIGACIÓN PROFUNDA (Cartwheel / Chase Jarvis / Three.js docs):
//
// Gemini NO tiene NVS (Novel View Synthesis) real. No puede rotar una
// escena desde texto — opera estadísticamente. Las laterales fallan
// porque el modelo debe inventar geometría que no existe en la frontal.
//
// LA SOLUCIÓN (mismo principio que Cartwheel con sus maniquíes 3D):
//   1. Generar un render 3D SIMPLE desde el ángulo deseado con Three.js
//   2. Pasar esa imagen como referencia geométrica a Gemini
//   3. Prompt: "usa ESTE ángulo de cámara, transforma en escena fotorrealista"
//
// Gemini entiende la geometría de la imagen de referencia y la respeta.
// El wireframe no necesita ser bonito — solo comunicar el ángulo.
//
// CAPTURA CORRECTA (Three.js docs / github issues):
//   - El browser borra el drawing buffer de WebGL después del render.
//   - Solución: llamar renderer.render() y toDataURL() síncronamente.
//   - Luego renderer.dispose() para liberar el contexto WebGL.
//   - Canvas oculto en el DOM pero fuera del viewport.
// ============================================================

// ============================================================
// WIREFRAME DE PERSPECTIVA — Canvas 2D puro, sin dependencias
// ============================================================
// PROBLEMA ENCONTRADO: el proyecto NO tiene Three.js — el Planograma
// usa SVG puro. window.THREE es undefined.
//
// SOLUCIÓN: proyección de perspectiva 3D manual sobre canvas 2D.
// Técnica: perspectiva simple con división por Z (pinhole camera).
// Es la misma matemática de Three.js pero implementada directamente.
//
// El wireframe resultante le da a Gemini:
//   - El ángulo exacto de cámara (vanishing point)
//   - La altura del horizonte (eye level)
//   - La profundidad y proporciones del espacio
//   - Las líneas de perspectiva que definen el encuadre
// ============================================================

// ── Proyección de perspectiva simple ──────────────────────────
// Transforma punto 3D [x,y,z] a pixel 2D en canvas W×H
// eye: posición de la cámara | look: punto al que mira
function projectPoint(pt, eye, look, fov, W, H) {
  // Vector forward (dirección de mirada)
  const fx = look[0] - eye[0], fy = look[1] - eye[1], fz = look[2] - eye[2];
  const fLen = Math.sqrt(fx*fx + fy*fy + fz*fz);
  const fd = [fx/fLen, fy/fLen, fz/fLen];

  // Vector right (perpendicular al forward en plano horizontal)
  const worldUp = [0, 1, 0];
  const rx = fd[1]*worldUp[2] - fd[2]*worldUp[1];
  const ry = fd[2]*worldUp[0] - fd[0]*worldUp[2];
  const rz = fd[0]*worldUp[1] - fd[1]*worldUp[0];
  const rLen = Math.sqrt(rx*rx + ry*ry + rz*rz);
  const rd = [rx/rLen, ry/rLen, rz/rLen];

  // Vector up (perpendicular al forward y al right)
  const ux = ry*fd[2] - rz*fd[1];
  const uy = rz*fd[0] - rx*fd[2];
  const uz = rx*fd[1] - ry*fd[0];
  const uLen = Math.sqrt(ux*ux + uy*uy + uz*uz);
  const ud = [ux/uLen, uy/uLen, uz/uLen];

  // Traducir punto al espacio de cámara
  const dx = pt[0] - eye[0], dy = pt[1] - eye[1], dz = pt[2] - eye[2];
  const cx =  dx*rd[0] + dy*rd[1] + dz*rd[2];
  const cy = -(dx*ud[0] + dy*ud[1] + dz*ud[2]);  // Y invertido en canvas
  const cz =  dx*fd[0] + dy*fd[1] + dz*fd[2];

  if (cz <= 0.01) return null;  // detrás de la cámara

  const f = (W / 2) / Math.tan(fov / 2);
  const sx = (W / 2) + (cx / cz) * f;
  const sy = (H / 2) + (cy / cz) * f;
  return [sx, sy];
}

// ── Configuraciones de cámara por ángulo ──────────────────────
const SCENE_CAMERA_CONFIGS = {
  frontal:     { eye: [0,   1.7,  7],  look: [0,   1.2,  0] },
  lateral_der: { eye: [7,   1.7,  0],  look: [0,   1.2,  0] },
  lateral_izq: { eye: [-7,  1.7,  0],  look: [0,   1.2,  0] },
  trasero:     { eye: [0,   1.7, -7],  look: [0,   1.2,  0] },
};

// ── Renderizar wireframe de perspectiva en canvas ─────────────
export function renderSceneAngleWithThreeJS(angleKey) {
  const W = 512, H = 288;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const cfg = SCENE_CAMERA_CONFIGS[angleKey] || SCENE_CAMERA_CONFIGS.frontal;
  const { eye, look } = cfg;
  const fov = 55 * Math.PI / 180;  // 55° horizontal FOV

  // Función helper: proyectar y dibujar línea entre dos puntos 3D
  function line3D(p1, p2, color = '#4444aa', width = 1, dash = []) {
    const s1 = projectPoint(p1, eye, look, fov, W, H);
    const s2 = projectPoint(p2, eye, look, fov, W, H);
    if (!s1 || !s2) return;
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.moveTo(s1[0], s1[1]);
    ctx.lineTo(s2[0], s2[1]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function fillQuad3D(pts, color) {
    const sp = pts.map(p => projectPoint(p, eye, look, fov, W, H));
    if (sp.some(p => !p)) return;
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.moveTo(sp[0][0], sp[0][1]);
    for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  // ── Fondo ────────────────────────────────────────────────
  ctx.fillStyle = '#0d0d1a';
  ctx.fillRect(0, 0, W, H);

  // ── Espacio: caja de -5 a +5 en X, 0 a 4 en Y, -5 a +5 en Z ─
  const X1 = -5, X2 = 5, Y0 = 0, Y1 = 4, Z1 = -5, Z2 = 5;

  // Suelo (relleno tenue)
  fillQuad3D([[X1,Y0,Z1],[X2,Y0,Z1],[X2,Y0,Z2],[X1,Y0,Z2]], '#1a1a2e');

  // Grid en el suelo — líneas de perspectiva clave
  for (let x = X1; x <= X2; x++) {
    line3D([x, Y0, Z1], [x, Y0, Z2], x === 0 ? '#333388' : '#22223a', x === 0 ? 1.5 : 0.7);
  }
  for (let z = Z1; z <= Z2; z++) {
    line3D([X1, Y0, z], [X2, Y0, z], z === 0 ? '#333388' : '#22223a', z === 0 ? 1.5 : 0.7);
  }

  // Paredes (relleno tenue)
  fillQuad3D([[X1,Y0,Z1],[X2,Y0,Z1],[X2,Y1,Z1],[X1,Y1,Z1]], '#161628');  // pared fondo
  fillQuad3D([[X1,Y0,Z1],[X1,Y0,Z2],[X1,Y1,Z2],[X1,Y1,Z1]], '#141426');  // pared izq
  fillQuad3D([[X2,Y0,Z1],[X2,Y0,Z2],[X2,Y1,Z2],[X2,Y1,Z1]], '#141426');  // pared der
  fillQuad3D([[X1,Y1,Z1],[X2,Y1,Z1],[X2,Y1,Z2],[X1,Y1,Z2]], '#131325');  // techo

  // Aristas de la caja (wireframe estructural)
  const WC = '#5555bb';
  // Aristas del suelo
  line3D([X1,Y0,Z1],[X2,Y0,Z1], WC, 1.2);
  line3D([X2,Y0,Z1],[X2,Y0,Z2], WC, 1.2);
  line3D([X2,Y0,Z2],[X1,Y0,Z2], WC, 1.2);
  line3D([X1,Y0,Z2],[X1,Y0,Z1], WC, 1.2);
  // Aristas del techo
  line3D([X1,Y1,Z1],[X2,Y1,Z1], WC, 1.2);
  line3D([X2,Y1,Z1],[X2,Y1,Z2], WC, 1.2);
  line3D([X2,Y1,Z2],[X1,Y1,Z2], WC, 1.2);
  line3D([X1,Y1,Z2],[X1,Y1,Z1], WC, 1.2);
  // Aristas verticales (pilares)
  line3D([X1,Y0,Z1],[X1,Y1,Z1], WC, 1.2);
  line3D([X2,Y0,Z1],[X2,Y1,Z1], WC, 1.2);
  line3D([X2,Y0,Z2],[X2,Y1,Z2], WC, 1.2);
  line3D([X1,Y0,Z2],[X1,Y1,Z2], WC, 1.2);

  // Líneas de perspectiva en paredes — ayudan a ver la profundidad
  const AC = '#3333aa';
  for (let y = 1; y <= 3; y++) {
    line3D([X1,y,Z1],[X2,y,Z1], AC, 0.5, [3,3]);  // pared fondo horizontal
    line3D([X1,y,Z1],[X1,y,Z2], AC, 0.5, [3,3]);  // pared izq horizontal
    line3D([X2,y,Z1],[X2,y,Z2], AC, 0.5, [3,3]);  // pared der horizontal
  }

  // Marcador central — punto de referencia de escala
  const MC = '#00a8e8';
  line3D([0,Y0,0], [0,3.5,0], MC, 2);           // línea vertical central
  line3D([-0.3,1.7,0], [0.3,1.7,0], MC, 1.5);  // línea horizontal (ojo humano)
  line3D([0,1.7,-0.3], [0,1.7,0.3], MC, 1.5);  // línea en Z

  // Horizonte (línea de nivel de ojo) — punteada
  const H_Y = 1.7;
  line3D([X1, H_Y, Z1], [X2, H_Y, Z1], '#00a8e844', 0.8, [5,4]);
  line3D([X1, H_Y, Z2], [X2, H_Y, Z2], '#00a8e844', 0.8, [5,4]);
  line3D([X1, H_Y, Z1], [X1, H_Y, Z2], '#00a8e844', 0.8, [5,4]);
  line3D([X2, H_Y, Z1], [X2, H_Y, Z2], '#00a8e844', 0.8, [5,4]);

  // ── Label del ángulo ───────────────────────────────────────
  const labels = { frontal:'FRONTAL 0°', lateral_der:'LATERAL DER 90°', lateral_izq:'LATERAL IZQ 270°', trasero:'TRASERO 180°' };
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#00a8e8cc';
  ctx.textAlign = 'left';
  ctx.fillText(labels[angleKey] || angleKey, 8, H - 8);

  return canvas.toDataURL('image/jpeg', 0.90);
}

// ============================================================
// PROMPTS — Escena (Character Sheet / Concept Art Sheet)
// ============================================================
// MÉTODO CORRECTO (descubierto probando en Gemini app directamente):
//
// Gemini genera las 4 vistas coherentes cuando se le pide un
// "multi-view reference sheet" con descripción semántica detallada
// de cada cuadrante — igual al prompt raw que usa internamente
// para generar planos arquitectónicos desde una imagen de referencia.
//
// ESTRUCTURA:
//   - Con imagen frontal: "Based on [image], generate a 2x2 grid..."
//     Describe cada cuadrante con los objetos que DEBEN aparecer,
//     incluyendo lo que está oculto en la vista original.
//   - Sin imagen frontal: genera el sheet desde texto puro.
//
// CROP: el sheet 1:1 se divide en 4 cuadrantes iguales en canvas.
// ============================================================

// ── Prompt del sheet completo (con o sin imagen de referencia) ──
// Usa terminología de ELEVACIONES ARQUITECTÓNICAS (N/S/E/W) que Gemini
// entiende con precisión técnica — "SOUTH ELEVATION" es inequívocamente
// opuesto 180° a "NORTH ELEVATION" en su entrenamiento con documentación
// técnica de arquitectura, sin ambigüedad de rotación.
export function buildSceneSheetPrompt(scene, hasFrontalImage = false) {
  const base = scene.description || 'a cinematic environment';

  const intro = hasFrontalImage
    ? `Based on the provided reference image, generate a photorealistic architectural reference sheet of the SAME cinematic location showing all four elevations.`
    : `Generate a photorealistic architectural reference sheet of a cinematic location showing all four elevations.`;

  return `${intro}

The output is a single image divided into four equal quadrants (2x2 grid). Empty environment — NO people, NO characters in any view.

LOCATION: ${base}

TOP-LEFT — labeled "NORTH ELEVATION (FRONT)":
${hasFrontalImage
  ? `Faithful reproduction of the perspective in the reference image. Preserve all architectural elements, materials, colors, textures, lighting, and atmosphere exactly as seen. This is the primary facade.`
  : `The primary facade. Camera faces the location head-on. Full depth from foreground to background. Main architectural elements visible.`}

TOP-RIGHT — labeled "SOUTH ELEVATION (REAR)":
The OPPOSITE facade from the NORTH ELEVATION. In architectural drawing convention, the South Elevation shows the building or space as seen from the exact opposite side — 180° from the North. All horizontal elements are mirrored left-to-right: what was on the LEFT in the North Elevation is now on the RIGHT, and vice versa. Show the rear wall, back facade, or entrance of this location. Invent coherent architecture for this unseen side — back doors, rear windows, service entrances, or whatever structural elements logically exist on the south/rear face of this type of location. Maintain identical materials, lighting quality, time of day, and atmosphere as the North Elevation.

BOTTOM-LEFT — labeled "WEST ELEVATION (LEFT SIDE)":
The left-side elevation. Camera is positioned 90° to the left of the North Elevation camera, looking east (right). Side profile of the location. Depth of the space runs left-to-right across the frame. Floor and ceiling/roofline converge toward the right vanishing point.

BOTTOM-RIGHT — labeled "EAST ELEVATION (RIGHT SIDE)":
The right-side elevation. Camera is positioned 90° to the right of the North Elevation camera, looking west (left). Side profile of the location. Depth of the space runs right-to-left across the frame. Floor and ceiling/roofline converge toward the left vanishing point.

CRITICAL RULES:
- All 4 elevations show the EXACT SAME location — identical materials, textures, colors, lighting quality, and time of day
- Each quadrant is a proper wide cinematic establishing shot
- Photorealistic, professional architectural visualization quality
- Label each panel precisely: "NORTH ELEVATION (FRONT)", "SOUTH ELEVATION (REAR)", "WEST ELEVATION (LEFT SIDE)", "EAST ELEVATION (RIGHT SIDE)"
- Include a small compass rose or floor plan keyplan showing the 4 camera positions
- The 4 elevations must be spatially coherent — matching elements align across panels`;
}

// ── Prompt dedicado para la vista TRASERA (Opción A — llamada independiente) ──
// Genera la trasera en una llamada separada pasando la frontal como referencia.
// Más fiable que el sheet para el eje 180° porque Gemini puede razonar sobre
// la imagen concreta en lugar de inferir de un grid abstracto.
export function buildSceneBackPrompt(scene) {
  const base = scene.description || 'a cinematic environment';
  return `Photorealistic cinematic background plate. Empty environment — NO people, NO characters.

LOCATION: ${base}

You are looking at the SOUTH ELEVATION (REAR FACADE) of this location.
${scene.description ? `The attached reference image shows the NORTH ELEVATION (FRONT FACADE) of the same location.` : ''}

ARCHITECTURAL CONVENTION — SOUTH ELEVATION:
- This is the view from exactly 180° opposite the reference image
- All horizontal elements are MIRRORED left-to-right compared to the reference
- Elements on the RIGHT in the reference appear on the LEFT here, and vice versa
- Show the rear wall, back facade, or entrance side of this location
- Invent coherent architecture for this unseen face: back doors, rear windows,
  service areas, or structural elements typical of the rear of this location type
- Preserve identical: materials, surface textures, lighting quality, time of day,
  color palette, and overall atmosphere from the reference image

Wide establishing shot, eye level, professional cinematography quality.
16:9 aspect ratio. No text, no watermarks, no labels.`;
}

// ── Prompt individual para regen de una vista sola (frontal y laterales) ──
export function buildScenePrompt(scene, angleView = 'frontal') {
  const base = scene.description || 'a cinematic environment';
  const angleLabel = {
    frontal:     'NORTH ELEVATION — primary front facade, camera faces head-on, full depth front to back',
    lateral_der: 'EAST ELEVATION — right side profile, camera 90° to the right looking left, depth runs right-to-left',
    lateral_izq: 'WEST ELEVATION — left side profile, camera 90° to the left looking right, depth runs left-to-right',
    trasero:     'SOUTH ELEVATION — rear facade, 180° opposite from front, all elements mirrored left-to-right',
  }[angleView] || 'NORTH ELEVATION';

  return `Photorealistic cinematic background plate. Empty environment, no people.

Location: ${base}
View: ${angleLabel}

Wide establishing shot, natural lighting, professional cinematography quality.
16:9 aspect ratio. No text, no watermarks.`;
}

// ── Generar el sheet 2x2 y cropear los 4 cuadrantes ───────────
export async function generateSceneSheet(scene, frontalImageUrl = null) {
  const prompt  = buildSceneSheetPrompt(scene, !!frontalImageUrl);
  const refs    = frontalImageUrl ? [frontalImageUrl] : [];
  // Aspect ratio 1:1 para que cada cuadrante sea cuadrado.
  // Gemini genera ~1024x1024; cada cuadrante queda ~512x512.
  const sheetB64 = await generateImageWithGemini(prompt, refs, '1:1');
  return cropSheet(sheetB64);
}

// ── Cropear sheet 2x2 en 4 imágenes ──────────────────────────
// Mapeo alineado con el prompt de elevaciones arquitectónicas:
//   TOP-LEFT     = NORTH (frontal)   TOP-RIGHT    = SOUTH (trasero)
//   BOTTOM-LEFT  = WEST  (lat. izq)  BOTTOM-RIGHT = EAST  (lat. der)
function cropSheet(base64DataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const W = img.width, H = img.height;
      const hw = Math.floor(W / 2), hh = Math.floor(H / 2);
      const quads = {
        frontal:     [0,   0,   hw, hh],  // TOP-LEFT  = NORTH ELEVATION
        trasero:     [hw,  0,   hw, hh],  // TOP-RIGHT = SOUTH ELEVATION
        lateral_izq: [0,   hh,  hw, hh],  // BOT-LEFT  = WEST ELEVATION
        lateral_der: [hw,  hh,  hw, hh],  // BOT-RIGHT = EAST ELEVATION
      };
      const results = {};
      for (const [key, [x, y, w, h]] of Object.entries(quads)) {
        // Redimensionar cada cuadrante a 1280x720 para ahorrar peso y tokens
        const c = document.createElement('canvas');
        c.width = 1280; c.height = 720;
        c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, 1280, 720);
        results[key] = c.toDataURL('image/jpeg', 0.72);
      }
      resolve(results);
    };
    img.onerror = () => reject(new Error('Error cargando sheet'));
    img.src = base64DataUrl;
  });
}

// ── Pipeline individual (regen de una vista) ──────────────────
// Frontal  → generación directa desde texto
// Trasera  → 3 pasos: analizar assets frontal → invertir → generar con ref
// Laterales → sheet completo + cropear el cuadrante
export async function generateSceneViewWithRef(scene, angleKey, frontalUrl = null) {
  if (angleKey === 'frontal') {
    return await generateImageWithGemini(buildScenePrompt(scene, 'frontal'), [], '16:9');
  }
  if (angleKey === 'trasero') {
    // Paso 1: analizar assets de la frontal (si hay imagen)
    const assets = frontalUrl ? await analyzeSceneFrontal(frontalUrl) : [];
    // Paso 2: construir prompt con assets invertidos
    const prompt = buildSceneBackPromptFromAnalysis(scene, assets);
    // Paso 3: generar con frontal como referencia visual
    const refs = frontalUrl ? [frontalUrl] : [];
    return await generateImageWithGemini(prompt, refs, '16:9');
  }
  // Laterales: sheet completo → cropear el cuadrante
  const crops = await generateSceneSheet(scene, frontalUrl);
  return crops[angleKey] || await generateImageWithGemini(buildScenePrompt(scene, angleKey), [], '16:9');
}

// ── Paso 1: Analizar assets de la imagen frontal ──────────────
// Llama a Gemini TEXT con la frontal como inline data.
// Devuelve array de assets con posición espacial.
export async function analyzeSceneFrontal(frontalImageUrl) {
  const endpoint = '/api/llm';

  const inline = await urlToInlineData(frontalImageUrl);
  if (!inline) return [];

  const prompt = `Analyze this architectural/interior location image for use in a cinematic background plate system.

List every significant element visible: architectural features, furniture, decor, materials, lighting fixtures, structural elements.

For each element return a JSON object with:
- "name": descriptive name (e.g. "dark walnut kitchen island", "arched window")
- "material": material and color (e.g. "dark walnut wood, matte finish")
- "position_lr": horizontal position — "left", "center", or "right"
- "position_depth": depth position — "foreground", "midground", or "background"
- "notes": any detail useful for reconstruction (e.g. "has 2 white stools on the near side", "floor-to-ceiling height")

Return ONLY a valid JSON array. No explanation, no markdown fences, no extra text.
Example: [{"name":"kitchen island","material":"dark concrete top","position_lr":"center","position_depth":"midground","notes":"2 stools on left side"}]`;

  const body = {
    action: 'gemini-proxy',
    model: 'gemini-2.5-flash',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: inline.mimeType, data: inline.data } },
        { text: prompt },
      ],
    }],
    generationConfig: { temperature: 0.1 },
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Limpiar posibles fences de markdown
    const clean = text.replace(/```json|```/gi, '').trim();
    const start = clean.indexOf('[');
    const end   = clean.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    return JSON.parse(clean.slice(start, end + 1));
  } catch (e) {
    console.warn('[analyzeSceneFrontal] Error:', e.message);
    return [];
  }
}

// ── Paso 2: Construir prompt de trasera con assets invertidos ──
// Invierte position_lr (left↔right, center→center) y construye
// un prompt semántico que describe exactamente qué ve la cámara.
export function buildSceneBackPromptFromAnalysis(scene, assets = []) {
  const base = scene.description || 'a cinematic environment';

  const mirrorLR = pos => {
    if (pos === 'left')  return 'right';
    if (pos === 'right') return 'left';
    return 'center';
  };

  // Construir lista de assets con posiciones invertidas
  const assetLines = assets.length > 0
    ? assets.map(a => {
        const lr    = mirrorLR(a.position_lr);
        const depth = a.position_depth || 'midground';
        const notes = a.notes ? ` — ${a.notes}` : '';
        return `- ${a.name} (${a.material}): ${lr}, ${depth}${notes}`;
      }).join('\n')
    : '(no asset analysis available — infer from description and reference image)';

  const hasRef = assets.length > 0;

  return `Photorealistic cinematic background plate. Empty environment — NO people, NO characters.

LOCATION: ${base}

CAMERA POSITION: SOUTH ELEVATION — REAR FACADE
${hasRef ? 'The attached reference image shows the NORTH ELEVATION (front view) of this SAME location.' : ''}

This is the view from exactly 180° opposite the reference image.
The camera is now standing where it was originally pointing — looking back the other way.

ARCHITECTURAL CONVENTION — SOUTH ELEVATION:
All horizontal positions are MIRRORED left-to-right from the reference.
Show the rear wall, back facade, or entrance side of this location.
Invent coherent architecture for this unseen face while maintaining identical
materials, lighting quality, time of day, and atmosphere as the reference.

ASSET INVENTORY — mirrored positions from NORTH ELEVATION:
${assetLines}

Reconstruct the scene with these elements in their mirrored positions.
Add coherent rear-side elements: back doors, rear windows, service areas,
or structural elements typical of the rear/entrance of this location type.

Wide establishing shot, eye level, professional cinematography quality.
16:9 aspect ratio. No text, no watermarks, no labels.`;
}

// ============================================================
// PROMPTS — Selección automática de vista de escena por ángulo
// ============================================================
export function pickSceneViewForAngle(scene, angleH) {
  if (!scene) return null;
  // Laterales: usar lateral si existe, si no frontal como fallback
  if (angleH === 'lateral_der') return scene.image_url_lateral_der || scene.image_url;
  if (angleH === 'lateral_izq') return scene.image_url_lateral_izq || scene.image_url;
  // frontal · tres_cuartos_der · tres_cuartos_izq → imagen frontal (NORTH ELEVATION)
  // No hay ángulo H automático para la trasera — el usuario la selecciona manualmente
  // via escena.image_url_back cuando configura el shot
  return scene.image_url;
}

// Devuelve AMBAS vistas disponibles de la escena para el ángulo dado
// Útil para pasar como referencias múltiples al generador
export function getSceneRefsForAngle(scene, angleH) {
  if (!scene) return [];
  const frontal = scene.image_url       || null;
  const trasera = scene.image_url_back  || null;
  if (angleH === 'lateral_der') {
    const lat = scene.image_url_lateral_der || frontal;
    return [lat].filter(Boolean);
  }
  if (angleH === 'lateral_izq') {
    const lat = scene.image_url_lateral_izq || frontal;
    return [lat].filter(Boolean);
  }
  // frontal / tres_cuartos: pasar frontal. Si hay trasera disponible también la incluimos
  // como contexto espacial (el DAG la ignorará si no la necesita)
  return [frontal, trasera].filter(Boolean);
}

// ============================================================
// HELPERS — Descripciones de lente y desenfoque para prompts
// ============================================================
export function getLensDesc(lens) {
  const map = {
    '24mm':  'wide angle 24mm lens — slight distortion, expansive field of view',
    '35mm':  'reportage 35mm lens — natural wide perspective',
    '50mm':  'standard 50mm lens — natural human vision perspective',
    '85mm':  'portrait 85mm lens — slight compression, natural bokeh',
    '135mm': 'telephoto 135mm lens — strong compression, blurred background',
  };
  return map[lens] || '50mm standard lens';
}

export function getBlurDesc(blur) {
  const map = {
    'nitido':       'deep focus — everything sharp and in focus (f/8)',
    'bokeh_suave':  'shallow depth of field — background slightly blurred, subject sharp (f/2.8)',
    'bokeh_fuerte': 'very shallow depth of field — background heavily blurred, subject in sharp focus (f/1.4)',
    'rack_focus':   'rack focus effect — subject in sharp focus, foreground and background blurred',
  };
  return map[blur] || 'everything in focus';
}

// ============================================================
// PROMPTS — Frame INICIO (sujeto + escena + eje H + eje V)
// ============================================================
export function buildStartFramePrompt(subject, scene, shotSize, angleH, angleV, action, lens, blur) {
  const plano    = PLANO_DESCRIPCION[shotSize] || { en: shotSize, body: 'subject visible in frame' };
  const anguloH  = ANGULO_DESCRIPCION_H[angleH] || angleH;
  const anguloV  = ANGULO_DESCRIPCION_V[angleV] || 'camera at eye level';
  const lensDesc = getLensDesc(lens);
  const blurDesc = getBlurDesc(blur);

  const subjectDesc = subject?.description || subject?.name || 'person';
  const sceneDesc   = scene?.description   || scene?.name   || 'neutral environment';
  const actionDesc  = action?.trim() ? `The subject is ${action}.` : 'The subject is standing naturally, at rest.';

  const narrative = `A cinematic ${plano.en}, shot with a ${lensDesc}, ${blurDesc}. ${actionDesc} The camera horizontal position is ${anguloH}. The camera vertical position is ${anguloV}. The subject's ${plano.body}. The setting is: ${sceneDesc}.`;

  return `REFERENCE IMAGES PROVIDED — USE THEM EXACTLY:
- Subject appearance reference images: maintain identical face, skin, hair, clothing, body type.
- Background/environment reference image: maintain identical location, lighting, atmosphere.

GENERATE THIS EXACT CINEMATIC FRAME:
${narrative}

SUBJECT (from reference): ${subjectDesc}
WHAT THE SUBJECT IS DOING: ${action?.trim() || 'standing naturally'}
SHOT TYPE: ${plano.en} — ${plano.body}
CAMERA HORIZONTAL ANGLE: ${anguloH}
CAMERA VERTICAL ANGLE: ${anguloV}
LENS: ${lensDesc}
DEPTH OF FIELD: ${blurDesc}
ENVIRONMENT: ${sceneDesc}

MANDATORY RULES:
- The subject MUST be visibly performing the action: "${action?.trim() || 'standing'}"
- The framing MUST show exactly: ${plano.body}
- The horizontal camera angle MUST be: ${anguloH}
- The vertical camera angle MUST be: ${anguloV}
- Apply this depth of field: ${blurDesc}
- DO NOT change subject appearance from the reference images
- DO NOT change the background/environment from the reference image
- DO NOT add text, watermarks, or extra people not in references
- Photorealistic, cinematic quality, film grain, professional color grading`;
}

// ============================================================
// PROMPTS — Frame FINAL (inicio como ancla + eje H + eje V)
// ============================================================
export function buildEndFramePrompt(
  subject,
  scene,
  action,
  shotSize,
  angleH,
  angleV,
  lens,
  blur,
  options = {}
) {
  const { preserveBackgroundExactly = true } = options;

  const plano    = PLANO_DESCRIPCION[shotSize] || { en: shotSize, body: 'subject visible in frame' };
  const anguloH  = ANGULO_DESCRIPCION_H[angleH] || angleH;
  const anguloV  = ANGULO_DESCRIPCION_V[angleV] || 'camera at eye level';
  const lensDesc = getLensDesc(lens);
  const blurDesc = getBlurDesc(blur);

  const subjectDesc = subject?.description || subject?.name || 'person';
  const sceneDesc   = scene?.description   || scene?.name   || '';
  const actionDesc  = action?.trim() || 'subject in motion';

  const referenceBlock = preserveBackgroundExactly
    ? `- IMAGE 1 (START FRAME — CRITICAL): This is the EXACT previous frame.
  The background, lighting, location, time of day, atmosphere, and all environmental elements
  MUST be PIXEL-PERFECT IDENTICAL to this image.
- OTHER REFERENCE IMAGES: subject identity references.`
    : `- IMAGE 1 (START FRAME): continuity reference for action timing, light, atmosphere and subject continuity.
  Keep the SAME location and cinematic continuity, but DO NOT clone the exact composition if the target camera changed.
- OTHER REFERENCE IMAGES: subject identity references + scene references for the TARGET camera angle.`;

  const backgroundRule = preserveBackgroundExactly
    ? `- BACKGROUND = COPY IMAGE 1 EXACTLY — same scene, same light, same colors, same props, nothing changes`
    : `- BACKGROUND = SAME LOCATION, SAME LIGHT, SAME ATMOSPHERE, SAME PROPS CONTINUITY,
      but recomposed to match the requested camera angle (${anguloH}), vertical angle (${anguloV}),
      shot type (${plano.en}) and lens (${lensDesc})`;

  return `REFERENCE IMAGES PROVIDED — USE THEM EXACTLY:
${referenceBlock}

GENERATE THIS EXACT CINEMATIC FRAME — THE END OF THE ACTION.

SUBJECT (from reference): ${subjectDesc}
ACTION AT END MOMENT: ${actionDesc}
SHOT TYPE: ${plano.en} — ${plano.body}
CAMERA HORIZONTAL ANGLE: ${anguloH}
CAMERA VERTICAL ANGLE: ${anguloV}
LENS: ${lensDesc}
DEPTH OF FIELD: ${blurDesc}
${sceneDesc ? `LOCATION: ${sceneDesc}` : ''}

MANDATORY RULES:
- The subject MUST be visibly at the END MOMENT of: "${actionDesc}"
- The framing MUST show exactly: ${plano.body}
- The horizontal camera angle MUST be: ${anguloH}
- The vertical camera angle MUST be: ${anguloV}
- Apply this depth of field: ${blurDesc}
${backgroundRule}
- Subject appearance = IDENTICAL TO REFERENCE VIEWS — same face, outfit, zero changes
- DO NOT add text, watermarks, or UI elements
- Photorealistic, cinematic quality, film grain, professional color grading`;
}