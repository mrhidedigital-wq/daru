// src/lib/dag/nodes/VideoValidationNode.js
// Verifica que el video generado respete los fotogramas de entrada y salida.
// Extrae el primer y último frame del video base64 y los compara con los frames subidos.
// Produce un score de fidelidad 0-1 y advertencias si hay discrepancias.

import { CinematicNode } from '../CinematicNode';

// ─── Extraer frame de video como imagen ──────────────────────
// Usa un <video> + <canvas> para capturar un frame específico
function extractFrameFromVideo(videoUrl, timeSeconds = 0) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(timeSeconds, video.duration - 0.1);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({
          dataUrl,
          width: video.videoWidth,
          height: video.videoHeight,
          time: video.currentTime,
          duration: video.duration,
        });
      } catch (err) {
        reject(new Error(`Cannot extract frame: ${err.message}`));
      }
    };

    video.onerror = () => reject(new Error('Failed to load video for validation'));

    // Timeout de 30 segundos
    setTimeout(() => reject(new Error('Video frame extraction timeout')), 30000);

    video.src = videoUrl;
  });
}

// ─── Comparar dos imágenes con Gemini Vision ─────────────────
async function compareFramesWithAI(originalUrl, extractedDataUrl, label, llmProvider) {
  const prompt = `You are a professional cinematographer QA agent. Compare these two images and evaluate visual fidelity.

IMAGE 1 is the ORIGINAL reference frame (${label}) that the director provided.
IMAGE 2 is the EXTRACTED frame from the AI-generated video.

Evaluate on these criteria (score each 0.0 to 1.0):
1. COMPOSITION: Same framing, camera angle, subject position
2. SUBJECT: Same person/character appearance, clothing, features
3. COLORS: Same color palette, lighting, mood
4. BACKGROUND: Same environment, props, setting
5. DETAILS: Same small details, textures, objects

Respond ONLY in this JSON format, nothing else:
{
  "composition": 0.0,
  "subject": 0.0,
  "colors": 0.0,
  "background": 0.0,
  "details": 0.0,
  "overall": 0.0,
  "issues": ["list of specific differences found"],
  "verdict": "exact_match | close_match | significant_differences | completely_different"
}`;

  try {
    // Convertir original a base64 si es URL
    let originalBase64;
    if (originalUrl.startsWith('data:')) {
      originalBase64 = originalUrl;
    } else {
      const res = await fetch(originalUrl);
      const blob = await res.blob();
      originalBase64 = await new Promise(resolve => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }

    // Llamar a Gemini con las dos imágenes
    const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:4000';
    const endpoint = `${serverUrl}/api/llm`;
    const body = {
      action: 'gemini-proxy',
      model: 'gemini-2.5-flash',
      contents: [{
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: originalBase64.split(';')[0].split(':')[1] || 'image/jpeg',
              data: originalBase64.split(',')[1],
            },
          },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: extractedDataUrl.split(',')[1],
            },
          },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Gemini validation failed: ${err?.error?.message || res.status}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Gemini did not return valid JSON');

    return JSON.parse(jsonMatch[0]);

  } catch (err) {
    console.warn(`[VideoValidation] AI comparison failed for ${label}:`, err.message);
    return {
      composition: 0.5, subject: 0.5, colors: 0.5, background: 0.5, details: 0.5,
      overall: 0.5,
      issues: [`Could not validate: ${err.message}`],
      verdict: 'validation_error',
    };
  }
}

// ─── NODE CLASS ──────────────────────────────────────────────
export class VideoValidationNode extends CinematicNode {
  constructor(config = {}) {
    super({
      type: 'VIDEO_VALIDATION',
      name: config.name || 'Video Validation',
      ...config,
    });

    const p = config.parameters || {};
    this.videoUrl   = config.videoUrl   || p.videoUrl   || null;
    this.startUrl   = config.startUrl   || p.startUrl   || null;
    this.endUrl     = config.endUrl     || p.endUrl     || null;
    this.frameMode  = config.frameMode  || p.frameMode  || 'exact';
  }

