// src/lib/editor/dag/nodes/ExecutionNode.js
// Nodo 6 del DAG de edición.
// Ejecuta la edición llamando a la API correspondiente:
//   - Gemini 2.5 Flash Image para edición de imágenes
//   - Imagen 3 (Vertex AI) para inpainting con máscara
//   - Kling O1 Edit para edición de video-to-video
//
// Recibe el paquete completo del PromptComposer y ejecuta.

import { EditorNode, EDITOR_NODE_TYPES } from '../EditorNode';

// ============================================================
// COSTOS ESTIMADOS
// ============================================================

export const EDIT_COSTS = {
  gemini_edit:     0.039,    // $0.039/imagen
  imagen_inpaint:  0.04,     // ~$0.04/imagen
  kling_edit:      0.168,    // $0.168/segundo de video
};

// ============================================================
// NODO
// ============================================================

export class ExecutionNode extends EditorNode {
  constructor(config = {}) {
    super({
      ...config,
      type: EDITOR_NODE_TYPES.EXECUTION,
      name: config.name || 'Edit Execution',
    });
  }

  async process(context = {}) {
    const { mediaUrl, elements } = context;

    // Obtener el paquete del PromptComposer
    const composerResult = this.getInputResult(EDITOR_NODE_TYPES.PROMPT_COMPOSER);
    if (!composerResult?.prompt) {
      throw new Error('ExecutionNode: no composed prompt available');
    }

    const { prompt, provider, mask, editMode } = composerResult;

    // Ejecutar según provider
    switch (provider) {
      case 'gemini_edit':
        return this._executeGeminiEdit(prompt, mediaUrl, elements, mask, editMode);

      case 'imagen_inpaint':
        return this._executeImagenInpaint(prompt, mediaUrl, mask);

      case 'kling_edit':
        return this._executeKlingEdit(prompt, mediaUrl, elements);

      default:
        throw new Error(`ExecutionNode: unknown provider "${provider}"`);
    }
  }

  // ============================================================
  // GEMINI 2.5 FLASH IMAGE — Edición conversacional
  // El más versátil: acepta imagen + texto + imágenes de referencia
  // ============================================================

