// src/components/studio/ManualPromptBuilder.jsx
// Prompt Manual con desglose por IA.
// Usa Claude Structured Outputs (output_config.format) para JSON garantizado.
// Errores comunes de cada proveedor documentados y prevenidos.

import React, { useState, useRef } from 'react';

const C = {
  bg:      '#1A1A1A',
  panel:   '#252525',
  border:  '#3A3A3A',
  accent:  '#00A8E8',
  success: '#00D084',
  warning: '#FFB800',
  error:   '#FF4757',
  text:    '#DDDDDD',
  muted:   '#777777',
  dim:     '#444444',
  purple:  '#9B6DD6',
};

// ─── Proveedores de video con errores comunes documentados ────
// Fuentes: Google Cloud Veo guide, fal.ai Kling 3.0, ByteDance Seedance docs,
//          skywork.ai top 10 mistakes, artlist.io prompting guide 2025
const PROVIDERS = {
  veo: {
    label: 'Veo 3.1',
    color: '#00A8E8',
    icon:  '◈',
    maxWords: 150,
    // Orden validado: Google Cloud Ultimate Prompting Guide 2025
    order: 'Subject+action → Environment → Shot type → Camera movement → Lighting → Technical style',
    // Errores más comunes documentados (skywork.ai + Google Cloud 2025)
    mistakes: [
      'Vague subject — describe WHO/WHAT with specific visible traits only',
      'Multiple actions — pick ONE action (e.g. "opens door" not "opens door and walks in")',
      'Prompt over 175 words — Veo ignores everything beyond that',
      'Compound camera moves — ONE move only per shot',
      'HANDS near objects — Veo distorts hands; say "reaches toward door handle" not "grabs handle"',
      'Door/threshold scenes — specify WHICH SIDE of door camera is on to avoid spatial hallucination',
      'Empty audio field — if not specified Veo invents sounds (studio audience, random music)',
      'Negatives ("no movement") — describe what you want instead of what you do not want',
      'Inventing details not in description — if user did not say it, do not add it',
    ],
  },
  kling: {
    label: 'Kling 3.0',
    color: '#00D084',
    icon:  '◆',
    maxWords: 70,
    // Orden: fal.ai Kling 3.0 guide + official Kling docs
    order: 'Subject+description → Subject movement → Scene/environment → Camera behavior → Lighting+mood → Style',
    mistakes: [
      'Missing end-state — always describe where the action ends to prevent 99% hang',
      'Compound camera moves — causes geometry distortion, use ONE move',
      'Prompt over 80 words for text-to-video (20-40 for image-to-video)',
      'Vague movement ("she moves") — use specific verbs ("sprints", "turns slowly")',
      'Generic adjectives like "beautiful" or "cool" — describe visually instead',
      'Too many simultaneous actions — max 2-3 actions total',
    ],
  },
  seeddance: {
    label: 'Seedance 2.0',
    color: '#9B6DD6',
    icon:  '◉',
    maxWords: 100,
    // Orden: ByteDance official + WaveSpeed + promptaivideos.com guide
    order: 'Subject identity (repeat exactly) → ONE action with intensity → Environment → ONE camera move → Lighting → Audio (optional)',
    mistakes: [
      'Multiple actions — Seedance works best with ONE clear action per shot',
      'Compound camera moves — split into sequential beats instead',
      'Inconsistent subject description — repeat the EXACT same description every shot',
      'Too many references (8+) — sweet spot is 6-7 total references max',
      'No intensity descriptor — add adverbs: "walks slowly", "turns sharply"',
      'Using negatives — Seedance does NOT process negative prompts, describe positively',
    ],
  },
};

