// src/lib/editor/dag/nodes/AnalysisNode.js
// Nodo 1 del DAG de edición.
// Analiza la imagen o video original y genera un inventario detallado
// de la escena: objetos, colores, posiciones, iluminación, marcas, texto.
// Este inventario es la "verdad base" contra la cual se valida todo.

import { EditorNode, EDITOR_NODE_TYPES } from '../EditorNode';

// ============================================================
// SYSTEM PROMPT PARA ANÁLISIS
// ============================================================

const ANALYSIS_SYSTEM = `You are a visual scene analyst for a professional media editing system.
Your job is to produce a precise, structured inventory of everything visible in the image/video.

RESPOND ONLY IN JSON. No markdown, no backticks, no preamble.

JSON Schema:
{
  "objects": [
    {
      "id": "obj_1",
      "label": "red Coca-Cola bottle",
      "category": "product|person|animal|vehicle|furniture|text|logo|background|other",
      "position": "center|top-left|top-right|bottom-left|bottom-right|left|right|top|bottom",
      "size_percent": 25,
      "colors": ["red", "white"],
      "brand": "Coca-Cola" or null,
      "text_visible": "Coca-Cola" or null,
      "confidence": 0.95
    }
  ],
  "scene": {
    "setting": "indoor studio table",
    "lighting": "warm side lighting from left, soft fill",
    "mood": "commercial, clean, appetizing",
    "background": "dark gradient, slightly blurred",
    "perspective": "eye-level, slightly angled",
    "depth_of_field": "shallow, subject in focus"
  },
  "technical": {
    "resolution_estimate": "high",
    "aspect_ratio": "16:9",
    "color_temperature": "warm",
    "overall_brightness": "medium"
  },
  "editable_regions": [
    {
      "region_id": "reg_1",
      "description": "Main product bottle",
      "object_ids": ["obj_1"],
      "complexity": "medium",
      "swap_feasibility": "high"
    }
  ]
}

RULES:
- Be EXHAUSTIVE. List every visible object, even small ones.
- Be PRECISE with positions and sizes (% of frame).
- DETECT brands, logos, text — these are key for product swaps.
- Estimate editable regions: areas where swaps/changes would be natural.
- confidence: 0.0-1.0, how sure you are about each identification.
- For videos: analyze the first frame as the key reference.`;

// ============================================================
// NODO DE ANÁLISIS
// ============================================================

export class AnalysisNode extends EditorNode {
  constructor(config = {}) {
    super({
      ...config,
      type: EDITOR_NODE_TYPES.ANALYSIS,
      name: config.name || 'Scene Analysis',
    });
  }

  async process(context = {}) {
    const { mediaUrl, mediaType } = context;

    if (!mediaUrl) {
      throw new Error('AnalysisNode: no media URL provided');
    }

    // Para video, analizar el primer frame
    // Para imagen, analizar directamente
    const imageBase64 = await this._getAnalyzableImage(mediaUrl, mediaType);

    // Llamar al LLM con la imagen para análisis visual
    const result = await this._analyzeWithVision(imageBase64, context);

    return result;
  }

  // ============================================================
  // ANÁLISIS VISUAL CON GEMINI
  // ============================================================

  async _analyzeWithVision(imageBase64, context = {}) {
    // Usar Gemini 2.0 Flash para análisis visual (multimodal)
    const endpoint = '/api/gemini/proxy';

    const body = {
      model: 'gemini-2.0-flash',
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageBase64,
            },
          },
          {
            text: 'Analyze this image and produce a complete scene inventory following the JSON schema in your instructions. Be exhaustive.',
          },
        ],
      }],
      systemInstruction: {
        parts: [{ text: ANALYSIS_SYSTEM }],
      },
      generationConfig: {
        temperature: 0.1,  // Baja temperatura para precisión
        maxOutputTokens: 8000,
        responseMimeType: 'application/json',
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Scene analysis failed: ${err?.error?.message || res.status}`);
    }

    const data = await res.json();
    
    // Gemini 2.5 Flash puede devolver múltiples parts (thinking + respuesta)
    // Buscar la parte que contiene JSON válido
    const parts = data.candidates?.[0]?.content?.parts || [];
    let text = '';
    for (const part of parts) {
      if (part.text) text = part.text; // tomar la última part con texto (la respuesta final)
    }

    // Parsear JSON
    let analysis;
    let clean = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    // Si no empieza con {, buscar el primer { en el texto
    const jsonStart = clean.indexOf('{');
    const jsonEnd = clean.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      clean = clean.substring(jsonStart, jsonEnd + 1);
    }
    try {
      analysis = JSON.parse(clean);
    } catch (parseErr) {
      // Intentar reparar JSON truncado: cerrar arrays y objetos abiertos
      try {
        let repaired = clean;
        const openBraces = (repaired.match(/{/g) || []).length;
        const closeBraces = (repaired.match(/}/g) || []).length;
        const openBrackets = (repaired.match(/\[/g) || []).length;
        const closeBrackets = (repaired.match(/\]/g) || []).length;
        repaired = repaired.replace(/,\s*$/, '');
        for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
        for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';
        analysis = JSON.parse(repaired);
        console.warn('[AnalysisNode] Repaired truncated JSON');
      } catch {
        console.warn('[AnalysisNode] Raw response:', clean.substring(0, 500));
        throw new Error(`AnalysisNode: failed to parse scene analysis JSON — ${parseErr.message}`);
      }
    }

    // Calcular métricas
    const tokens = data.usageMetadata;
    this.tokensUsed    = (tokens?.totalTokenCount || 0);
    this._tokensInput  = (tokens?.promptTokenCount || 0);
    this._tokensOutput = (tokens?.candidatesTokenCount || 0);
    this.costUsd       = this.tokensUsed * 0.00000015; // Gemini Flash pricing

    return {
      analysis,
      objectCount:   analysis.objects?.length || 0,
      regionCount:   analysis.editable_regions?.length || 0,
      mediaType:     context.mediaType || 'image',
      analyzedAt:    new Date().toISOString(),
    };
  }

  // ============================================================
  // OBTENER IMAGEN ANALIZABLE
  // ============================================================

  async _getAnalyzableImage(mediaUrl, mediaType) {
    if (mediaType === 'video') {
      // Para video, extraer primer frame
      // En el frontend esto se haría con canvas + video element
      // Aquí asumimos que el contexto pasa un frame ya extraído
      return this.imageToBase64(mediaUrl);
    }

    return this.imageToBase64(mediaUrl);
  }
}

export default AnalysisNode;