// src/lib/editor/dag/nodes/MaskGeneratorNode.js
// Nodo 3 del DAG de edición.
// Genera la máscara para la zona a editar.
//
// Dos modos:
// 1) MANUAL: el usuario pintó la máscara con el MaskEditor (brush/lasso)
//    → se usa directamente como PNG blanco/negro
// 2) AUTO: se genera automáticamente basándose en el target del IntentParser
//    → usa Gemini para segmentación semántica o genera máscara simple
//
// La máscara resultante es un PNG donde:
//   BLANCO = zona a editar
//   NEGRO  = zona a preservar

import { EditorNode, EDITOR_NODE_TYPES } from '../EditorNode';

// ============================================================
// NODO
// ============================================================

export class MaskGeneratorNode extends EditorNode {
  constructor(config = {}) {
    super({
      ...config,
      type: EDITOR_NODE_TYPES.MASK_GENERATOR,
      name: config.name || 'Mask Generator',
    });
  }

  async process(context = {}) {
    const { userMask, mediaUrl } = context;

    // Obtener el edit order del IntentParser
    const intentResult = this.getInputResult(EDITOR_NODE_TYPES.INTENT_PARSER);
    if (!intentResult?.editOrder) {
      throw new Error('MaskGeneratorNode: no edit order available');
    }

    const editOrder = intentResult.editOrder;

    // Obtener el análisis de escena
    const analysisResult = this.getInputResult(EDITOR_NODE_TYPES.ANALYSIS);

    // ── Modo 1: Máscara manual del usuario ──
    if (userMask) {
      return {
        maskDataUrl: userMask,
        maskSource:  'manual',
        isBase64:    userMask.startsWith('data:'),
        target:      editOrder.target,
        maskMode:    'user_painted',
      };
    }

    // ── Modo 2: Operaciones que no necesitan máscara ──
    const noMaskOps = ['adjust', 'restyle'];
    if (noMaskOps.includes(editOrder.operation)) {
      return {
        maskDataUrl: null,
        maskSource:  'none',
        isBase64:    false,
        target:      editOrder.target,
        maskMode:    'full_image',
      };
    }

    // ── Modo 3: Background swap — usar detección automática de fondo ──
    if (editOrder.operation === 'background_swap') {
      return {
        maskDataUrl: null,
        maskSource:  'auto_background',
        isBase64:    false,
        target:      editOrder.target,
        maskMode:    'background',
        // Gemini Imagen y Kling soportan mask_mode: 'background' nativo
        apiMaskConfig: {
          mask_mode:    'background',
          mask_dilation: 0.03,
        },
      };
    }

    // ── Modo 4: Generar máscara automática por segmentación ──
    if (editOrder.target?.object_ids?.length > 0 && analysisResult?.analysis) {
      return this._generateAutoMask(editOrder, analysisResult.analysis, mediaUrl);
    }

    // ── Modo 5: Fallback — dejar que la API genere la máscara ──
    return {
      maskDataUrl: null,
      maskSource:  'auto_api',
      isBase64:    false,
      target:      editOrder.target,
      maskMode:    'semantic',
      apiMaskConfig: {
        mask_mode:    'semantic',
        mask_dilation: 0.02,
        // La API detectará automáticamente el objeto basándose en el prompt
      },
    };
  }

  // ============================================================
  // GENERACIÓN AUTOMÁTICA DE MÁSCARA
  // Usa las coordenadas del análisis para crear una máscara
  // ============================================================

  async _generateAutoMask(editOrder, analysis, mediaUrl) {
    const targetIds = editOrder.target?.object_ids || [];
    const targetObjects = (analysis.objects || []).filter(o => targetIds.includes(o.id));

    if (targetObjects.length === 0) {
      // Fallback a máscara semántica por API
      return {
        maskDataUrl: null,
        maskSource:  'auto_api',
        isBase64:    false,
        target:      editOrder.target,
        maskMode:    'semantic',
        apiMaskConfig: {
          mask_mode:    'semantic',
          mask_dilation: 0.02,
        },
      };
    }

    // Usar la información de posición y tamaño para generar
    // una máscara aproximada. En producción, esto usaría
    // SAM (Segment Anything Model) o similar.
    // Por ahora, le damos la info al API para que haga segmentación.

    const primaryTarget = targetObjects[0];

    return {
      maskDataUrl: null,
      maskSource:  'auto_semantic',
      isBase64:    false,
      target:      editOrder.target,
      maskMode:    'semantic',
      targetInfo: {
        label:    primaryTarget.label,
        position: primaryTarget.position,
        size:     primaryTarget.size_percent,
        category: primaryTarget.category,
      },
      apiMaskConfig: {
        mask_mode:    'semantic',
        mask_dilation: 0.02,
        // Hint para la API sobre qué segmentar
        segmentation_hint: primaryTarget.label,
      },
    };
  }
}

export default MaskGeneratorNode;