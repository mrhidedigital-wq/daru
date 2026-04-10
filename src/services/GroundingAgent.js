// src/services/GroundingAgent.js
//
// Agente anti-alucinación para generación de frames (Shots) y escenas (Scenes).
//
// PROBLEMA QUE RESUELVE:
//   Gemini IMAGE recibe varias imágenes de referencia + un prompt largo
//   y no sabe qué priorizar. Inventa ropa, cambia el fondo, mezcla sujetos.
//
// SOLUCIÓN — pipeline de 3 pasos inspirado en AnalysisNode + PreservationGuardNode:
//
//   PASO 1 — GROUNDING (Gemini TEXT):
//     Lee todas las imágenes de referencia y produce un "Ground Truth" JSON:
//     quién es el sujeto exactamente, cómo es el fondo exactamente,
//     qué iluminación hay, qué NO puede cambiar.
//
//   PASO 2 — GENERATE (Gemini IMAGE):
//     Genera la imagen con un prompt "anclado" que incrusta el Ground Truth
//     como ley explícita. El modelo ya no necesita inferir nada.
//
//   PASO 3 — VALIDATE (Gemini TEXT):
//     Compara el frame generado contra las referencias originales.
//     Score 0-1. Si < umbral → reintenta automáticamente (máx 2 veces).
//
// API:
//   const agent = new GroundingAgent();
//
//   // MODO AUTOMÁTICO — grounding desde imágenes (análisis automático)
//   const result = await agent.generate({ subjectRefs, sceneRefs, prompt, aspectRatio, cinematicParams });
//
//   // MODO MANUAL — grounding desde ficha técnica (más preciso, sin análisis de imágenes)
//   const result = await agent.generate({
//     subjectRefs, sceneRefs, prompt, aspectRatio, cinematicParams,
//     manualGrounding: {
//       subjectDescription: 'mamá colombiana, camisa azul claro botones, pantalón beige/khaki, bolso crema, pelo liso suelto',
//       sceneDescription:   'recibidor hogar urbano colombiano, puerta madera/mostaza, perchero chaqueta mostaza + casco teal, luz cálida entrada',
//     }
//   });
//
//   // result.imageBase64     — imagen final
//   // result.groundTruth     — Ground Truth usado (manual o auto)
//   // result.groundingMode   — 'manual' | 'auto'
//   // result.validationScore — 0.0 - 1.0
//   // result.warnings        — alucinaciones detectadas
//   // result.attempts        — cuántos intentos tomó
//
// INTEGRACIÓN (AssetManagerShots.jsx / AssetManagerScenes.jsx):
//   // ANTES:
//   const base64 = await generateImageWithGemini(prompt, refs, aspectRatio);
//   // DESPUÉS:
//   const agent = new GroundingAgent();
//   const result = await agent.generate({ refs, prompt, aspectRatio });
//   const base64 = result.imageBase64;
//
// MODELOS (actualizado marzo 2026):
//   TEXT:  gemini-3.1-flash-lite-preview — grounding (paso 1) y validación (paso 3)
//          ⚠️ gemini-3-flash-preview fue DEPRECADO el 9 marzo 2026 (devuelve 404)
//   IMAGE: gemini-2.5-flash-image         — generación de frames (Nano Banana 1, estable)
//          gemini-3.1-flash-image-preview  — alternativa más rápida (Nano Banana 2, feb 2026)

import { urlToInlineData } from './assetUtils';

// ─── Modelos Gemini ───────────────────────────────────────────────────────────
// El modelo se pasa en el body; el proxy en /api/gemini/proxy lo lee de req.body.model
const GEMINI_TEXT_MODEL  = 'gemini-2.5-flash';
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';

function geminiTextEndpoint()  { return '/api/gemini/proxy'; }
function geminiImageEndpoint() { return '/api/gemini/proxy'; }

