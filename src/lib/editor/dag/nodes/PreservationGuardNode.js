// src/lib/editor/dag/nodes/PreservationGuardNode.js
// Nodo 4 del DAG de edición.
// Define explícitamente qué NO debe cambiar en la edición.
// Genera un conjunto de "reglas de preservación" que se inyectan
// en el prompt final para prevenir que la IA cambie cosas no solicitadas.
//
// CLAVE ANTI-ALUCINACIÓN:
// Este es el guardián principal. Sin él, la IA podría cambiar
// la iluminación, agregar objetos, o alterar el fondo
// cuando solo se le pidió cambiar un producto.

import { EditorNode, EDITOR_NODE_TYPES } from '../EditorNode';

// ============================================================
// REGLAS DE PRESERVACIÓN POR TIPO DE OPERACIÓN
// ============================================================

const PRESERVATION_RULES = {
  replace: {
    preserve: [
      'lighting_direction', 'lighting_intensity', 'lighting_color_temperature',
      'shadows_position', 'shadows_softness',
      'perspective_angle', 'perspective_depth',
      'background_all', 'background_blur',
      'other_objects_all',
      'overall_color_grading',
      'resolution', 'aspect_ratio',
    ],
    allow_change: ['target_object_shape', 'target_object_color', 'target_object_texture'],
  },

  remove: {
    preserve: [
      'lighting_direction', 'lighting_intensity',
      'background_continuity',  // rellenar con contexto coherente
      'other_objects_all',
      'overall_color_grading',
      'resolution', 'aspect_ratio',
    ],
    allow_change: ['target_region_content'],
  },

  add: {
    preserve: [
      'existing_objects_all',
      'lighting_direction', 'lighting_intensity',
      'background_all',
      'overall_composition',
      'resolution', 'aspect_ratio',
    ],
    allow_change: ['target_region_for_insertion'],
  },

  recolor: {
    preserve: [
      'object_shape', 'object_texture', 'object_position',
      'lighting_all',
      'background_all',
      'other_objects_all',
      'shadows_all',
      'resolution', 'aspect_ratio',
    ],
    allow_change: ['target_object_color_only'],
  },

  restyle: {
    preserve: [
      'composition', 'object_positions',
      'overall_structure',
      'text_content',
      'resolution', 'aspect_ratio',
    ],
    allow_change: ['style', 'texture', 'color_palette', 'artistic_treatment'],
  },

  background_swap: {
    preserve: [
      'foreground_subjects_all',
      'subject_lighting_on_face',  // intentar preservar
      'subject_edges',
      'resolution', 'aspect_ratio',
    ],
    allow_change: ['background_entirely', 'ambient_lighting'],
  },

  composite: {
    preserve: [
      'base_scene_structure',
      'lighting_direction',
      'perspective_consistency',
      'resolution', 'aspect_ratio',
    ],
    allow_change: ['composition_with_new_elements'],
  },

  adjust: {
    preserve: [
      'all_objects', 'all_positions', 'composition',
      'resolution', 'aspect_ratio',
    ],
    allow_change: ['brightness', 'contrast', 'saturation', 'warmth', 'color_grading'],
  },
};

// ============================================================
// NODO
// ============================================================

export class PreservationGuardNode extends EditorNode {
  constructor(config = {}) {
    super({
      ...config,
      type: EDITOR_NODE_TYPES.PRESERVATION_GUARD,
      name: config.name || 'Preservation Guard',
    });
  }

  async process(context = {}) {
    // Obtener el edit order del IntentParser
    const intentResult = this.getInputResult(EDITOR_NODE_TYPES.INTENT_PARSER);
    if (!intentResult?.editOrder) {
      throw new Error('PreservationGuardNode: no edit order available');
    }

    const editOrder = intentResult.editOrder;
    const operation = editOrder.operation || 'replace';

    // Obtener análisis de escena
    const analysisResult = this.getInputResult(EDITOR_NODE_TYPES.ANALYSIS);
    const analysis = analysisResult?.analysis || {};

    // 1) Obtener reglas base según operación
    const baseRules = PRESERVATION_RULES[operation] || PRESERVATION_RULES.replace;

    // 2) Expandir reglas con datos específicos de la escena
    const expandedRules = this._expandRules(baseRules, analysis, editOrder);

    // 3) Generar instrucciones en lenguaje natural para el prompt
    const preservationInstructions = this._generateInstructions(expandedRules, analysis, editOrder);

    // 4) Generar checks post-edición
    const postEditChecks = this._generatePostEditChecks(expandedRules, analysis, editOrder);

    return {
      rules:        expandedRules,
      instructions: preservationInstructions,
      postEditChecks,
      operation,
    };
  }

