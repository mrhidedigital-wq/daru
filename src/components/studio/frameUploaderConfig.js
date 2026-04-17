// frameUploaderConfig.js — constantes y utilidades puras para FrameUploader
import { LLMProviderFactory } from '../../lib/ai/LLMProviderFactory';

export const ACCEPTED = 'image/jpeg,image/png,image/webp';

// Info de proveedores de VIDEO — formulas de prompt actualizadas marzo 2026
export const VIDEO_PROVIDERS = {
  veo: {
    label:    'Veo 3.1',
    color:    '#00A8E8',
    icon:     '◈',
    hint:     'Subject front-loaded → Action → Setting → Camera/Lens → Lighting → Audio. Material cues (cotton, silk). 100-150 palabras.',
    formula:  '[Subject Details] + [Action] + [Setting/Environment] + [Shot Composition + Camera Movement] + [Lighting] + [Aesthetics/Mood] + [Audio]',
    maxTokens: 200,
    forbidden: ['SACRED', 'DO NOT', 'MUST NOT', 'FORBIDDEN', 'NEVER'],
    audioSupport: true,
  },
  kling: {
    label:    'Kling 3.0',
    color:    '#00D084',
    icon:     '◆',
    hint:     'Scene → Characters → Action secuencial → Camera → Audio & Style. Motion intensity. Piensa como director.',
    formula:  '[Scene/Environment] + [Characters] + [Sequential Action] + [Camera Work] + [Audio & Style]',
    maxTokens: 180,
    forbidden: [],
    audioSupport: true,
  },
  seeddance: {
    label:    'SeedDance (AIMLAPI)',
    color:    '#9B6DD6',
    icon:     '◉',
    hint:     'Consistencia de personaje primero. @reference format. Repite identidad del sujeto en inicio y fin.',
    formula:  '[Character Identity] + [Action/Pose] + [Environment] + [Camera] + [Style]',
    maxTokens: 200,
    forbidden: [],
    audioSupport: false,
  },
  seeddance_byteplus: {
    label:    'SeedDance 2.0 (BytePlus)',
    color:    '#9B6DD6',
    icon:     '◉',
    hint:     'Consistencia de personaje primero. Sin watermark nativo. Mismo formato de prompt que SeedDance.',
    formula:  '[Character Identity] + [Action/Pose] + [Environment] + [Camera] + [Style]',
    maxTokens: 200,
    forbidden: [],
    audioSupport: false,
  },
  seeddance_byteplus_15: {
    label:    'SeedDance 1.5 Pro (BytePlus)',
    color:    '#9B6DD6',
    icon:     '◉',
    hint:     'Consistencia de personaje primero. Créditos gratuitos BytePlus. Mismo formato de prompt que SeedDance.',
    formula:  '[Character Identity] + [Action/Pose] + [Environment] + [Camera] + [Style]',
    maxTokens: 200,
    forbidden: [],
    audioSupport: false,
  },
  seeddance_piapi: {
    label:    'SeedDance 2.0 (PiAPI)',
    color:    '#9B6DD6',
    icon:     '◉',
    hint:     'Consistencia de personaje primero. @image1/@video1 references. Remove-watermark disponible.',
    formula:  '[Character Identity] + [Action/Pose] + [Environment] + [Camera] + [Style]',
    maxTokens: 200,
    forbidden: [],
    audioSupport: false,
  },
};

// LLMs disponibles (via LLMProviderFactory) — independientes del motor de video
export const LLM_OPTIONS = {
  gemini: { label: 'Gemini 2.5', color: '#4285F4' },
  claude: { label: 'Claude Sonnet', color: '#D4A87A' },
  gpt4:   { label: 'GPT-4o',        color: '#74AA9C' },
};

