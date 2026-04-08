// src/lib/editor/dag/nodes/ValidationNode.js
// Nodo 7 del DAG de edición.
// Valida el resultado de la edición comparándolo con la instrucción original.
// Usa visión AI para verificar que:
//   1) El cambio solicitado se hizo
//   2) Los objetos preservados siguen intactos
//   3) No se agregaron elementos no solicitados
//
// Si detecta problemas, puede recomendar reintentar.

import { EditorNode, EDITOR_NODE_TYPES } from '../EditorNode';

// ============================================================
// SYSTEM PROMPT PARA VALIDACIÓN
// ============================================================

const VALIDATION_SYSTEM = `You are a quality validator for an AI media editing system.
You receive:
1) The ORIGINAL image/video (before edit)
2) The EDITED result (after edit)
3) The edit order (what was supposed to change)
4) The preservation rules (what should NOT have changed)

Your job: compare original vs edited and produce a validation report.

RESPOND ONLY IN JSON. No markdown, no backticks.

JSON Schema:
{
  "overall_score": 0.85,
  "edit_applied": true,
  "edit_quality": "good|acceptable|poor",
  "checks": [
    {
      "type": "EDIT_APPLIED",
      "passed": true,
      "detail": "The Coca-Cola bottle was successfully replaced with the Sprite bottle"
    },
    {
      "type": "OBJECT_PRESERVED", 
      "passed": true,
      "detail": "Background table and lighting unchanged"
    },
    {
      "type": "HALLUCINATION_DETECTED",
      "passed": false,
      "detail": "A new glass appeared that was not in the original scene"
    }
  ],
  "issues": [
    {
      "severity": "error|warning|info",
      "type": "UNWANTED_ADDITION|COLOR_SHIFT|LIGHTING_CHANGE|OBJECT_MISSING|QUALITY_DROP|ARTIFACT",
      "detail": "description of the issue"
    }
  ],
  "recommendation": "accept|retry|accept_with_warnings"
}

VALIDATION RULES:
1. EDIT_APPLIED: The requested change should be clearly visible.
2. OBJECT_PRESERVED: Non-target objects should look identical.
3. LIGHTING_CONSISTENT: Lighting direction/intensity should match.
4. NO_HALLUCINATIONS: No new objects/elements should appear that weren't requested.
5. QUALITY: No blurring, artifacts, or resolution drops.
6. SEAMLESS: The edit should look natural and integrated.

Score guide:
- 0.9-1.0: Excellent, accept immediately
- 0.7-0.89: Good, accept with minor warnings
- 0.5-0.69: Acceptable but has issues, user should review
- Below 0.5: Poor, recommend retry`;

// ============================================================
// NODO
// ============================================================

export class ValidationNode extends EditorNode {
  constructor(config = {}) {
    super({
      ...config,
      type: EDITOR_NODE_TYPES.VALIDATION,
      name: config.name || 'Edit Validator',
    });
  }

  async process(context = {}) {
    const { mediaUrl } = context;

    // Obtener resultado de la edición
    const executionResult = this.getInputResult(EDITOR_NODE_TYPES.EXECUTION);
    if (!executionResult?.resultUrl) {
      throw new Error('ValidationNode: no edit result to validate');
    }

    // Obtener la orden original
    const intentResult       = this.getInputResult(EDITOR_NODE_TYPES.INTENT_PARSER);
    const preservationResult = this.getInputResult(EDITOR_NODE_TYPES.PRESERVATION_GUARD);
    const composerResult     = this.getInputResult(EDITOR_NODE_TYPES.PROMPT_COMPOSER);

    // Para validación de video, solo se puede hacer check básico
    if (executionResult.mediaType === 'video') {
      return this._basicVideoValidation(executionResult, intentResult, composerResult);
    }

    // Para imagen, hacer validación visual completa
    return this._visualValidation(
      mediaUrl,
      executionResult,
      intentResult,
      preservationResult,
      composerResult,
    );
  }

  // ============================================================
  // VALIDACIÓN VISUAL CON GEMINI (imágenes)
  // ============================================================

