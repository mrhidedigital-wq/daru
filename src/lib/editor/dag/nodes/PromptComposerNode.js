// src/lib/editor/dag/nodes/PromptComposerNode.js
// Nodo 5 del DAG de edición.
// Ensambla el prompt final para Gemini o Kling usando:
//   - La orden del IntentParser
//   - Las reglas del PreservationGuard
//   - El análisis del AnalysisNode
//   - La máscara del MaskGenerator
//
// NO INVENTA NADA. Solo compone con datos verificados de nodos anteriores.

import { EditorNode, EDITOR_NODE_TYPES } from '../EditorNode';

// ============================================================
// ANTI-ALUCINACIÓN CONTRACT para edición
// ============================================================

const EDIT_ANTI_HALLUCINATION = `
SACRED INPUTS CONTRACT — MANDATORY FOR ALL EDITS:

PRINCIPLE: All user-provided inputs are SACRED and must NOT be modified.
The AI acts as a professional operator that COMBINES and ADAPTS — never alters originals.

FOR THE BASE IMAGE/VIDEO (the scene):
1. Do NOT alter, distort, or reimagine any part of the scene that is not the edit target.
2. The subject (person, animal, object) must remain IDENTICAL — same pose, same expression,
   same features, same colors, same clothing, same everything.
3. Background, lighting, and atmosphere must stay exactly as they are unless explicitly requested to change.

FOR REFERENCE ELEMENTS (uploaded by the user):
4. The reference element is SACRED — do NOT alter its brand, text, colors, design, texture,
   shape, or any distinctive feature.
5. ADAPT the element to fit the scene (adjust perspective, position, scale, shadows, lighting)
   but the element itself must remain visually identical to what was uploaded.
6. Think like a Photoshop expert: you are placing the EXACT element into the scene,
   not generating a "similar" one.

COMBINATION RULES:
7. Analyze the scene: understand pose, perspective, lighting direction, depth.
8. Analyze the element: understand its shape, orientation, how it should fit.
9. Combine them naturally: match shadows, reflections, perspective, scale.
10. The result should look like the element was ALWAYS part of the scene — seamless integration.

SELF-CHECK before generating:
- "Did I modify the original scene beyond what was requested?" → If yes, redo.
- "Does the element in my output look identical to the uploaded reference?" → If no, redo.
- "Did I invent or hallucinate anything not in the inputs?" → If yes, remove it.`;

// ============================================================
// TEMPLATES POR PROVIDER
// ============================================================

const PROVIDER_TEMPLATES = {
  // Gemini 2.5 Flash Image — conversational editing
  gemini_edit: {
    buildPrompt(order, preservation, analysis) {
      const parts = [];

      // Instrucción principal
      parts.push(order.action?.description || 'Edit the image as requested');

      // Principio sagrado
      parts.push('\nSACRED INPUTS RULES:');
      parts.push('- The original image is SACRED: do NOT modify anything except the edit target.');
      parts.push('- Any reference element is SACRED: use it EXACTLY as provided, only adapt position/perspective/lighting to fit the scene.');
      parts.push('- Think like a Photoshop expert: cut, place, blend — but never reimagine or regenerate.');

      // Reglas de preservación (resumidas)
      const preserveItems = preservation.rules?.preserve || [];
      if (preserveItems.length > 0) {
        parts.push('\nPRESERVE THESE EXACTLY:');
        const topRules = preserveItems.slice(0, 5).map(r => r.replace(/_/g, ' '));
        parts.push(topRules.map(r => `- ${r}`).join('\n'));
      }

      // Reglas específicas de objetos
      const specificRules = preservation.rules?.specific || [];
      if (specificRules.length > 0) {
        const objectRules = specificRules
          .filter(s => s.rule === 'PRESERVE_OBJECT')
          .slice(0, 3);
        if (objectRules.length > 0) {
          parts.push('\nDo NOT modify these objects:');
          parts.push(objectRules.map(r => `- ${r.object}`).join('\n'));
        }
      }

      parts.push('\nCRITICAL: Only change what was requested. Keep everything else pixel-perfect.');

      return parts.join('\n');
    },
  },

  // Kling O1 Edit — video-to-video con @Elements
  kling_edit: {
    buildPrompt(order, preservation, analysis, elements) {
      const parts = [];

      let mainInstruction = order.action?.description || 'Edit the video as requested';

      // Kling usa @Element1, @Element2 syntax
      if (elements?.length > 0) {
        elements.forEach((_, i) => {
          const regex = new RegExp(`Element\\s*${i + 1}`, 'gi');
          mainInstruction = mainInstruction.replace(regex, `@Element${i + 1}`);
        });
      }

      parts.push(mainInstruction);
      parts.push('SACRED RULES: Do NOT modify the original video except the edit target.');
      parts.push('Reference elements must appear EXACTLY as uploaded — same design, colors, features.');
      parts.push('Maintain original motion, camera angles, audio, and lighting.');
      parts.push('Only change what was explicitly requested.');

      return parts.join('. ');
    },
  },

  // Imagen 3 (Vertex AI) — mask-based inpainting
  imagen_inpaint: {
    buildPrompt(order, preservation, analysis) {
      const target = order.target?.description || 'the selected area';
      const action = order.action?.description || 'edit the area';

      const sacred = ' Do NOT alter anything outside the masked area. Preserve the original image exactly.';

      switch (order.operation) {
        case 'remove':
          return `Remove ${target}. Fill the area naturally with the surrounding background.${sacred}`;
        case 'replace':
          return `${action} The replacement element must look EXACTLY as the reference provided — same colors, design, features. Only adapt perspective and lighting to match the scene.${sacred}`;
        case 'add':
          return `Add ${action} in the masked area. Match scene lighting and perspective. Do NOT modify anything outside the masked area.${sacred}`;
        case 'recolor':
          return `Change the color of ${target} to ${order.action?.description || 'the requested color'}. Keep exact shape, texture, and all other details.${sacred}`;
        default:
          return `${action}${sacred}`;
      }
    },
  },
};