// ─── Campos cinematográficos (modo cinematic) ─────────────────
export const CAMPOS_CINEMATIC = [
  { key: 'personaje',   label: 'Personaje',           icon: '👤', placeholder: 'Quién aparece, cómo se ve, qué lleva puesto (material: cotton, silk, leather)' },
  { key: 'accion',      label: 'Acción',              icon: '⚡', placeholder: 'Qué hace secuencialmente: primero X, luego Y, finalmente Z' },
  { key: 'ambiente',    label: 'Escena / Fondo',      icon: '🏠', placeholder: 'Dónde ocurre, qué hay de fondo, hora del día' },
  { key: 'encuadre',    label: 'Plano + Cámara',      icon: '🎬', placeholder: 'Tipo de plano + ángulo + movimiento. Ej: medium close-up, slight low angle, slow dolly-in, ARRI Alexa 35 Cooke S4/i 40mm T2.8' },
  { key: 'iluminacion', label: 'Iluminación',          icon: '💡', placeholder: 'Fuente de luz concreta (neon sign, golden hour, fluorescent), dirección' },
  { key: 'audio',       label: 'Audio / Diálogo',     icon: '🔊', placeholder: 'Sonido ambiente, efectos, diálogo (solo Veo 3.1 y Kling 3.0)' },
];

export const CINEMATIC_PRESETS = {
  intExt: [
    { id: 'int', label: 'INT.', value: 'INT.' },
    { id: 'ext', label: 'EXT.', value: 'EXT.' },
  ],
  plano: [
    { id: 'ecu',       label: 'ECU',        value: 'Extreme close-up' },
    { id: 'cu',        label: 'CU',         value: 'Close-up' },
    { id: 'medio',     label: 'Medium',     value: 'Medium shot' },
    { id: 'americano', label: 'Americano',  value: 'Cowboy shot' },
    { id: 'entero',    label: 'Full',       value: 'Full shot' },
    { id: 'gran_ang',  label: 'Wide',       value: 'Wide shot' },
    { id: 'ots',       label: 'OTS',        value: 'Over-the-shoulder shot' },
    { id: 'pov',       label: 'POV',        value: 'Point-of-view shot' },
    { id: 'aereo',     label: 'Aéreo',      value: 'Aerial / drone shot' },
    { id: 'two_shot',  label: 'Two Shot',   value: 'Two shot' },
  ],
  camara: [
    { id: 'arri35',      label: 'ARRI ALEXA 35',  value: 'ARRI ALEXA 35' },
    { id: 'arri_mini',   label: 'ARRI Mini LF',   value: 'ARRI ALEXA Mini LF' },
    { id: 'red_raptor',  label: 'RED V-RAPTOR',   value: 'RED V-RAPTOR' },
    { id: 'red_komodo',  label: 'RED KOMODO',     value: 'RED KOMODO' },
    { id: 'sony_venice', label: 'SONY VENICE 2',  value: 'Sony VENICE 2' },
    { id: 'bmd_ursa',    label: 'BMD URSA 12K',   value: 'Blackmagic URSA 12K' },
    { id: 'canon_c700',  label: 'Canon C700',     value: 'Canon C700' },
    { id: 'sony_fx9',    label: 'Sony FX9',       value: 'Sony FX9' },
  ],
  lenteSerie: [
    { id: 'cooke',  label: 'Cooke S7i',      value: 'Cooke S7i' },
    { id: 'zeiss',  label: 'Zeiss Master',   value: 'Zeiss Master Prime' },
    { id: 'leica',  label: 'Leica Summilux', value: 'Leica Summilux-C' },
    { id: 'sigma',  label: 'Sigma Cine',     value: 'Sigma Cine' },
    { id: 'tokina', label: 'Tokina Vista',   value: 'Tokina Vista' },
    { id: 'canon',  label: 'Canon Sumire',   value: 'Canon Sumire' },
  ],
  focal: [
    { id: 'f14',  label: '14mm',  value: '14mm' },
    { id: 'f21',  label: '21mm',  value: '21mm' },
    { id: 'f24',  label: '24mm',  value: '24mm' },
    { id: 'f28',  label: '28mm',  value: '28mm' },
    { id: 'f35',  label: '35mm',  value: '35mm' },
    { id: 'f40',  label: '40mm',  value: '40mm' },
    { id: 'f50',  label: '50mm',  value: '50mm' },
    { id: 'f65',  label: '65mm',  value: '65mm' },
    { id: 'f85',  label: '85mm',  value: '85mm' },
    { id: 'f100', label: '100mm', value: '100mm' },
    { id: 'f135', label: '135mm', value: '135mm' },
  ],
  esquemaLuz: [
    { id: 'high_key',    label: 'High Key',         value: 'high key lighting' },
    { id: 'low_key',     label: 'Low Key',          value: 'low key lighting' },
    { id: 'rembrandt',   label: 'Rembrandt',        value: 'Rembrandt lighting' },
    { id: 'contraluz',   label: 'Contraluz',        value: 'backlight / rim light' },
    { id: 'golden_hour', label: 'Golden Hour',      value: 'golden hour sunlight' },
    { id: 'magic_hour',  label: 'Magic Hour',       value: 'magic hour blue twilight' },
    { id: 'noche',       label: 'Noche/Practicals', value: 'night scene with practical lights' },
    { id: 'neon',        label: 'Neon Urbano',      value: 'urban neon lights' },
    { id: 'overcast',    label: 'Overcast',         value: 'overcast diffused daylight' },
    { id: 'hard',        label: 'Hard Light',       value: 'hard directional light' },
    { id: 'soft',        label: 'Soft Diffused',    value: 'soft diffused light' },
  ],
  temperatura: [
    { id: 't3200', label: '3200K Tungsten', value: '3200K tungsten' },
    { id: 't4000', label: '4000K Warm',     value: '4000K warm white' },
    { id: 't5600', label: '5600K Daylight', value: '5600K daylight' },
    { id: 't6500', label: '6500K Cool',     value: '6500K cool daylight' },
    { id: 'mixed', label: 'Mixed',          value: 'mixed color temperatures' },
  ],
};