// ─── Modelos Gemini disponibles — misma API key ───────────────
// Pro: mejor calidad, más lento.  Flash: más rápido, más barato.
const GEMINI_MODELS = [
  { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro',   color: '#4285F4', note: 'Mejor calidad' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash',  color: '#34A853', note: 'Más rápido'    },
];

// ─── Campos del desglose ──────────────────────────────────────
const CAMPOS = [
  { key: 'personaje',   label: 'Personaje',           icon: '👤' },
  { key: 'accion',      label: 'Acción',               icon: '⚡' },
  { key: 'encuadre',    label: 'Encuadre / Plano',     icon: '🎬' },
  { key: 'movimiento',  label: 'Movimiento de cámara', icon: '🎥' },
  { key: 'iluminacion', label: 'Iluminación',           icon: '💡' },
  { key: 'ambiente',    label: 'Ambiente / Fondo',     icon: '🏠' },
];

// ─── Schemas para responseSchema de Gemini ───────────────────
// Gemini no soporta additionalProperties — omitido.
// Schemas separados para cada paso: extracción y prompt final.

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    personaje:   { type: 'string', description: 'Subject visual description from images or user text. Empty string if unknown.' },
    accion:      { type: 'string', description: 'Physical action. Empty string if not mentioned.' },
    encuadre:    { type: 'string', description: 'Shot type if specified. Empty string if not mentioned.' },
    movimiento:  { type: 'string', description: 'Camera movement if specified. Empty string if not mentioned.' },
    iluminacion: { type: 'string', description: 'Lighting if specified. Empty string if not mentioned.' },
    ambiente:    { type: 'string', description: 'Location/setting if mentioned. Empty string if not mentioned.' },
  },
  // Sin required — Gemini puede devolver campos vacíos "" sin inventar
};

const PROMPT_SCHEMA = {
  type: 'object',
  properties: {
    prompt_final: { type: 'string' },
  },
  required: ['prompt_final'],
};

// ─── Prompts del sistema ─────────────────────────────────────
// PASO 1: Extraer campos — con visión de imágenes si existen
// Si hay imágenes del personaje, Gemini las VE y describe lo real.
// Si no hay imágenes, extrae solo lo que el usuario mencionó.
function buildExtractPrompt(hasImages) {
  const imageInstruction = hasImages
    ? `REFERENCE IMAGES PROVIDED: The images show the actual subject(s).
Describe what you SEE in the images for the "personaje" field — exact clothing, hair, physical appearance visible.
Do NOT describe what you assume or invent — only what is clearly visible.`
    : `NO REFERENCE IMAGES: For "personaje", use only what the user explicitly describes.`;

  return `You are an extraction assistant for AI video scene descriptions.

${imageInstruction}

ABSOLUTE RULE: If something is NOT mentioned by the user and NOT visible in images → empty string "".
- User says NOTHING about camera → movimiento: ""
- User says NOTHING about lighting → iluminacion: ""
- User says NOTHING about shot type → encuadre: ""

EXAMPLES:
- "opens the front door" → accion:"opens the front door slowly", movimiento:"", encuadre:""
- "static shot" → movimiento:"static", encuadre:""
- "close-up" → encuadre:"close-up shot"
- nothing about lighting → iluminacion:""

FIELDS (empty string if not present):
- personaje: visual appearance (from images if provided, else from description)
- accion: physical action only
- encuadre: shot type if specified
- movimiento: camera movement if specified
- iluminacion: lighting if specified
- ambiente: location/setting if mentioned

Return JSON with these 6 fields only.`;
}

// PASO 2: Gemini escribe el prompt para Veo (meta-prompting)
// Basado en la técnica de Google DeepMind — Gemini como escritor de prompts para video
function buildPromptFinalSystem(mediaProvider) {
  const prov = PROVIDERS[mediaProvider] || PROVIDERS.veo;
  return `You are an expert prompt writer for ${prov.label}, an AI video generation model.

Your job: write a detailed, rich, cinematic prompt that ${prov.label} will understand and execute well.

HOW TO WRITE A GREAT ${prov.label.toUpperCase()} PROMPT:
- Write in English, present tense, cinematic language
- Be specific and visual — describe what the camera SEES, not what the story means
- Order: ${prov.order}
- Length: ${prov.maxWords} words maximum
- Include only what is grounded in the provided fields
- Fields marked [not mentioned] must be completely omitted — do not invent replacements
- NO music, NO soundtrack, NO audio unless explicitly in the fields
- NO subtitles, NO text overlays
- Use precise film terminology: shot types, lens descriptions, lighting setups

STYLE GUIDANCE for ${prov.label}:
${prov.mistakes.slice(0,4).map((m) => `• Avoid: ${m}`).join('\n')}

Return JSON: {"prompt_final":"<your detailed ${prov.label} prompt here>"}`;
}

