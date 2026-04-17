// src/lib/dag/nodes/ImageRenderNode.js
// Genera una imagen preview del frame usando Gemini Imagen 3
// ANTES de gastar en video. Permite al usuario validar visualmente
// que el prompt produce lo esperado.
//
// Ahorro estimado: ~$17.94/sesión (evita renders de video fallidos)
//
// Uso en el DAG:
//   PromptBuilder START → ImageRenderNode → (usuario valida) → VideoRenderNode
//
// Uso directo:
//   const node = new ImageRenderNode({ prompt: '...', aspectRatio: '16:9' });
//   const result = await node.renderPreview(prompt);
//   // result.imageUrl → URL de la imagen generada

import { CinematicNode, NODE_TYPES } from '../CinematicNode';

// ─── Gemini Imagen 3 ─────────────────────────────────────────
async function generateImageWithGemini(prompt, aspectRatio = '16:9') {
  return generateImageFallback(prompt, aspectRatio);
}

// Usar Gemini 2.5 Flash Image
async function generateImageFallback(prompt, aspectRatio) {
  const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:4000';
  const endpoint = `${serverUrl}/api/llm`;

  const body = {
    action: 'gemini-proxy',
    model: 'gemini-2.5-flash-image',
    contents: [{ parts: [{ text: `Generate a single cinematic frame: ${prompt}` }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: aspectRatio || '16:9' },
    },
  };

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini image generation failed: ${err?.error?.message || res.status}`);
  }

  const data = await res.json();

  // Buscar la parte con imagen en la respuesta
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

  if (!imagePart) {
    throw new Error('Gemini did not return an image in the response');
  }

  return {
    imageUrl:  `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
    isBase64:  true,
    mimeType:  imagePart.inlineData.mimeType,
    rawBytes:  imagePart.inlineData.data,
  };
}

// ─── Cost estimate ───────────────────────────────────────────
// Gemini Imagen 3: ~$0.03/imagen vs Veo 3.1: ~$0.35/segundo * 5s = $1.75
export const IMAGE_PREVIEW_COST = 0.03;

// ─── NODE CLASS ──────────────────────────────────────────────
export class ImageRenderNode extends CinematicNode {
  constructor(config = {}) {
    super({
      type:   NODE_TYPES.RENDER_IMAGE,
      name:   config.name || 'Image Preview',
      ...config,
    });

    this.aspectRatio = config.parameters?.aspectRatio || '16:9';
  }

  async process(context = {}) {
    // Obtener prompt del PromptBuilder (input del DAG)
    const promptFromInputs = this.inputs
      .map(n => n.result?.promptOptimized || n.result?.prompt)
      .find(Boolean);

    const prompt = context.prompt || promptFromInputs;
    if (!prompt) throw new Error('ImageRenderNode: no prompt available');

    return this.renderPreview(prompt);
  }

  /**
   * API pública directa — genera preview sin pasar por el DAG
   */
  async renderPreview(prompt) {
    const result = await generateImageWithGemini(prompt, this.aspectRatio);

    this.costUsd    = IMAGE_PREVIEW_COST;
    this.tokensUsed = 0; // Imagen no usa tokens de texto

    return {
      imageUrl:    result.imageUrl,
      isBase64:    result.isBase64,
      mimeType:    result.mimeType,
      rawBytes:    result.rawBytes,
      prompt,
      aspectRatio: this.aspectRatio,
      cost:        IMAGE_PREVIEW_COST,
    };
  }
}

export default ImageRenderNode;