// ============================================================
// NODO
// ============================================================

export class PromptComposerNode extends EditorNode {
  constructor(config = {}) {
    super({
      ...config,
      type: EDITOR_NODE_TYPES.PROMPT_COMPOSER,
      name: config.name || 'Prompt Composer',
    });
  }

  async process(context = {}) {
    const { elements, targetProvider, editMode } = context;

    // Reunir resultados de todos los nodos anteriores
    const analysisResult     = this.getInputResult(EDITOR_NODE_TYPES.ANALYSIS);
    const intentResult       = this.getInputResult(EDITOR_NODE_TYPES.INTENT_PARSER);
    const maskResult         = this.getInputResult(EDITOR_NODE_TYPES.MASK_GENERATOR);
    const preservationResult = this.getInputResult(EDITOR_NODE_TYPES.PRESERVATION_GUARD);

    if (!intentResult?.editOrder) {
      throw new Error('PromptComposerNode: no edit order available');
    }

    const editOrder    = intentResult.editOrder;
    const analysis     = analysisResult?.analysis || {};
    const preservation = preservationResult || {};
    const mediaType    = analysisResult?.mediaType || 'image';
    const isFaithful   = editMode !== 'creative';

    // Determinar el provider/template según el tipo de media y operación
    const provider = this._selectProvider(mediaType, editOrder, targetProvider);

    // Construir prompt con el template apropiado
    const template = PROVIDER_TEMPLATES[provider];
    if (!template) {
      throw new Error(`PromptComposerNode: unknown provider template "${provider}"`);
    }

    const composedPrompt = template.buildPrompt(editOrder, preservation, analysis, elements);

    // Construir el paquete completo para la API
    const apiPackage = {
      prompt:          composedPrompt,
      provider,
      operation:       editOrder.operation,
      editMode:        editMode || 'faithful',
      mask:            maskResult,
      elements:        elements || [],
      preservationRules: preservation.instructions || '',
      // Solo inyectar Sacred Inputs en modo FIEL
      antiHallucination: isFaithful ? EDIT_ANTI_HALLUCINATION : 'Creative mode: the AI has freedom to reinterpret and reimagine. Original inputs are guides, not constraints.',
      postEditChecks:    preservation.postEditChecks || [],
      meta: {
        targetObjects: editOrder.target?.object_ids || [],
        operationType: editOrder.operation,
        confidence:    editOrder.confidence || 0,
        editMode:      editMode || 'faithful',
      },
    };

    return apiPackage;
  }

  // ============================================================
  // SELECCIONAR PROVIDER/TEMPLATE
  // ============================================================

  _selectProvider(mediaType, editOrder, targetProvider) {
    // Si el usuario especificó un provider, usarlo
    if (targetProvider) return targetProvider;

    // Video → Kling O1 Edit
    if (mediaType === 'video') return 'kling_edit';

    // Imagen con máscara → Imagen 3 inpainting
    if (editOrder.target?.requires_mask) return 'imagen_inpaint';

    // Imagen general → Gemini 2.5 Flash Image (conversational edit)
    return 'gemini_edit';
  }
}

export default PromptComposerNode;