// ─── Convertir URL de imagen a base64 para Gemini Vision ───────
async function urlToBase64(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const [header, data] = reader.result.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
        resolve({ mimeType, data });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ─── Helpers compartidos ──────────────────────────────────────

function extractGeminiText(data) {
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim()
    || parts.find(p => p.text)?.text?.trim() || '';
  if (!text) {
    const reason  = data.candidates?.[0]?.finishReason || 'unknown';
    const blocked = data.promptFeedback?.blockReason;
    if (blocked)          throw new Error(`Gemini bloqueó: ${blocked}`);
    if (reason === 'SAFETY')    throw new Error('Gemini bloqueó por safety filters');
    if (reason === 'MAX_TOKENS') throw new Error('Respuesta cortada');
    throw new Error(`Gemini sin texto (finishReason: ${reason})`);
  }
  return text;
}

function parseJSON(text) {
  const clean = text
    .replace(/\u201c|\u201d|\u201e|\u201f/g, '"')
    .replace(/\u2018|\u2019|\u201a|\u201b/g, "'")
    .replace(/^```json\s*/im, '').replace(/^```\s*/im, '').replace(/\s*```$/im, '')
    .trim();
  try { return JSON.parse(clean); } catch {}
  const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
  if (s !== -1 && e > s) { try { return JSON.parse(clean.slice(s, e + 1)); } catch {} }
  throw new Error(`JSON inválido: "${clean.slice(0, 80)}..."`);
}

async function geminiCall(model, systemPrompt, userParts, genConfig) {
  const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:4000';
  const res = await fetch(
    `${serverUrl}/api/llm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:            'gemini-proxy',
        model,
        contents:          [{ role: 'user', parts: userParts }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig:  genConfig,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini ${model} ${res.status}: ${err?.error?.message || res.statusText}`);
  }
  return res.json();
}

// PASO 1 — Con imágenes: texto libre (Vision + JSON mode son incompatibles)
async function geminiVision(model, systemPrompt, userText, imageUrls) {
  const userParts = [];
  for (const url of imageUrls.filter(Boolean)) {
    const img = await urlToBase64(url);
    if (img) userParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  userParts.push({ text: userText });
  const data = await geminiCall(model, systemPrompt, userParts,
    { temperature: 0.1, maxOutputTokens: 2048 }
  );
  return parseJSON(extractGeminiText(data));
}

// PASO 1 sin imágenes / PASO 2 — JSON mode garantizado
async function geminiJSON(model, systemPrompt, userText, schema) {
  const data = await geminiCall(model, systemPrompt, [{ text: userText }],
    { temperature: 0.1, maxOutputTokens: 2048,
      responseMimeType: 'application/json', responseSchema: schema }
  );
  return parseJSON(extractGeminiText(data));
}

// ─── Desglose en 2 pasos ─────────────────────────────────────
async function callLLM(model, _unused, userText, mediaProvider, subjectData) {

  // ── Vistas del sujeto principal ──────────────────────────────
  const principal = subjectData?.[0] || null;
  const vistas = [
    principal?.view_front_url,
    principal?.view_three_quarter_url,
    principal?.view_side_url,
  ].filter(Boolean);

  // ── PASO 1: extracción ───────────────────────────────────────
  // CON imágenes → geminiVision (texto libre, sin JSON mode)
  // SIN imágenes → geminiJSON (JSON mode garantizado)
  let campos;

  if (vistas.length > 0) {
    // Estrategia progresiva: empieza con la frontal sola.
    // Si personaje queda vacío, agrega la siguiente vista.
    // Solo usa las vistas que realmente existen.
    campos = null;
    for (let i = 1; i <= vistas.length; i++) {
      const imageUrls = vistas.slice(0, i);
      campos = await geminiVision(
        model,
        buildExtractPrompt(true),
        `Reference image(s) show the subject. Scene description: ${userText}`,
        imageUrls
      );
      if (campos?.personaje?.trim()) break; // personaje detectado — parar
    }
    if (!campos) throw new Error('No se pudo analizar el sujeto');
  } else {
    // Sin imágenes: extracción pura de texto con JSON mode
    campos = await geminiJSON(
      model,
      buildExtractPrompt(false),
      userText,
      EXTRACT_SCHEMA
    );
  }

  // ── PASO 2: construir prompt final (siempre JSON mode) ────────
  const camposTexto = Object.entries(campos)
    .map(([k, v]) => v && String(v).trim() ? `${k}: ${v}` : `${k}: [omit - not specified]`)
    .join('\n');

  const result = await geminiJSON(
    model,
    buildPromptFinalSystem(mediaProvider),
    `Write the video prompt using ONLY these fields. Omit anything marked [omit]:\n${camposTexto}`,
    PROMPT_SCHEMA
  );

  return { ...campos, prompt_final: result.prompt_final || '' };
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────
export default function ManualPromptBuilder({
  mediaProvider = 'veo',
  subjectData   = [],
  onPromptReady,
  initialPrompt = '',
}) {
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-pro');
  const [accion,      setAccion]      = useState('');
  const [campos,      setCampos]      = useState({});
  const [promptFinal, setPromptFinal] = useState(initialPrompt);
  const [step,        setStep]        = useState('input');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const textareaRef = useRef();

  const prov    = PROVIDERS[mediaProvider] || PROVIDERS.veo;


  // ── Desglosar ───────────────────────────────────────────────
  const handleDesglosar = async () => {
    if (!accion.trim()) { setError('Describe lo que pasa en este plano primero.'); return; }
    setError(null);
    setLoading(true);
    try {
      const parsed = await callLLM(geminiModel, null, accion.trim(), mediaProvider, subjectData);
      const { prompt_final, ...camposDesglosados } = parsed;
      setCampos(camposDesglosados);
      setPromptFinal(prompt_final || '');
      setStep('review');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Regenerar prompt con campos editados ─────────────────────
  const handleRegenerar = async () => {
    setError(null);
    setLoading(true);
    try {
      const camposTexto = CAMPOS
        .map(c => campos[c.key] ? `${c.key}: ${campos[c.key]}` : null)
        .filter(Boolean).join('\n');

      const result = await geminiJSON(
        geminiModel,
        buildPromptFinalSystem(mediaProvider),
        `Write the video prompt using ONLY these fields. Omit anything marked [omit]:\n${camposTexto}`,
        PROMPT_SCHEMA
      );
      if (result.prompt_final) setPromptFinal(result.prompt_final);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Aplicar ──────────────────────────────────────────────────
  const handleAplicar = () => {
    if (!promptFinal.trim()) return;
    onPromptReady?.(promptFinal.trim());
    setStep('done');
  };

  // ── Limpiar todo ─────────────────────────────────────────────
  const handleLimpiar = () => {
    setStep('input');
    setAccion('');
    setCampos({});
    setPromptFinal('');
    setError(null);
    onPromptReady?.('');
  };

  const updateCampo = (key, value) => setCampos(prev => ({ ...prev, [key]: value }));

  return (
    <div style={s.wrapper}>

      {/* ── HEADER ──────────────────────────────────────────── */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={{ ...s.dot, background: prov.color }} />
          <span style={s.title}>PROMPT MANUAL</span>
          <span style={{ ...s.badge, color: prov.color, borderColor: prov.color + '40' }}>
            {prov.icon} {prov.label}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {step !== 'input' && (
            <button style={s.btnGhostSm} onClick={() => { setStep('input'); setError(null); }}>
              ↺ editar
            </button>
          )}
          {(promptFinal.trim() || accion.trim()) && (
            <button style={{ ...s.btnGhostSm, color: C.error }} onClick={handleLimpiar}>
              ✕ limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── PASO 1: INPUT ───────────────────────────────────── */}
      {(step === 'input' || step === 'done') && (
        <div style={s.section}>

          {/* Badge IA activa */}
          {/* Selector de modelo Gemini */}
          <div style={s.fieldGroup}>
            <span style={s.label}>MODELO DE IA</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {GEMINI_MODELS.map(m => (
                <button
                  key={m.id}
                  onClick={() => setGeminiModel(m.id)}
                  title={m.note}
                  style={{
                    ...s.llmBtn,
                    borderColor: geminiModel === m.id ? m.color : C.border,
                    color:       geminiModel === m.id ? m.color : C.muted,
                    background:  geminiModel === m.id ? m.color + '15' : 'transparent',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <span style={s.hintSm}>
              {GEMINI_MODELS.find(m => m.id === geminiModel)?.note} · fallback automático al otro modelo si falla
            </span>
          </div>

          {/* Textarea */}
          <div style={s.fieldGroup}>
            <label style={s.label}>DESCRIBE LO QUE PASA EN ESTE PLANO</label>
            <span style={s.hint}>Escribe como hablas. Sin tecnicismos.</span>
            <textarea
              ref={textareaRef}
              value={accion}
              onChange={e => setAccion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleDesglosar(); }}
              placeholder={
                mediaProvider === 'veo'
                  ? 'Ej: "La mamá llega cansada a casa, abre la puerta y abraza a su hijo"'
                  : mediaProvider === 'kling'
                  ? 'Ej: "El detective entra a la habitación oscura y enciende su linterna"'
                  : 'Ej: "La mujer se gira despacio hacia la ventana y mira hacia afuera"'
              }
              rows={4}
              disabled={loading}
              style={{ ...s.textarea, borderColor: accion.trim() ? C.warning + '80' : C.border }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={s.hintSm}>Ctrl+Enter para desglosar</span>
              <span style={{ ...s.hintSm, color: accion.length > 300 ? C.warning : C.dim }}>
                {accion.length} chars
              </span>
            </div>
          </div>

          {/* Personajes */}
          {subjectData.length > 0 && (
            <div style={s.fieldGroup}>
              <span style={s.label}>PERSONAJES INCLUIDOS AUTOMÁTICAMENTE</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {subjectData.map((item, i) => (
                  <div key={item.id} style={s.chip}>
                    <span style={{ color: C.purple }}>◉</span>
                    <span>{item.name || `Personaje ${i + 1}`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errores comunes del proveedor */}
          <details style={s.details}>
            <summary style={s.detailsSummary}>
              ⚠ {prov.mistakes.length} errores comunes a evitar en {prov.label}
            </summary>
            <div style={s.mistakesList}>
              {prov.mistakes.map((m, i) => (
                <div key={i} style={s.mistakeItem}>
                  <span style={{ color: C.warning, fontSize: 9 }}>✗</span>
                  <span>{m}</span>
                </div>
              ))}
            </div>
          </details>

          <button
            onClick={handleDesglosar}
            disabled={loading || !accion.trim()}
            style={{
              ...s.btnPrimary,
              background: loading ? C.dim : C.warning,
              color:      '#1A1A1A',
              opacity:    !accion.trim() ? 0.4 : 1,
              cursor:     loading || !accion.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {loading
              ? '⟳ TRADUCIENDO AL LENGUAJE DEL VIDEO...'
              : '▶ DESGLOSAR Y TRADUCIR'
            }
          </button>

          {step === 'done' && (
            <div style={s.doneBox}>
              <span style={{ color: C.success }}>✓ Prompt aplicado al shot</span>
            </div>
          )}
        </div>
      )}

      {/* ── PASO 2: REVIEW ──────────────────────────────────── */}
      {step === 'review' && (
        <div style={s.section}>
          <div style={{ ...s.label, color: C.text, marginBottom: 2 }}>REVISA Y AJUSTA LOS CAMPOS</div>
          <div style={{ ...s.hint, marginBottom: 8 }}>La IA los interpretó de tu descripción. Edita si algo está mal.</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {CAMPOS.map(campo => (
              <div key={campo.key}>
                <label style={{ ...s.label, display: 'flex', gap: 5, alignItems: 'center', marginBottom: 3 }}>
                  <span>{campo.icon}</span>
                  {campo.label}
                  {!campos[campo.key] && <span style={{ color: C.dim, fontStyle: 'italic', fontWeight: 400 }}>— no detectado</span>}
                </label>
                <textarea
                  value={campos[campo.key] || ''}
                  onChange={e => updateCampo(campo.key, e.target.value)}
                  rows={2}
                  style={{
                    ...s.textarea,
                    fontSize: 10,
                    borderColor: campos[campo.key] ? C.border : C.dim + '50',
                  }}
                />
              </div>
            ))}
          </div>

          <button
            onClick={handleRegenerar}
            disabled={loading}
            style={{ ...s.btnSecondary, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? '⟳ Regenerando...' : '↺ REGENERAR PROMPT CON ESTOS CAMPOS'}
          </button>

          {/* Prompt final */}
          <div style={s.promptBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ ...s.label, color: C.text }}>
                PROMPT FINAL · {prov.icon} {prov.label}
              </span>
              <span style={s.hintSm}>
                {promptFinal.split(' ').filter(Boolean).length}/{prov.maxWords} palabras
                {promptFinal.split(' ').filter(Boolean).length > prov.maxWords && (
                  <span style={{ color: C.error }}> ⚠ muy largo</span>
                )}
              </span>
            </div>
            <div style={{ ...s.hintSm, marginBottom: 6, fontStyle: 'italic' }}>
              Orden: {prov.order}
            </div>
            <textarea
              value={promptFinal}
              onChange={e => setPromptFinal(e.target.value)}
              rows={6}
              style={{ ...s.textarea, borderColor: promptFinal.trim() ? prov.color + '60' : C.border, fontSize: 10, lineHeight: 1.7 }}
            />
          </div>

          <button
            onClick={handleAplicar}
            disabled={!promptFinal.trim() || loading}
            style={{
              ...s.btnPrimary,
              background: promptFinal.trim() ? C.success : C.dim,
              color:      '#1A1A1A',
              cursor:     promptFinal.trim() ? 'pointer' : 'not-allowed',
              opacity:    !promptFinal.trim() ? 0.4 : 1,
            }}
          >
            ✓ APLICAR AL SHOT
          </button>

          <button onClick={() => { setStep('input'); setError(null); }} style={s.btnGhost}>
            ← volver a la descripción
          </button>
        </div>
      )}

      {/* ── ERROR ─────────────────────────────────────────── */}
      {error && (
        <div style={s.errorBox}>
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: C.error, cursor: 'pointer', fontSize: 13 }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────
const s = {
  wrapper:   { display: 'flex', flexDirection: 'column', gap: 10, background: '#2A2A2A', border: `1px solid ${C.border}`, borderRadius: 6, padding: 14 },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft:{ display: 'flex', gap: 8, alignItems: 'center' },
  dot:       { width: 6, height: 6, borderRadius: '50%', flexShrink: 0 },
  title:     { fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: '0.12em', fontFamily: 'monospace' },
  badge:     { fontSize: 8, fontFamily: 'monospace', letterSpacing: '0.08em', fontWeight: 700, border: '1px solid', borderRadius: 3, padding: '2px 6px' },
  section:   { display: 'flex', flexDirection: 'column', gap: 10 },
  fieldGroup:{ display: 'flex', flexDirection: 'column', gap: 4 },
  label:     { fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: '0.1em', fontFamily: 'monospace' },
  hint:      { fontSize: 9, color: C.dim, fontFamily: 'monospace', lineHeight: 1.4 },
  hintSm:    { fontSize: 8, color: C.dim, fontFamily: 'monospace' },
  textarea:  { width: '100%', boxSizing: 'border-box', resize: 'vertical', background: '#1A1A1A', color: C.text, border: '1px solid', borderRadius: 4, padding: '8px 10px', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.6, outline: 'none', transition: 'border-color 0.15s' },
  llmBtn:    { background: 'transparent', border: '1px solid', borderRadius: 3, padding: '4px 10px', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer', transition: 'all 0.15s' },
  chip:      { display: 'flex', gap: 4, alignItems: 'center', background: 'rgba(155,109,214,0.1)', border: '1px solid rgba(155,109,214,0.25)', borderRadius: 3, padding: '3px 8px', fontSize: 9, color: '#C39BD3', fontFamily: 'monospace' },
  details:   { background: '#1E1E1E', border: `1px solid ${C.border}`, borderRadius: 4, padding: '6px 10px' },
  detailsSummary: { fontSize: 9, color: C.warning, fontFamily: 'monospace', cursor: 'pointer', letterSpacing: '0.06em' },
  mistakesList:   { display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 },
  mistakeItem:    { display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 9, color: C.muted, fontFamily: 'monospace', lineHeight: 1.5 },
  btnPrimary:{ width: '100%', padding: '11px', border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', fontFamily: 'monospace', transition: 'opacity 0.15s' },
  btnSecondary: { width: '100%', padding: '7px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', fontFamily: 'monospace', transition: 'opacity 0.15s' },
  btnGhost:  { background: 'transparent', border: 'none', color: C.dim, fontSize: 9, cursor: 'pointer', fontFamily: 'monospace', letterSpacing: '0.06em', padding: '4px 0', alignSelf: 'flex-start' },
  btnGhostSm:{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 3, color: C.dim, fontSize: 8, cursor: 'pointer', fontFamily: 'monospace', letterSpacing: '0.08em', padding: '2px 8px' },
  promptBox: { background: '#1E1E1E', border: `1px solid ${C.border}`, borderRadius: 5, padding: 10 },
  doneBox:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,208,132,0.08)', border: `1px solid rgba(0,208,132,0.25)`, borderRadius: 4, padding: '8px 12px', fontSize: 10, fontFamily: 'monospace' },
  errorBox:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,71,87,0.1)', border: `1px solid ${C.error}`, borderRadius: 4, padding: '6px 10px', fontSize: 10, color: C.error, fontFamily: 'monospace' },
};