// ─── System prompt del PASO 1 — Grounding ────────────────────────────────────
const GROUNDING_SYSTEM = `You are a visual reference analyst for a cinematic AI frame generation system.
Your job: examine the provided reference images and produce a precise Ground Truth inventory.
This inventory will be used as a strict contract to prevent AI hallucination during image generation.

RESPOND ONLY WITH VALID JSON. No markdown, no backticks, no explanation.

JSON Schema:
{
  "subject": {
    "present": true,
    "description": "exact physical description from reference",
    "clothing": "exact clothing description — colors, textures, cut, every detail",
    "hair": "exact hair color, length, style",
    "skin_tone": "exact skin tone descriptor",
    "body_type": "exact body type",
    "distinctive_features": ["list of unique identifiable features"]
  },
  "background": {
    "present": true,
    "setting": "exact location description",
    "dominant_colors": ["color1", "color2"],
    "lighting_direction": "from left / from right / overhead / etc",
    "lighting_quality": "soft / hard / diffused / etc",
    "time_of_day": "day / night / golden hour / etc",
    "key_elements": ["element1", "element2"],
    "atmosphere": "exact mood/atmosphere descriptor"
  },
  "preservation_rules": [
    "NEVER change: [specific element that must stay identical]"
  ],
  "ref_count": 3
}

RULES:
- Be EXHAUSTIVE with clothing colors and textures — this prevents hallucination.
- If a reference image is a background plate, set subject.present = false.
- If no subject images found, set subject.present = false.
- preservation_rules: list every element that must NOT change in generation.
- Use concrete, specific language. Avoid vague terms like "natural" or "normal".`;

// ─── System prompt del PASO 3 — Validation ───────────────────────────────────
const VALIDATION_SYSTEM = `You are a strict quality validator for AI-generated cinematic frames.
You receive:
  1) Reference images (source of truth — subject and background)
  2) The generated frame to validate

Your job: compare generated frame against references and score fidelity.

RESPOND ONLY WITH VALID JSON. No markdown, no backticks.

JSON Schema:
{
  "score": 0.85,
  "passed": true,
  "subject_fidelity": 0.9,
  "background_fidelity": 0.8,
  "checks": [
    { "type": "SUBJECT_CLOTHING", "passed": true, "detail": "clothing matches reference" },
    { "type": "SUBJECT_FACE", "passed": true, "detail": "face consistent with reference" },
    { "type": "BACKGROUND_PRESERVED", "passed": true, "detail": "background matches reference plate" },
    { "type": "LIGHTING_CONSISTENT", "passed": true, "detail": "lighting direction matches" },
    { "type": "NO_HALLUCINATION", "passed": false, "detail": "extra person appeared in background" }
  ],
  "hallucinations": [
    "description of each invented element not present in references"
  ],
  "recommendation": "accept | retry | accept_with_warnings"
}

SCORE GUIDE:
- 0.9 - 1.0: Excellent — accept
- 0.75 - 0.89: Good — accept_with_warnings
- 0.5 - 0.74: Poor — retry
- Below 0.5: Failed — retry

RULES:
- Check subject clothing color EXACTLY — wrong color = hallucination.
- Check background elements — extra objects = hallucination.
- A missing subject in a background-only shot is NOT a hallucination.
- Be strict but fair. Minor lighting variation is acceptable.`;

// ─────────────────────────────────────────────────────────────────────────────
// GROUNDING AGENT
// ─────────────────────────────────────────────────────────────────────────────

export class GroundingAgent {
  constructor(options = {}) {
    this.retryThreshold = options.retryThreshold ?? 0.65; // score mínimo para aceptar
    this.onStep         = options.onStep         || null; // callback de progreso opcional
    // onStep({ step: 'grounding'|'generating'|'validating'|'retrying', attempt })
  }

  // ─── API PRINCIPAL ────────────────────────────────────────────────────────