  async _executeGeminiEdit(prompt, mediaUrl, elements = [], mask, editMode = 'faithful') {
    const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:4000';
    const endpoint = `${serverUrl}/api/gemini/proxy/gemini-2.5-flash-image`;

    // Construir partes del mensaje
    const parts = [];

    // 1) Imagen original
    const imageBase64 = await this.imageToBase64(mediaUrl);
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageBase64,
      },
    });

    // 2) Imágenes de referencia (elementos)
    for (let i = 0; i < Math.min(elements.length, 4); i++) {
      const el = elements[i];
      if (el.imageUrl) {
        const elBase64 = await this.imageToBase64(el.imageUrl);
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: elBase64,
          },
        });
        parts.push({
          text: `[This is Element ${i + 1}: ${el.description || el.name || `Reference image ${i + 1}`}]`,
        });
      }
    }

    // 3) Máscara (si existe)
    if (mask?.maskDataUrl && mask.isBase64) {
      const maskBase64 = mask.maskDataUrl.startsWith('data:')
        ? mask.maskDataUrl.split(',')[1]
        : mask.maskDataUrl;
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: maskBase64,
        },
      });
      parts.push({
        text: '[This is the mask. White areas should be edited, black areas preserved.]',
      });
    }

    // 4) Instrucción de edición
    const sacredRules = editMode === 'faithful'
      ? `\nSACRED INPUTS RULES:
- The first image is the ORIGINAL — do NOT modify it except for the requested edit.
- Any reference element image must appear EXACTLY as provided — same colors, design, texture. Only adapt position, perspective, and lighting to fit the scene.
- Think like a professional Photoshop artist: place, blend, adapt — but never reimagine.`
      : `\nCREATIVE MODE: You have freedom to reinterpret the inputs creatively. Use them as inspiration and guides, not strict constraints.`;

    parts.push({
      text: `EDIT INSTRUCTION: ${prompt}${sacredRules}\n\nGenerate the edited version of the first image applying ONLY the requested change.`,
    });

    const body = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        temperature: 0.4,
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Gemini edit failed: ${err?.error?.message || res.status}`);
    }

    const data = await res.json();

    // Buscar imagen en la respuesta
    const responseParts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = responseParts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    const textPart  = responseParts.find(p => p.text);

    if (!imagePart) {
      throw new Error('Gemini did not return an edited image');
    }

    // Métricas
    const tokens = data.usageMetadata;
    this.tokensUsed    = tokens?.totalTokenCount || 0;
    this._tokensInput  = tokens?.promptTokenCount || 0;
    this._tokensOutput = tokens?.candidatesTokenCount || 0;
    this.costUsd       = EDIT_COSTS.gemini_edit;

    return {
      resultUrl:   `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
      isBase64:    true,
      mimeType:    imagePart.inlineData.mimeType,
      rawBytes:    imagePart.inlineData.data,
      provider:    'gemini_edit',
      cost:        EDIT_COSTS.gemini_edit,
      aiResponse:  textPart?.text || null,
      mediaType:   'image',
    };
  }

  // ============================================================
  // IMAGEN 3 (Vertex AI) — Inpainting con máscara
  // Para operaciones precisas de remove/replace con máscara
  // ============================================================

  async _executeImagenInpaint(prompt, mediaUrl, mask) {
    const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:4000';
    // El endpoint de Imagen usa :predict en lugar de :generateContent
    const endpoint = `${serverUrl}/api/gemini/proxy/imagen-3.0-capability-001/predict`;

    const imageBase64 = await this.imageToBase64(mediaUrl);

    const requestBody = {
      instances: [{
        prompt,
        image: { bytesBase64Encoded: imageBase64 },
      }],
      parameters: {
        sampleCount: 1,
        editMode:    mask?.maskMode === 'background' ? 'inpainting-remove' : 'inpainting-insert',
        editConfig: {},
      },
    };

    // Agregar máscara si existe
    if (mask?.maskDataUrl && mask.isBase64) {
      const maskBase64 = mask.maskDataUrl.startsWith('data:')
        ? mask.maskDataUrl.split(',')[1]
        : mask.maskDataUrl;

      requestBody.instances[0].mask = {
        image: { bytesBase64Encoded: maskBase64 },
      };
    } else if (mask?.apiMaskConfig) {
      // Usar configuración de máscara automática de la API
      requestBody.instances[0].mask = {
        maskMode: mask.apiMaskConfig.mask_mode || 'background',
        maskDilation: mask.apiMaskConfig.mask_dilation || 0.02,
      };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      // Fallback a Gemini edit si Imagen 3 falla
      console.warn('Imagen 3 inpaint failed, falling back to Gemini edit');
      return this._executeGeminiEdit(prompt, mediaUrl, [], mask);
    }

    const data = await res.json();
    const prediction = data.predictions?.[0];

    if (!prediction?.bytesBase64Encoded) {
      throw new Error('Imagen 3 returned no image data');
    }

    this.costUsd = EDIT_COSTS.imagen_inpaint;

    return {
      resultUrl:   `data:image/png;base64,${prediction.bytesBase64Encoded}`,
      isBase64:    true,
      mimeType:    'image/png',
      rawBytes:    prediction.bytesBase64Encoded,
      provider:    'imagen_inpaint',
      cost:        EDIT_COSTS.imagen_inpaint,
      mediaType:   'image',
    };
  }

  // ============================================================
  // KLING O1 EDIT — Video-to-video
  // Acepta video + elementos de referencia + instrucción natural
  // ============================================================

  async _executeKlingEdit(prompt, videoUrl, elements = []) {
    const apiKey = process.env.REACT_APP_KLING_API_KEY;
    if (!apiKey) throw new Error('Missing REACT_APP_KLING_API_KEY');

    // Kling O1 Edit API
    const endpoint = 'https://api.klingai.com/v1/videos/video-to-video';

    // Construir elementos para Kling (@Element1, @Element2...)
    const klingElements = [];
    for (let i = 0; i < Math.min(elements.length, 4); i++) {
      const el = elements[i];
      if (el.imageUrl) {
        klingElements.push({
          frontal_image_url: el.imageUrl,
          reference_image_urls: el.referenceUrls || [],
        });
      }
    }

    const requestBody = {
      model:     'kling-video/o1/edit',
      video_url: videoUrl,
      prompt,
      elements:  klingElements.length > 0 ? klingElements : undefined,
      keep_audio: true,
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Kling O1 Edit failed: ${err?.message || res.status}`);
    }

    const data = await res.json();
    const jobId = data.data?.task_id || data.task_id;

    if (!jobId) {
      throw new Error('Kling O1 Edit did not return a task ID');
    }

    // Polling hasta que el video esté listo
    const result = await this._pollKlingResult(jobId, apiKey);

    // Estimar costo basado en duración
    const durationSeconds = result.duration || 5;
    this.costUsd = EDIT_COSTS.kling_edit * durationSeconds;

    return {
      resultUrl:   result.videoUrl,
      isBase64:    false,
      mimeType:    'video/mp4',
      provider:    'kling_edit',
      cost:        this.costUsd,
      jobId,
      duration:    durationSeconds,
      mediaType:   'video',
    };
  }

  // ============================================================
  // POLLING KLING
  // ============================================================

  async _pollKlingResult(jobId, apiKey, maxAttempts = 120, intervalMs = 5000) {
    const statusEndpoint = `https://api.klingai.com/v1/videos/video-to-video/${jobId}`;

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));

      const res = await fetch(statusEndpoint, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (!res.ok) continue;

      const data = await res.json();
      const status = data.data?.status || data.status;

      if (status === 'completed' || status === 'succeed') {
        const videoUrl = data.data?.video_url || data.data?.output?.video_url;
        if (!videoUrl) throw new Error('Kling completed but no video URL returned');
        return {
          videoUrl,
          duration: data.data?.duration || 5,
        };
      }

      if (status === 'failed' || status === 'error') {
        throw new Error(`Kling O1 Edit failed: ${data.data?.error_message || 'unknown error'}`);
      }

      // Reportar progreso
      if (this.onProgress) {
        this.onProgress({
          status: 'processing',
          attempt: i + 1,
          maxAttempts,
          estimatedTimeRemaining: (maxAttempts - i) * intervalMs / 1000,
        });
      }
    }

    throw new Error(`Kling O1 Edit timed out after ${maxAttempts * intervalMs / 1000}s`);
  }
}

export default ExecutionNode;