// ─── Campos para talking head / avatar / Instagram ────────────
export const CAMPOS_TALKING_HEAD = [
  { key: 'personaje',   label: 'Personaje',           icon: '👤', placeholder: 'Quién habla, cómo se ve, qué lleva puesto' },
  { key: 'dialogo',     label: 'Diálogo / Script',    icon: '🗣️', placeholder: 'El texto exacto que dice el personaje — este ES el audio' },
  { key: 'performance', label: 'Performance / Actuación', icon: '🎭', placeholder: 'Ej: parpadeo natural, manos quietas, gesticulando, histriónico, cuerpo rígido, relajado' },
  { key: 'energia',     label: 'Energía / Actitud',   icon: '🔥', placeholder: 'Ej: seguro y dominante, nervioso, apasionado, calmado, serio, entusiasmado' },
  { key: 'ritmo',       label: 'Velocidad del Habla',  icon: '⚡', placeholder: 'Ej: rápido tipo pitch, pausado, con silencios, fluido y directo' },
  { key: 'encuadre',    label: 'Cámara',              icon: '🎬', placeholder: 'Frontal a cámara, 3/4, plano medio, close-up' },
  { key: 'ambiente',    label: 'Fondo',               icon: '🏠', placeholder: 'Dónde está: oficina, estudio, fondo neutro, exterior' },
];