  /**
   * @param {Object}   params
   * @param {string[]} params.refs        — URLs de imágenes de referencia (sujeto + escena)
   * @param {string}   params.prompt      — Prompt cinematográfico base (de buildStartFramePrompt etc.)
   * @param {string}   params.aspectRatio — '16:9' | '9:16'
   * @param {number}   params.maxRetries  — máximo reintentos (default 2)
   * @returns {Promise<GroundingResult>}
   */
  async generate({ refs = [], subjectRefs = [], sceneRefs = [], prompt, aspectRatio = '16:9', maxRetries = 2, cinematicParams = null, manualGrounding = null }) {
    // manualGrounding — objeto con descripción textual directa de la ficha técnica:
    // {
    //   subjectDescription: string  — ropa, pelo, físico, accesorios exactos
    //   sceneDescription:   string  — locación, iluminación, elementos clave del set
    // }
    // Cuando se pasa, OMITE el análisis automático de imágenes (Paso 1).
    // Las imágenes siguen usándose en Paso 2 (generación) y Paso 3 (validación)
    // pero SOLO para identidad visual, no para inferir descripción.
    if (!prompt)  throw new Error('GroundingAgent: prompt requerido');

    // Normalizar refs
    const allRefs = (subjectRefs.length || sceneRefs.length)
      ? [...subjectRefs, ...sceneRefs].filter(Boolean)
      : refs.filter(Boolean);

    // ── Convertir URLs a inline data ──
    const inlineSubjectRefs = await this._loadRefs(subjectRefs.length ? subjectRefs : refs);
    const inlineSceneRefs   = await this._loadRefs(sceneRefs);
    const inlineAllRefs     = await this._loadRefs(allRefs);

    // ── PASO 1: Grounding ─────────────────────────────────────────────────
    // MODO MANUAL: construir ground truth desde la ficha técnica — más preciso
    // MODO AUTO:   analizar imágenes de referencia — fallback cuando no hay ficha
    let groundTruth;
    let groundingMode;

    if (manualGrounding?.subjectDescription || manualGrounding?.sceneDescription) {
      groundingMode = 'manual';
      this._emit({ step: 'grounding_manual', attempt: 1 });
      groundTruth = this._buildManualGroundTruth(manualGrounding);
    } else {
      groundingMode = 'auto';
      this._emit({ step: 'grounding', attempt: 1 });
      groundTruth = await this._groundReferences(inlineAllRefs);
    }

    // ── PASO 2 + 3: Generar → Validar → Reintentar ──────────────────────
    let lastResult = null;
    let attempts   = 0;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      attempts = attempt;

      // Construir prompt anclado: CAMERA DIRECTIVE + Ground Truth + prompt base
      const anchoredPrompt = this._buildAnchoredPrompt(prompt, groundTruth, cinematicParams);

      this._emit({ step: attempt === 1 ? 'generating' : 'retrying', attempt });
      const imageBase64 = await this._generateImage(anchoredPrompt, inlineSubjectRefs, inlineSceneRefs, aspectRatio);

      this._emit({ step: 'validating', attempt });
      const validation = await this._validateFrame(inlineAllRefs, imageBase64);

      lastResult = {
        imageBase64,
        groundTruth,
        groundingMode,
        validationScore: validation.score,
        validationPassed: validation.passed,
        hallucinations: validation.hallucinations || [],
        warnings: this._extractWarnings(validation),
        recommendation: validation.recommendation,
        attempts,
      };

      // Aceptar si supera el umbral o si ya agotamos reintentos
      if (validation.score >= this.retryThreshold || attempt > maxRetries) {
        break;
      }

      console.warn(
        `[GroundingAgent] Intento ${attempt} score=${validation.score} < ${this.retryThreshold}. Reintentando...`,
        validation.hallucinations
      );
    }