  // ============================================================
  // EXPANDIR REGLAS CON DATOS DE LA ESCENA
  // ============================================================

  _expandRules(baseRules, analysis, editOrder) {
    const expanded = {
      preserve:     [...baseRules.preserve],
      allow_change: [...baseRules.allow_change],
      specific:     [],
    };

    const targetIds = new Set(editOrder.target?.object_ids || []);

    // Agregar preservación específica para cada objeto NO-target
    for (const obj of (analysis.objects || [])) {
      if (!targetIds.has(obj.id)) {
        expanded.specific.push({
          rule:   'PRESERVE_OBJECT',
          object: obj.label,
          detail: `Do NOT modify "${obj.label}" at ${obj.position}. Keep its color, shape, position, and size exactly as is.`,
        });
      }
    }

    // Preservar texto y logos no-target
    for (const obj of (analysis.objects || [])) {
      if (!targetIds.has(obj.id) && obj.text_visible) {
        expanded.specific.push({
          rule:   'PRESERVE_TEXT',
          object: obj.label,
          detail: `Preserve text "${obj.text_visible}" exactly as it appears.`,
        });
      }
    }

    // Preservar iluminación específica de la escena
    if (analysis.scene?.lighting) {
      expanded.specific.push({
        rule:   'PRESERVE_LIGHTING',
        detail: `Maintain the existing lighting: ${analysis.scene.lighting}`,
      });
    }

    return expanded;
  }

  // ============================================================
  // GENERAR INSTRUCCIONES EN LENGUAJE NATURAL
  // ============================================================

  _generateInstructions(rules, analysis, editOrder) {
    const lines = [];

    lines.push('PRESERVATION CONTRACT — MANDATORY:');
    lines.push('The following elements MUST remain unchanged in the output:');
    lines.push('');

    // Reglas genéricas
    for (const rule of rules.preserve) {
      const readable = rule.replace(/_/g, ' ').replace(/all$/, '(all aspects)');
      lines.push(`  ✓ PRESERVE: ${readable}`);
    }

    lines.push('');
    lines.push('The following changes are ALLOWED:');
    for (const change of rules.allow_change) {
      const readable = change.replace(/_/g, ' ');
      lines.push(`  ✎ CHANGE: ${readable}`);
    }

    // Reglas específicas de objetos
    if (rules.specific.length > 0) {
      lines.push('');
      lines.push('SPECIFIC OBJECT RULES:');
      for (const s of rules.specific) {
        lines.push(`  ⚠ ${s.detail}`);
      }
    }

    lines.push('');
    lines.push('SELF-CHECK: Before outputting, verify that ONLY the allowed changes were made.');
    lines.push('If any preserved element was altered, the edit is INVALID.');

    return lines.join('\n');
  }

  // ============================================================
  // GENERAR CHECKS POST-EDICIÓN
  // ============================================================

  _generatePostEditChecks(rules, analysis, editOrder) {
    const checks = [];

    // Check 1: Los objetos no-target siguen presentes
    const targetIds = new Set(editOrder.target?.object_ids || []);
    for (const obj of (analysis.objects || [])) {
      if (!targetIds.has(obj.id)) {
        checks.push({
          type:        'OBJECT_PRESERVED',
          description: `"${obj.label}" should still be visible at ${obj.position}`,
          severity:    'error',
        });
      }
    }

    // Check 2: Iluminación consistente
    checks.push({
      type:        'LIGHTING_CONSISTENT',
      description: `Lighting direction and intensity should match original`,
      severity:    'warning',
    });

    // Check 3: Resolución mantenida
    checks.push({
      type:        'RESOLUTION_MAINTAINED',
      description: `Output resolution should match input`,
      severity:    'error',
    });

    // Check 4: Aspect ratio mantenido
    checks.push({
      type:        'ASPECT_RATIO_MAINTAINED',
      description: `Aspect ratio should remain ${analysis.technical?.aspect_ratio || 'original'}`,
      severity:    'error',
    });

    // Check 5: Para product swap, el nuevo producto debe ser reconocible
    if (editOrder.operation === 'replace' && editOrder.action?.element_index) {
      checks.push({
        type:        'REPLACEMENT_RECOGNIZABLE',
        description: `The replacement element (Element ${editOrder.action.element_index}) should be clearly recognizable`,
        severity:    'warning',
      });
    }

    return checks;
  }
}

export default PreservationGuardNode;