  async _visualValidation(originalUrl, editResult, intentResult, preservationResult, composerResult) {
    try {
      const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:4000';
      const endpoint = `${serverUrl}/api/gemini/proxy/gemini-2.5-flash`;

      // Convertir ambas imágenes a base64
      const originalBase64 = await this.imageToBase64(originalUrl);
      const editedBase64   = editResult.isBase64
        ? editResult.rawBytes
        : await this.imageToBase64(editResult.resultUrl);

      const editOrder    = intentResult?.editOrder || {};
      const preservation = preservationResult || {};

      const body = {
        contents: [{
          parts: [
            {
              inlineData: { mimeType: 'image/jpeg', data: originalBase64 },
            },
            { text: '[ORIGINAL IMAGE - before edit]' },
            {
              inlineData: { mimeType: 'image/jpeg', data: editedBase64 },
            },
            { text: '[EDITED IMAGE - after edit]' },
            {
              text: `EDIT ORDER: ${JSON.stringify(editOrder, null, 2)}

PRESERVATION RULES:
${preservation.instructions || 'Standard preservation rules apply.'}

POST-EDIT CHECKS TO VERIFY:
${JSON.stringify(preservation.postEditChecks || [], null, 2)}

Compare the original and edited images. Produce the validation report.`,
            },
          ],
        }],
        systemInstruction: {
          parts: [{ text: VALIDATION_SYSTEM }],
        },
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1500,
          responseMimeType: 'application/json',
        },
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // Fallback a validación básica si Gemini falla
        return this._basicImageValidation(editResult, intentResult);
      }

      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      let text = '';
      for (const part of parts) {
        if (part.text) text = part.text;
      }

      let validation;
      try {
        let clean = text
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        const jsonStart = clean.indexOf('{');
        const jsonEnd = clean.lastIndexOf('}');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
          clean = clean.substring(jsonStart, jsonEnd + 1);
        }
        validation = JSON.parse(clean);
      } catch {
        return this._basicImageValidation(editResult, intentResult);
      }

      // Calcular métricas
      const tokens = data.usageMetadata;
      this.tokensUsed    = tokens?.totalTokenCount || 0;
      this._tokensInput  = tokens?.promptTokenCount || 0;
      this._tokensOutput = tokens?.candidatesTokenCount || 0;
      this.costUsd       = this.tokensUsed * 0.00000015;

      return {
        validation,
        validatedAt:    new Date().toISOString(),
        validationType: 'visual_ai',
        score:          validation.overall_score || 0,
        recommendation: validation.recommendation || 'accept',
        issues:         validation.issues || [],
        editResult,
      };

    } catch (error) {
      console.warn('Visual validation failed, using basic validation:', error.message);
      return this._basicImageValidation(editResult, intentResult);
    }
  }

  // ============================================================
  // VALIDACIÓN BÁSICA (sin AI visual)
  // ============================================================

  _basicImageValidation(editResult, intentResult) {
    const checks = [];
    const issues = [];

    // Check: el resultado existe
    if (editResult.resultUrl) {
      checks.push({
        type:   'RESULT_EXISTS',
        passed: true,
        detail: 'Edit produced a result image',
      });
    }

    // Check: no hubo error
    if (!editResult.error) {
      checks.push({
        type:   'NO_ERROR',
        passed: true,
        detail: 'Edit completed without errors',
      });
    }

    // Check: el provider respondió
    checks.push({
      type:   'PROVIDER_RESPONDED',
      passed: !!editResult.provider,
      detail: `Provider: ${editResult.provider || 'unknown'}`,
    });

    return {
      validation: {
        overall_score:  0.7,  // Puntaje por defecto sin validación visual
        edit_applied:   true,
        edit_quality:   'unknown',
        checks,
        issues,
        recommendation: 'accept_with_warnings',
      },
      validatedAt:    new Date().toISOString(),
      validationType: 'basic',
      score:          0.7,
      recommendation: 'accept_with_warnings',
      issues,
      editResult,
      note: 'Visual AI validation unavailable. Basic checks only.',
    };
  }

  // ============================================================
  // VALIDACIÓN BÁSICA PARA VIDEO
  // ============================================================

  _basicVideoValidation(editResult, intentResult, composerResult) {
    const checks = [];

    checks.push({
      type:   'VIDEO_GENERATED',
      passed: !!editResult.resultUrl,
      detail: editResult.resultUrl ? 'Video edit produced successfully' : 'No video result',
    });

    checks.push({
      type:   'PROVIDER_RESPONDED',
      passed: !!editResult.provider,
      detail: `Provider: ${editResult.provider || 'unknown'}`,
    });

    if (editResult.duration) {
      checks.push({
        type:   'DURATION_VALID',
        passed: editResult.duration > 0,
        detail: `Duration: ${editResult.duration}s`,
      });
    }

    return {
      validation: {
        overall_score:  0.75,
        edit_applied:   true,
        edit_quality:   'pending_user_review',
        checks,
        issues:         [],
        recommendation: 'accept_with_warnings',
      },
      validatedAt:    new Date().toISOString(),
      validationType: 'basic_video',
      score:          0.75,
      recommendation: 'accept_with_warnings',
      issues:         [],
      editResult,
      note: 'Video validation requires user review. AI visual validation not available for video.',
    };
  }
}

export default ValidationNode;