    return lastResult;
  }

  // ─── MODO MANUAL: construir ground truth desde ficha técnica ───────────────

  _buildManualGroundTruth(manualGrounding) {
    // Convierte la descripción textual de la ficha técnica en el mismo
    // formato JSON que produce _groundReferences, pero sin llamada a Gemini.
    // Resultado: más preciso, más rápido, sin costo de tokens de análisis.

    const subjectText = (manualGrounding.subjectDescription || '').trim();
    const sceneText   = (manualGrounding.sceneDescription   || '').trim();

    // Extraer elementos clave del sujeto del texto libre
    const splitText = (txt) => txt.split(',').flatMap(s => s.split(';')).flatMap(s => s.split('\n')).map(s => s.trim()).filter(Boolean);
    const subjectLines = subjectText ? splitText(subjectText) : [];
    const sceneLines   = sceneText   ? splitText(sceneText)   : [];

    // Detectar colores y prendas en el texto del sujeto para preservation_rules
    const preservationRules = [];
    if (subjectText) {
      preservationRules.push(`NEVER change subject clothing: ${subjectText}`);
    }
    if (sceneText) {
      preservationRules.push(`NEVER change background setting: ${sceneText}`);
    }

    return {
      subject: {
        present:              !!subjectText,
        description:          subjectText || 'see reference images',
        clothing:             subjectText || 'see reference images',
        hair:                 this._extractDetail(subjectText, ['pelo', 'hair', 'cabello', 'liso', 'rizado', 'corto', 'largo']),
        skin_tone:            this._extractDetail(subjectText, ['piel', 'skin', 'tez', 'morena', 'clara', 'canela']),
        body_type:            'see reference images',
        distinctive_features: subjectLines.slice(0, 5),
        raw_text:             subjectText,   // guardamos el texto original completo
      },
      background: {
        present:           !!sceneText,
        setting:           sceneText || 'see reference images',
        dominant_colors:   [],
        lighting_direction: this._extractDetail(sceneText, ['luz', 'light', 'left', 'right', 'lateral', 'frontal', 'back', 'izq', 'der']),
        lighting_quality:  this._extractDetail(sceneText, ['suave', 'soft', 'dura', 'hard', 'difusa', 'diffused', 'cálida', 'warm']),
        time_of_day:       this._extractDetail(sceneText, ['día', 'day', 'noche', 'night', 'tarde', 'mañana', 'morning', 'golden']),
        key_elements:      sceneLines.slice(0, 8),
        atmosphere:        sceneText || 'see reference images',
        raw_text:          sceneText,
      },
      preservation_rules: preservationRules,
      ref_count:          0,
      source:             'manual',
    };
  }

  // Helper: buscar palabras clave en texto libre
  _extractDetail(text, keywords) {
    if (!text) return 'see reference images';
    const lower = text.toLowerCase();
    for (const kw of keywords) {
      const idx = lower.indexOf(kw.toLowerCase());
      if (idx !== -1) {
        // Devolver la frase completa alrededor de la keyword
        const start = Math.max(0, idx - 10);
        const end   = Math.min(text.length, idx + 40);
        return text.slice(start, end).trim();
      }
    }
    return 'see reference images';
  }

  // ─── PASO 1: GROUNDING ───────────────────────────────────────────────────

  async _groundReferences(inlineRefs) {
    if (inlineRefs.length === 0) {
      // Sin referencias — devolver ground truth vacío
      return { subject: { present: false }, background: { present: false }, preservation_rules: [], ref_count: 0 };
    }

    const parts = [
      // Imágenes primero (orden recomendado por Google)
      ...inlineRefs.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
      {
        text: `Analyze these ${inlineRefs.length} reference image(s) and produce the Ground Truth JSON inventory.
These images are the SACRED REFERENCES for a cinematic frame generation system.
Your analysis will be used as a strict anti-hallucination contract.
Be exhaustive — especially on clothing colors and background elements.`,
      },
    ];

    const body = {
      model: GEMINI_TEXT_MODEL,
      contents: [{ role: 'user', parts }],
      systemInstruction: { parts: [{ text: GROUNDING_SYSTEM }] },
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json',
      },
    };

    try {
      const res = await fetch(geminiTextEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Grounding falló: ${err?.error?.message || res.status}`);
      }

      const data  = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      let text = '';
      for (const p of parts) { if (p.text) text = p.text; }

      return this._parseJSON(text, { subject: { present: false }, background: { present: false }, preservation_rules: [], ref_count: inlineRefs.length });
    } catch (e) {
      console.warn('[GroundingAgent] Grounding falló — continuando sin ground truth:', e.message);
      return { subject: { present: false }, background: { present: false }, preservation_rules: [], ref_count: inlineRefs.length };
    }
  }

  // ─── PASO 2: GENERACIÓN CON PROMPT ANCLADO ───────────────────────────────

  _buildAnchoredPrompt(basePrompt, groundTruth, cinematicParams = null) {
    const lines = [];

    // ════════════════════════════════════════════════════════════
    // BLOQUE 1 — CAMERA DIRECTIVE (máxima prioridad)
    // El plano/ángulo/lente del frame DESTINO va PRIMERO.
    // Gemini lo procesa antes que cualquier imagen de referencia.
    // ════════════════════════════════════════════════════════════
    if (cinematicParams) {
      lines.push('╔══ CAMERA DIRECTIVE — ABSOLUTE — HIGHEST PRIORITY ══╗');
      lines.push('║ These override EVERYTHING including reference images  ║');
      lines.push('╚════════════════════════════════════════════════════════╝');
      lines.push('');
      lines.push(`TARGET SHOT TYPE: ${cinematicParams.shotSize || ''} — ${cinematicParams.shotSizeDesc || ''}`);
      if (cinematicParams.shotSizeBody) {
        lines.push(`FRAMING RULE: The image MUST show exactly — ${cinematicParams.shotSizeBody}`);
      }
      lines.push(`TARGET HORIZONTAL ANGLE: ${cinematicParams.angleH || ''} — ${cinematicParams.angleHDesc || ''}`);
      lines.push(`TARGET VERTICAL ANGLE:   ${cinematicParams.angleV || ''} — ${cinematicParams.angleVDesc || ''}`);
      if (cinematicParams.lensDesc)  lines.push(`LENS:  ${cinematicParams.lensDesc}`);
      if (cinematicParams.blurDesc)  lines.push(`DEPTH OF FIELD: ${cinematicParams.blurDesc}`);
      lines.push('');
      lines.push('⚠ DO NOT copy the framing from the reference images.');
      lines.push('⚠ The reference images show a DIFFERENT shot — use them ONLY for subject appearance and background.');
      lines.push('');
    }

    // ════════════════════════════════════════════════════════════
    // BLOQUE 2 — GROUND TRUTH (sujeto y fondo — de las referencias)
    // ════════════════════════════════════════════════════════════
    lines.push('═══ GROUND TRUTH CONTRACT — SACRED — DO NOT DEVIATE ═══');

    // MODO MANUAL: usar texto raw de la ficha técnica — más preciso que inferencia
    // MODO AUTO:   usar campos estructurados del análisis de imágenes
    const isManual = groundTruth.source === 'manual';

    if (groundTruth.subject?.present) {
      if (isManual && groundTruth.subject.raw_text) {
        lines.push('SUBJECT APPEARANCE (EXACT — FROM TECHNICAL BRIEF):');
        lines.push(groundTruth.subject.raw_text);
        lines.push('→ Reproduce this subject EXACTLY. Do not change any clothing color, hair, or accessory.');
      } else if (groundTruth.subject?.clothing) {
        lines.push('SUBJECT APPEARANCE (EXACT — FROM REFERENCE IMAGES):');
        lines.push(`  • Description: ${groundTruth.subject.description || 'see reference'}`);
        lines.push(`  • Clothing: ${groundTruth.subject.clothing}`);
        lines.push(`  • Hair: ${groundTruth.subject.hair || 'see reference'}`);
        lines.push(`  • Skin tone: ${groundTruth.subject.skin_tone || 'see reference'}`);
        if (groundTruth.subject.distinctive_features?.length) {
          lines.push(`  • Distinctive features: ${groundTruth.subject.distinctive_features.join(', ')}`);
        }
      }
    }

    if (groundTruth.background?.present) {
      if (isManual && groundTruth.background.raw_text) {
        lines.push('BACKGROUND / SET (EXACT — FROM TECHNICAL BRIEF):');
        lines.push(groundTruth.background.raw_text);
        lines.push('→ Reproduce this background EXACTLY. Do not invent locations, furniture, or props not described here.');
      } else {
        lines.push('BACKGROUND (EXACT — FROM REFERENCE IMAGES):');
        lines.push(`  • Setting: ${groundTruth.background.setting || 'see reference'}`);
        lines.push(`  • Lighting: ${groundTruth.background.lighting_direction}, ${groundTruth.background.lighting_quality || ''}`);
        lines.push(`  • Key elements: ${(groundTruth.background.key_elements || []).join(', ') || 'see reference'}`);
        lines.push(`  • Atmosphere: ${groundTruth.background.atmosphere || 'see reference'}`);
      }
    }

    // Filtrar preservation_rules que hablen de framing — esas las manda CAMERA DIRECTIVE
    const framingTerms = ['framing', 'shot size', 'shot type', 'composition', 'frame', 'angle', 'zoom'];
    const safeRules = (groundTruth.preservation_rules || []).filter(rule => {
      const lower = rule.toLowerCase();
      return !framingTerms.some(t => lower.includes(t));
    });
    if (safeRules.length) {
      lines.push('PRESERVATION RULES (ABSOLUTE — NEVER BREAK):');
      for (const rule of safeRules) {
        lines.push(`  • ${rule}`);
      }
    }

    lines.push('═══ END GROUND TRUTH ═══');
    lines.push('');

    // ════════════════════════════════════════════════════════════
    // BLOQUE 3 — Prompt cinematográfico base
    // ════════════════════════════════════════════════════════════
    lines.push(basePrompt);

    // ── Refuerzo final ──
    lines.push('');
    lines.push('FINAL MANDATE:');
    if (cinematicParams) {
      lines.push(`  1. FRAMING = "${cinematicParams.shotSizeDesc || cinematicParams.shotSize}" — NON-NEGOTIABLE.`);
      lines.push(`  2. ANGLE   = "${cinematicParams.angleHDesc  || cinematicParams.angleH}"  — NON-NEGOTIABLE.`);
      lines.push('  3. Subject clothing and background from reference images — do not invent.');
    } else {
      lines.push('  1. Do not invent clothing, hair, or background elements not in references.');
      lines.push('  2. Reproduce references faithfully within the requested framing.');
    }

    return lines.join('\n');
  }

  async _generateImage(anchoredPrompt, inlineSubjectRefs, inlineSceneRefs, aspectRatio) {
    // ORDEN CRÍTICO para Gemini IMAGE:
    // 1. Texto primero — el modelo lee las instrucciones ANTES de ver las imágenes
    // 2. Escena — fondo sagrado (el modelo sabe que es el background)
    // 3. Sujeto — referencias de apariencia (el modelo sabe que es solo para identity)
    // Esto evita que Gemini copie el plano/composición de las imágenes de referencia.
    const parts = [
      { text: anchoredPrompt },
      ...(inlineSceneRefs.length ? [
        { text: 'BACKGROUND REFERENCE IMAGES (use ONLY for setting/environment — do NOT copy composition or framing):' },
        ...inlineSceneRefs.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
      ] : []),
      ...(inlineSubjectRefs.length ? [
        { text: 'SUBJECT IDENTITY REFERENCE IMAGES (use ONLY for appearance — clothing, face, hair — do NOT copy framing):' },
        ...inlineSubjectRefs.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
      ] : []),
    ];

    const body = {
      model: GEMINI_IMAGE_MODEL,
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: { aspectRatio },
      },
    };

    const res = await fetch(geminiImageEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Generación falló: ${err?.error?.message || res.status}`);
    }

    const data     = await res.json();
    const resParts = data.candidates?.[0]?.content?.parts || [];
    const imgPart  = resParts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imgPart)  throw new Error('Gemini no devolvió imagen');

    return `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
  }

  // ─── PASO 3: VALIDACIÓN ───────────────────────────────────────────────────

  async _validateFrame(inlineAllRefs, generatedBase64) {
    // Convertir el frame generado a inline data
    const generatedInline = await urlToInlineData(generatedBase64);
    if (!generatedInline) {
      // No se pudo leer el frame generado — aceptar sin validar
      return { score: 0.75, passed: true, hallucinations: [], recommendation: 'accept_with_warnings' };
    }

    const parts = [
      { text: `Validate the GENERATED FRAME (last image) against the REFERENCE IMAGES (first ${inlineAllRefs.length} images). Produce the validation JSON report.` },
      ...inlineAllRefs.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
      { text: 'GENERATED FRAME TO VALIDATE:' },
      { inlineData: { mimeType: generatedInline.mimeType, data: generatedInline.data } },
    ];

    const body = {
      model: GEMINI_TEXT_MODEL,
      contents: [{ role: 'user', parts }],
      systemInstruction: { parts: [{ text: VALIDATION_SYSTEM }] },
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    };

    try {
      const res = await fetch(geminiTextEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Validación falló: ${err?.error?.message || res.status}`);
      }

      const data  = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      let text = '';
      for (const p of parts) { if (p.text) text = p.text; }

      const parsed = this._parseJSON(text, {
        score: 0.75, passed: true, hallucinations: [], recommendation: 'accept_with_warnings',
      });

      // Normalizar score a 0-1 si viene como 0-100
      if (parsed.score > 1) parsed.score = parsed.score / 100;

      parsed.passed = parsed.score >= this.retryThreshold;
      return parsed;
    } catch (e) {
      console.warn('[GroundingAgent] Validación falló — aceptando sin validar:', e.message);
      return { score: 0.75, passed: true, hallucinations: [], recommendation: 'accept_with_warnings' };
    }
  }

  // ─── UTILIDADES ───────────────────────────────────────────────────────────

  async _loadRefs(refs) {
    const results = await Promise.all(
      refs.filter(Boolean).map(url => urlToInlineData(url))
    );
    return results.filter(Boolean);
  }

  _parseJSON(text, fallback) {
    try {
      const clean = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const start = clean.indexOf('{');
      const end   = clean.lastIndexOf('}');
      if (start === -1 || end === -1) return fallback;
      return JSON.parse(clean.slice(start, end + 1));
    } catch {
      return fallback;
    }
  }

  _extractWarnings(validation) {
    const warnings = [];
    if (validation.hallucinations?.length) {
      for (const h of validation.hallucinations) {
        warnings.push(`HALLUCINATION: ${h}`);
      }
    }
    if (validation.checks) {
      for (const check of validation.checks) {
        if (!check.passed) {
          warnings.push(`VALIDATION_FAIL [${check.type}]: ${check.detail}`);
        }
      }
    }
    return warnings;
  }

  _emit(event) {
    if (this.onStep) {
      try { this.onStep(event); } catch {}
    }
  }
}

// ─── FACTORY — instancia rápida con callbacks de progreso ─────────────────────

/**
 * Crea un GroundingAgent preconfigurado para el AssetManager.
 * @param {Function} onStep — callback opcional para mostrar progreso en UI
 * @returns {GroundingAgent}
 */
export function createGroundingAgent(onStep) {
  return new GroundingAgent({
    retryThreshold: 0.65,
    onStep,
  });
}

export default GroundingAgent;