// ─── Presets para talking head ────────────────────────────────
// Cada preset tiene: label (español, lo que ve el usuario),
// value (español, lo que se llena en el textarea).
// La IA traduce todo a inglés en el prompt_final.
export const TALKING_HEAD_PRESETS = {
  performance: [
    { id: 'quieto',      label: '😐 Quieto',      value: 'Cuerpo quieto y estable, manos pegadas al cuerpo o sobre la mesa, casi sin movimiento, mirada fija' },
    { id: 'natural',     label: '🙂 Natural',     value: 'Parpadeo natural cada 3-5 segundos, gestos sutiles con las manos, micro-movimientos del torso, expresión relajada' },
    { id: 'expresivo',   label: '🤌 Expresivo',   value: 'Gesticula con las manos cerca del pecho para enfatizar, mueve la cabeza al hablar, cejas activas, se inclina ligeramente' },
    { id: 'histrionico', label: '🎭 Histriónico', value: 'Muy expresivo con todo el cuerpo, manos amplias y enfáticas, se inclina hacia la cámara, expresiones faciales exageradas, mueve la cabeza constantemente' },
  ],
  energia: [
    { id: 'calmado',    label: '😌 Calmado',    value: 'Sereno, relajado, en control total, transmite tranquilidad' },
    { id: 'seguro',     label: '💪 Seguro',     value: 'Confiado y dominante, con autoridad, sabe exactamente lo que dice' },
    { id: 'apasionado', label: '🔥 Apasionado', value: 'Entusiasmado, se emociona al hablar, le importa mucho lo que dice, energía alta' },
    { id: 'nervioso',   label: '😬 Nervioso',   value: 'Tenso, un poco inseguro, busca las palabras, energía contenida' },
    { id: 'serio',      label: '😐 Serio',      value: 'Profesional y directo, sin emoción extra, tono sobrio y formal' },
    { id: 'amigable',   label: '😊 Amigable',   value: 'Cálido, sonriente, como hablando con un amigo, cercano y accesible' },
  ],
  ritmo: [
    { id: 'veloz',      label: '⚡ Veloz',       value: 'Muy rápido, casi sin pausas, ritmo de ametralladora, cada sílaba nítida' },
    { id: 'rapido',     label: '🔴 Rápido',      value: 'Rápido y fluido, tipo pitch de founder, directo, sin titubeos' },
    { id: 'normal',     label: '🟡 Normal',      value: 'Ritmo conversacional natural, pausas normales para respirar, fácil de seguir' },
    { id: 'lento',      label: '🔵 Lento',       value: 'Pausado y deliberado, cada palabra con peso, ritmo controlado' },
    { id: 'con_pausas', label: '⚫ Con pausas',  value: 'Silencios dramáticos entre frases clave, 1-2 segundos de pausa entre ideas, las palabras llegan con precisión' },
  ],
  encuadre: [
    { id: 'frontal_medio',  label: '👁 Frontal medio',  value: 'Cámara frontal fija, plano medio, mira directo a la cámara' },
    { id: 'frontal_cerrado', label: '👁 Frontal close-up', value: 'Cámara frontal fija, close-up, mira directo a la cámara, se ve del pecho para arriba' },
    { id: 'tres_cuartos',   label: '↗ Tres cuartos',    value: 'Cámara en ángulo 3/4, plano medio, mirada ligeramente fuera de cámara, natural' },
    { id: 'apoyo',          label: '↗ Cámara de apoyo',  value: 'Mirada fuera de cámara, ángulo lateral sutil, tono documental, natural y no posado' },
  ],
  ambiente: [
    { id: 'oficina',   label: '🏢 Oficina',      value: 'Interior de oficina moderna, fondo limpio y profesional' },
    { id: 'estudio',   label: '🎙 Estudio',      value: 'Fondo de estudio, iluminación profesional, ambiente controlado' },
    { id: 'neutro',    label: '⬜ Fondo neutro',  value: 'Fondo sólido neutro, sin distracciones, foco total en el personaje' },
    { id: 'casa',      label: '🏠 Casa',         value: 'Interior de casa, ambiente cálido y personal, relajado' },
    { id: 'exterior',  label: '🌳 Exterior',     value: 'Exteriores, luz natural, ambiente abierto' },
    { id: 'cafe',      label: '☕ Café',          value: 'Interior de café o coworking, ambiente urbano y casual' },
  ],
};

// Función que retorna los campos según el modo
export function getCampos(shotMode) {
  return shotMode === 'talking_head' ? CAMPOS_TALKING_HEAD : CAMPOS_CINEMATIC;
}

// Retrocompatibilidad — exportar CAMPOS como los cinematográficos por defecto
export const CAMPOS = CAMPOS_CINEMATIC;