  canExecute() {
    return true;
  }

  async process(context = {}) {
    // Obtener video URL del VideoRenderNode si estamos en el DAG
    const videoFromInput = this.inputs
      .map(n => n.result?.videoUrl)
      .find(Boolean);

    const videoUrl  = this.videoUrl || videoFromInput;
    const startUrl  = this.startUrl || context.startUrl;
    const endUrl    = this.endUrl   || context.endUrl;
    const frameMode = this.frameMode || context.frameMode || 'exact';

    if (!videoUrl) {
      return { score: 0, verdict: 'no_video', warnings: ['No video URL to validate'] };
    }

    const results = { startFrame: null, endFrame: null, warnings: [] };

    // ── Extraer primer frame del video ──────────────────────
    let firstFrame, lastFrame;
    try {
      firstFrame = await extractFrameFromVideo(videoUrl, 0.1);
    } catch (err) {
      results.warnings.push(`Could not extract first frame: ${err.message}`);
    }

    // ── Extraer último frame del video ──────────────────────
    try {
      // Primero extraer para saber la duración, luego el último frame
      const probe = await extractFrameFromVideo(videoUrl, 0.1);
      lastFrame = await extractFrameFromVideo(videoUrl, probe.duration - 0.3);
    } catch (err) {
      results.warnings.push(`Could not extract last frame: ${err.message}`);
    }

    // ── Comparar primer frame vs Frame START ────────────────
    if (startUrl && firstFrame) {
      results.startFrame = await compareFramesWithAI(
        startUrl, firstFrame.dataUrl, 'FIRST FRAME / START', this.llmProvider
      );
    }

    // ── Comparar último frame vs Frame END ──────────────────
    if (endUrl && lastFrame) {
      results.endFrame = await compareFramesWithAI(
        endUrl, lastFrame.dataUrl, 'LAST FRAME / END', this.llmProvider
      );
    }

    // ── Calcular score total ────────────────────────────────
    const scores = [
      results.startFrame?.overall,
      results.endFrame?.overall,
    ].filter(s => s != null);

    const avgScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

    // ── Generar advertencias según modo ─────────────────────
    const threshold = frameMode === 'exact' ? 0.7 : 0.4;

    if (results.startFrame && results.startFrame.overall < threshold) {
      results.warnings.push(
        `⚠ Frame START fidelity LOW (${(results.startFrame.overall * 100).toFixed(0)}%). ` +
        `Issues: ${results.startFrame.issues?.join(', ') || 'unknown'}`
      );
    }

    if (results.endFrame && results.endFrame.overall < threshold) {
      results.warnings.push(
        `⚠ Frame END fidelity LOW (${(results.endFrame.overall * 100).toFixed(0)}%). ` +
        `Issues: ${results.endFrame.issues?.join(', ') || 'unknown'}`
      );
    }

    const verdict = avgScore >= 0.8 ? 'pass'
                  : avgScore >= 0.5 ? 'acceptable'
                  : 'fail';

    // Tokens usados por la validación (2 llamadas a Gemini Vision)
    this.tokensUsed = 2000; // estimación
    this.costUsd = 0.002;   // ~$0.001 por llamada vision

    return {
      score: parseFloat(avgScore.toFixed(3)),
      verdict,
      frameMode,
      threshold,
      startFrame: results.startFrame,
      endFrame:   results.endFrame,
      warnings:   results.warnings,
      extractedFrames: {
        first: firstFrame?.dataUrl || null,
        last:  lastFrame?.dataUrl  || null,
      },
    };
  }
}

// ─── Standalone validation (para uso fuera del DAG) ──────────
export async function validateVideoFrames({ videoUrl, startUrl, endUrl, frameMode = 'exact' }) {
  const node = new VideoValidationNode({
    parameters: { videoUrl, startUrl, endUrl, frameMode },
  });
  return node.process({});
}

export default VideoValidationNode;