// ─── System prompt para desglose ──────────────────────────────
export function buildDesglosarSystem(mediaProvider, subjects, scenes, options = {}) {
  const {
    shotMode = 'cinematic',
    cameraAngle = 'frontal',
    speechRate = 'normal',
    intExt, tipoPlano, camara, lenteSerie, focal,
    movimientoCamara, esquemaLuz, temperatura,
    perfCinematic, energiaCinematic, ritmoCinematic,
  } = options;

  const SPEECH_RATE_MAP = {
    veloz:      'extremely fast pace — rapid-fire, almost no pauses, machine-gun rhythm',
    rapido:     'fast founder-style pitch — fluid, direct, high verbal momentum',
    normal:     'natural conversational pace — relaxed, clear, easy to follow',
    lento:      'slow and deliberate — each word carries weight, slight pauses between phrases',
    con_pausas: 'dramatic pauses between key phrases — silence as emphasis, 1-2 sec pauses between ideas',
  };

  const CAMERA_ANGLE_MAP = {
    frontal: {
      veo:   'direct address to camera, sustained eye contact with lens, frontal medium shot',
      kling: 'character looks directly into camera, sustained eye contact with lens, static frontal camera on tripod',
    },
    apoyo: {
      veo:   'character speaks candidly, gaze offset from lens, natural and unposed, slight profile angle',
      kling: 'character speaks naturally, gaze directed slightly off-camera, organic and candid, 3/4 angle',
    },
  };

  // Normalizar variantes seeddance_* → 'seeddance' para reglas de prompting
  // (todas usan el mismo modelo SeedDance, mismas reglas de composición de prompt)
  const baseProvider = mediaProvider.startsWith('seeddance') ? 'seeddance' : mediaProvider;

  const prov = VIDEO_PROVIDERS[mediaProvider] || VIDEO_PROVIDERS[baseProvider] || VIDEO_PROVIDERS.veo;

  const subjectCtx = subjects?.length > 0
    ? `\nPERSONAJES DEL PROYECTO:\n${subjects.map((s, i) =>
        `- ${s.name || `Personaje ${i+1}`}${s.description ? ' — ' + s.description : ''}`
      ).join('\n')}\nSi la descripción menciona estos personajes, usa su nombre y descripción exactos.`
    : '';

  const sceneCtx = scenes?.length > 0
    ? `\nESCENAS DEL PROYECTO:\n${scenes.map((s, i) =>
        `- ${s.name || `Escena ${i+1}`}${s.description ? ' — ' + s.description : ''}`
      ).join('\n')}\nSi la descripción menciona estas locaciones, usa su nombre y descripción exactos.`
    : '';

  // ════════════════════════════════════════════════════════════
  // MODO TALKING HEAD — campos y reglas completamente diferentes
  // ════════════════════════════════════════════════════════════
  if (shotMode === 'talking_head') {
    return `Eres un director de casting y performance para videos de avatar / Instagram / talking head.

Tu tarea: analizar la descripción del usuario y extraer TODO lo necesario para generar un video de una persona hablando a cámara con ${prov.label}.

CONTEXTO DE CÁMARA: ${CAMERA_ANGLE_MAP[cameraAngle]?.[baseProvider] || CAMERA_ANGLE_MAP[cameraAngle]?.veo || 'frontal medium shot'}
VELOCIDAD DEL HABLA SELECCIONADA POR EL USUARIO: ${SPEECH_RATE_MAP[speechRate] || SPEECH_RATE_MAP.normal}

INSTRUCCIONES DE EXTRACCIÓN:

1. "personaje" — Quién es, cómo se ve. Si hay personajes del proyecto, usa su descripción exacta. NO inventes ropa, pelo, edad, rasgos no mencionados.

2. "dialogo" — El texto EXACTO que dice el personaje. Esto ES el audio del video. Si el usuario escribió el script, cópialo tal cual. Si describió de qué habla pero no dio texto exacto, déjalo vacío "".

3. "performance" — LA ACTUACIÓN FÍSICA del cuerpo. Esto es CRÍTICO para que el avatar se vea real.
   Describe SOLO el movimiento físico, NO la emoción (eso va en "energia"):
   - PARPADEO: frecuencia de parpadeo (default: natural cada 3-5 segundos, nunca mirada congelada)
   - MANOS: ¿quietas pegadas al cuerpo? ¿gesticulando cerca del pecho? ¿muy expresivas/histriónicas? ¿moviéndose todo el tiempo?
   - CUERPO: ¿quieto y estable como estatua? ¿micro-movimientos sutiles? ¿se mueve mucho? ¿se inclina hacia la cámara? ¿histriónico con todo el torso?
   - EXPRESIÓN FACIAL: ¿sonríe? ¿cejas activas? ¿cara seria? ¿mueve mucho la cabeza al hablar?
   Si el usuario NO menciona nada de esto, genera un default neutro:
     "natural blinking every 3-5 seconds, hands relaxed at sides with occasional small gestures, stable torso with subtle micro-movements, neutral focused expression"

4. "energia" — LA ACTITUD Y ENERGÍA EMOCIONAL. Esto es INDEPENDIENTE de la velocidad del habla.
   IMPORTANTE: velocidad y energía son cosas separadas. Ejemplos:
   - Rápido + seguro = founder confiado, fluido, dominante (NO es ansioso)
   - Rápido + nervioso = se atropella, respira entre frases, inseguro
   - Rápido + apasionado = entusiasmado, se emociona, sube de tono
   - Lento + calmado = sereno, deliberado, autoridad
   - Lento + nervioso = busca palabras, pausas incómodas
   - Lento + apasionado = cada palabra tiene peso emocional
   Detecta la actitud del usuario y descríbela sin asumir que rápido = nervioso.
   Si no menciona nada, pon: "confident and natural".

5. "ritmo" — SOLO la velocidad y cadencia del habla, SIN mezclar emociones.
   Usa la velocidad seleccionada (${speechRate}) como base.
   Si el usuario describe algo diferente, ajusta.
   Ejemplos correctos:
   - "rapid-fire pace, barely pausing between sentences, fluid delivery"
   - "measured pace, deliberate word-by-word, long pauses between ideas"
   - "conversational pace, natural breathing pauses, easy flow"
   Ejemplos INCORRECTOS (NO mezclar emoción aquí):
   - "anxious rapid pace" ← la ansiedad va en "energia", no aquí
   - "confident slow delivery" ← la confianza va en "energia", no aquí

6. "encuadre" — Cámara. Default basado en el ángulo seleccionado. Si el usuario pide algo específico, úsalo.

7. "ambiente" — Dónde está. Solo si el usuario lo menciona, si no → "".

REGLA DE ORO — ANTI-ALUCINACIÓN:
- SOLO usa información explícita en la descripción del usuario.
- Si algo NO se menciona, devuelve el campo VACÍO "" (excepto "performance", "energia" y "ritmo" que siempre tienen default).
- No añadas colores, ropa, edad, etnia, detalles físicos no mencionados.
${subjectCtx}${sceneCtx}

REGLAS DE PERFORMANCE PARA ${prov.label.toUpperCase()}:
${baseProvider === 'veo' ? `- El diálogo va como: Audio: "texto del personaje"
- Performance y energía van integrados en la descripción visual del personaje.
- Formato: prosa fluida describiendo qué hace el personaje MIENTRAS habla.
- NO uses palabras: SACRED, DO NOT, MUST NOT, FORBIDDEN, NEVER — activan filtro RAI.` : ''}
${baseProvider === 'kling' ? `- El diálogo va etiquetado: [Character: principal]: "texto"
- Performance va como instrucciones de movimiento: "character blinks naturally, hands gesture near chest..."
- Usa sound: true, lip_sync: true.` : ''}

FORMATO DE SALIDA — responde SOLO con JSON válido, sin markdown, sin explicación:
{
  "personaje": "descripción visual del personaje con material cues si están disponibles",
  "dialogo": "texto exacto que dice el personaje — esto es el audio",
  "performance": "actuación FÍSICA: parpadeo + manos + cuerpo + expresión facial. Solo movimiento, no emoción. EN INGLÉS.",
  "energia": "actitud y energía emocional: seguro, nervioso, apasionado, calmado, histriónico, etc. INDEPENDIENTE de la velocidad. EN INGLÉS.",
  "ritmo": "SOLO velocidad y cadencia del habla, sin mezclar emociones. EN INGLÉS.",
  "encuadre": "ángulo y tipo de plano. EN INGLÉS.",
  "ambiente": "fondo/locación si se menciona",
  "prompt_final": "prompt completo EN INGLÉS optimizado para ${prov.label} que integra TODOS los campos. La combinación de performance + energía + ritmo es lo que hace la diferencia entre un avatar robótico y uno creíble. Máximo ${prov.maxTokens} tokens. Prosa fluida."
}

Si un campo no tiene información, devuélvelo como string vacío "" (excepto performance, energia y ritmo que SIEMPRE tienen valor).`;
  }

  // ════════════════════════════════════════════════════════════
  // MODO CINEMATOGRÁFICO — lógica original
  // ════════════════════════════════════════════════════════════
  const providerRules = {
    veo: `REGLAS ESPECÍFICAS PARA VEO 3.1:
- Front-load el sujeto: identidad clara al INICIO del prompt.
- Incluye material cues en ropa (charcoal cotton, silk, leather) para estabilizar el rendering.
- Describe la acción con verbos de movimiento con peso/resistencia, no genéricos.
- Nombra fuentes de luz concretas (neon sign, golden hour, fluorescent tubes), NO digas "dramatic lighting".
- El audio va en oraciones separadas: ambiente, efectos, diálogo.
- Diálogo: "persona dice: 'texto'" con dos puntos.
- Máximo 100-150 palabras. Formato: prosa fluida, NO lista de keywords.
- NUNCA uses palabras: SACRED, DO NOT, MUST NOT, FORBIDDEN, NEVER — activan filtro RAI.
- Para el campo encuadre: usa specs técnicas de cámara reales.
   Formato: [shot type], [angle], [camera move], shot on ARRI Alexa 35 Cooke S4/i [focal]mm T[aperture].
   Focales por tipo de plano:
   · close-up / insert producto: 50-65mm T4-T5.6
   · personaje lifestyle / medium: 40-50mm T2.8-T4
   · escena amplia / wide: 32-40mm T2.8-T4
   · macro / food / detalle: 65-100mm T2.8-T4
   Movimientos disponibles: static on tripod, slow dolly-in, dolly-out, arc dolly, tracking shot, gimbal stabilized, subtle handheld, crane up.
   Ángulos: eye-level, slight low angle 3-7°, slight high angle 5-10°, POV.
- Para el campo iluminacion: siempre incluir:
   · fuente motivada (window light, practical lamp, golden hour)
   · dirección (3/4 frontal, lateral, backlight)
   · temperatura de color (warm 3000K, natural 5600K, cool 6500K)
   · mood comercial: 'warm Colombian home premium feel'
   Ej: 'soft window light 3/4 frontal, bounce fill right side, subtle rim separation, warm 3000K, commercial premium'`,
    kling: `REGLAS ESPECÍFICAS PARA KLING 3.0:
- Empieza con la ESCENA (locación, luz, hora) para dar contexto espacial.
- Describe acciones SECUENCIALMENTE: "primero X, luego Y, finalmente Z" — NO apiles todo en una frase.
- Asigna identidades claras y consistentes: "the woman in a grey coat", "the barista".
- Instrucciones de cámara son OBLIGATORIAS: dolly, tracking, crane, POV, static tripod.
- Motion intensity: especifica si el movimiento es sutil (0.3) o dinámico (0.8).
- Audio: etiqueta al hablante [Character: Name, tone]: "diálogo".
- Negative prompts: incluye qué NO hacer (blur, morphing, extra fingers).
- Máximo 150-180 palabras. Piensa como Director de Fotografía.
- Para el campo encuadre: describe el comportamiento de cámara en lenguaje natural de director, NO specs técnicas.
   Incluye: tipo de plano, comportamiento del movimiento, y el look visual deseado.
   Ej: 'medium shot, camera slowly pushes toward subject, warm cinematic look, soft bokeh background'
   NO escribir: 'ARRI Alexa 35', 'T2.8', '40mm' — Kling los ignora.
- Para el campo iluminacion: describe el mood y la fuente motivada en lenguaje natural.
   Ej: 'warm afternoon window light, soft and flattering, Colombian home atmosphere'`,
    seeddance: `REGLAS ESPECÍFICAS PARA SEEDANCE 2.0:
- La consistencia del personaje es PRIORIDAD #1.
- Describe al personaje con TODOS los detalles (ropa, pelo, rasgos) al inicio Y al final del prompt.
- Formato de referencia: @image_file_1 para character, @video_file_1 para motion.
- No soporta audio nativo — omite el campo audio.
- Máximo 200 palabras. Foco en pose, expresión, identidad visual.
- Para el campo encuadre: describe ángulo y distancia solamente.
   Formato simple: [shot type], [angle], [static/slow move]. Sin specs técnicas de lente.
   Ej: 'medium close-up, eye-level, static camera'
- Para el campo iluminacion: descripción simple del ambiente lumínico.
   Ej: 'warm natural home light, soft shadows'`,
  };

  const cameraBlock = [
    intExt           ? `- Locación: ${intExt}`                                    : null,
    tipoPlano        ? `- Tipo de plano: ${tipoPlano}`                            : null,
    camara           ? `- Cámara: ${camara}`                                      : null,
    lenteSerie       ? `- Serie de lentes: ${lenteSerie}`                         : null,
    focal            ? `- Focal: ${focal}`                                        : null,
    movimientoCamara ? `- Movimiento de cámara: ${movimientoCamara}`              : null,
    esquemaLuz?.length ? `- Esquema de iluminación: ${esquemaLuz.join(', ')}`     : null,
    temperatura      ? `- Temperatura de color: ${temperatura}`                   : null,
    perfCinematic    ? `- Performance del personaje: ${perfCinematic}`            : null,
    energiaCinematic ? `- Energía / actitud: ${energiaCinematic}`                 : null,
    ritmoCinematic   ? `- Ritmo de escena: ${ritmoCinematic}`                     : null,
  ].filter(Boolean).join('\n');

  return `Eres un supervisor de fotografía cinematográfica experto en IA generativa de video.

Tu tarea: convertir una descripción en lenguaje natural a campos cinematográficos optimizados para ${prov.label}.

FÓRMULA DEL PROMPT para ${prov.label}:
${prov.formula}

${providerRules[baseProvider] || providerRules.veo}

REGLA DE ORO — ANTI-ALUCINACIÓN:
- SOLO usa información explícita en la descripción del usuario.
- Si algo NO se menciona, devuelve el campo VACÍO "". Nunca inventes.
- No añadas colores, ropa, edad, etnia, detalles físicos no mencionados.
- No inventes locaciones, marcas ni nombres propios.
${subjectCtx}${sceneCtx}

${cameraBlock ? `ESPECIFICACIONES TÉCNICAS Y DIRECCIÓN DE ACTORES CONFIRMADAS POR EL DIRECTOR (úsalas exactamente en el prompt_final, NO las cambies ni inventes):
${cameraBlock}

INSTRUCCIÓN PARA HUMANIDAD: Si hay performance, energía o ritmo definidos, intégralos en la descripción FÍSICA del personaje en el prompt_final. Describe movimientos concretos, no estados abstractos. Ej: "blinks naturally every 3-4 seconds, hands relaxed at sides with occasional subtle gestures, torso shows micro-movements" en lugar de "acts naturally".
` : ''}FORMATO DE SALIDA — responde SOLO con JSON válido, sin markdown, sin explicación:
{
  "personaje": "descripción exacta del personaje con material cues si están disponibles",
  "accion": "acción secuencial en términos visuales concretos",
  "ambiente": "locación, hora, elementos del set basados solo en lo mencionado",
  "encuadre": "SOLO movimiento de cámara y contexto adicional no cubierto por las especificaciones técnicas del director. Si ya están todas definidas, puede ser string vacío.",
  "iluminacion": "fuente de luz concreta y dirección",
  "audio": "ambiente sonoro, efectos, diálogo si aplica${!prov.audioSupport ? ' (vacío — este proveedor no soporta audio)' : ''}",
  "prompt_final": "prompt completo en inglés optimizado para ${prov.label} siguiendo la fórmula exacta. Máximo ${prov.maxTokens} tokens. Prosa fluida, NO lista de keywords."
}

Si un campo no tiene información, devuélvelo como string vacío "".`;
}

// Llamada LLM via LLMProviderFactory
export async function callLLM(llmName, system, userText, maxTokens = 1000) {
  const provider = LLMProviderFactory.create(llmName);
  const result   = await provider.complete({
    system,
    prompt:      userText,
    temperature: 0.3,
    max_tokens:  maxTokens,
  });
  return result.text || '';
}

// Extraer JSON de cualquier texto (maneja thinking blocks, backticks, prosa extra)
export function extractJSON(rawText) {
  if (!rawText) {
    console.warn('[extractJSON] rawText is empty/null');
    return null;
  }
  console.log('[extractJSON] Input preview:', rawText.slice(0, 300));

  let clean = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try { return JSON.parse(clean); } catch {}

  const start = clean.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let end = -1;
  for (let i = start; i < clean.length; i++) {
    if (clean[i] === '{') depth++;
    else if (clean[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;

  const jsonStr = clean.slice(start, end + 1);
  try { return JSON.parse(jsonStr); } catch {}

  const fixed = jsonStr
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
  try { return JSON.parse(fixed); } catch {}

  return null;
}