// src/lib/editor/dag/nodes/IntentParserNode.js
// Nodo 2 del DAG de edición.
// Interpreta la instrucción del usuario en lenguaje natural
// y la cruza con el inventario de escena del AnalysisNode.
// Produce una "orden estructurada" de qué hacer.
//
// CLAVE ANTI-ALUCINACIÓN:
// Si el usuario referencia algo que no existe en la escena,
// este nodo lo detecta y pide clarificación en vez de inventar.

import { EditorNode, EDITOR_NODE_TYPES } from '../EditorNode';

// ============================================================
// SYSTEM PROMPT
// ============================================================

const INTENT_SYSTEM = `You are an intent parser for a media editing system.
You receive:
1) A scene inventory (JSON) from the analysis step
2) A user instruction in natural language (may be in Spanish or English)
3) A list of reference elements the user uploaded (Element 1, 2, etc.)

Your job: produce a structured edit order.

RESPOND ONLY IN JSON. No markdown, no backticks.

JSON Schema:
{
  "operation": "replace|remove|add|recolor|restyle|background_swap|composite|adjust",
  "confidence": 0.9,
  "target": {
    "object_ids": ["obj_1"],
    "description": "the Coca-Cola bottle",
    "region": "center",
    "requires_mask": true
  },
  "action": {
    "type": "replace_with_element",
    "element_index": 1,
    "description": "Replace the Coca-Cola bottle with the Sprite bottle from Element 1",
    "preserve_lighting": true,
    "preserve_perspective": true,
    "preserve_shadows": true
  },
  "ambiguities": [],
  "warnings": [],
  "clarification_needed": false,
  "clarification_question": null,
  "clarification_options": []
}

OPERATION TYPES:
- replace: swap an object with a reference element (product swap, character swap)
- remove: delete an object, fill with context
- add: insert a new element into the scene
- recolor: change color of an existing object
- restyle: change style/texture without changing shape
- background_swap: replace the entire background
- composite: merge multiple elements into the scene
- adjust: brightness, contrast, warmth, color grading

ANTI-HALLUCINATION RULES:
1. ONLY reference objects that exist in the scene inventory.
2. If the user says "change the blue bottle" but the inventory shows a RED bottle,
   set clarification_needed=true and provide actionable options.
3. If the user references an Element (1,2,3,4) that doesn't exist, flag it.
4. NEVER assume what the user wants to preserve — use the inventory to infer sensible defaults.
5. List ALL ambiguities.
6. warnings array: flag anything that might produce poor results.

CRITICAL — CLARIFICATION RULES:
When clarification_needed=true, you MUST provide "clarification_options" — an array of 2-4 actionable options.
Each option is a complete edit order that can be executed immediately if the user picks it.
Format:
"clarification_options": [
  {
    "label": "Short description of what this option does",
    "operation": "replace",
    "target": { ... },
    "action": { ... }
  },
  {
    "label": "Alternative action",
    "operation": "add",
    "target": { ... },
    "action": { ... }
  }
]
The "clarification_question" should be a brief question in the SAME LANGUAGE as the user instruction.
NEVER ask open-ended questions. Always give concrete, clickable options that execute immediately.
Example: "¿Qué prefieres?" with options, NOT "¿Podrías describir mejor lo que quieres?"
Prefer to act with best guess (confidence >= 0.6) rather than ask. Only ask if truly ambiguous (confidence < 0.6).`;

// ============================================================
// NODO
// ============================================================

export class IntentParserNode extends EditorNode {
  constructor(config = {}) {
    super({
      ...config,
      type: EDITOR_NODE_TYPES.INTENT_PARSER,
      name: config.name || 'Intent Parser',
    });
  }

  async process(context = {}) {
    const { instruction, elements } = context;

    if (!instruction) {
      throw new Error('IntentParserNode: no user instruction provided');
    }

    // Obtener el análisis de escena del nodo anterior
    const analysisResult = this.getInputResult(EDITOR_NODE_TYPES.ANALYSIS);
    if (!analysisResult?.analysis) {
      throw new Error('IntentParserNode: no scene analysis available');
    }

    const analysis = analysisResult.analysis;

    // Construir prompt con contexto completo
    const prompt = this._buildPrompt(instruction, analysis, elements);

    // Llamar al LLM
    const result = await this.callLLMJSON({
      system: INTENT_SYSTEM,
      prompt,
      temperature: 0.1,
    });

    let editOrder;
    try {
      editOrder = typeof result.parsed === 'object' ? result.parsed : JSON.parse(result.text);
    } catch {
      // Intentar limpiar
      const clean = (result.text || '')
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      editOrder = JSON.parse(clean);
    }

    // Validar la orden contra la escena real
    const validationIssues = this._validateOrder(editOrder, analysis, elements);
    editOrder.validationIssues = validationIssues;

    if (validationIssues.length > 0) {
      editOrder.warnings = [...(editOrder.warnings || []), ...validationIssues];
    }

    return {
      editOrder,
      instruction,
      requiresClarification: editOrder.clarification_needed || false,
      clarificationQuestion: editOrder.clarification_question || null,
      clarificationOptions:  editOrder.clarification_options || [],
    };
  }

  // ============================================================
  // CONSTRUIR PROMPT
  // ============================================================

  _buildPrompt(instruction, analysis, elements = []) {
    let prompt = `SCENE INVENTORY:\n${JSON.stringify(analysis, null, 2)}\n\n`;

    if (elements && elements.length > 0) {
      prompt += `REFERENCE ELEMENTS UPLOADED BY USER:\n`;
      elements.forEach((el, i) => {
        prompt += `  Element ${i + 1}: ${el.description || el.name || `Image ${i + 1}`}\n`;
      });
      prompt += '\n';
    } else {
      prompt += 'REFERENCE ELEMENTS: None uploaded.\n\n';
    }

    prompt += `USER INSTRUCTION:\n"${instruction}"\n\n`;
    prompt += `Parse this instruction into a structured edit order. Cross-reference with the scene inventory.`;

    return prompt;
  }

  // ============================================================
  // VALIDACIÓN LOCAL (sin LLM, reglas duras)
  // ============================================================

  _validateOrder(order, analysis, elements = []) {
    const issues = [];

    // 1) Verificar que los object_ids referenciados existen
    const validIds = new Set((analysis.objects || []).map(o => o.id));
    const targetIds = order.target?.object_ids || [];
    for (const id of targetIds) {
      if (!validIds.has(id)) {
        issues.push(`INVALID_OBJECT_REF: "${id}" not found in scene inventory`);
      }
    }

    // 2) Verificar que el Element referenciado existe
    if (order.action?.element_index) {
      const idx = order.action.element_index;
      if (!elements || idx > elements.length || idx < 1) {
        issues.push(`MISSING_ELEMENT: Element ${idx} referenced but only ${elements?.length || 0} elements uploaded`);
      }
    }

    // 3) Operación "replace" sin elemento de referencia
    if (order.operation === 'replace' && !order.action?.element_index) {
      // A veces el reemplazo es solo por texto (recolor), pero si es product swap necesita elemento
      if (order.action?.type === 'replace_with_element') {
        issues.push(`REPLACE_NO_ELEMENT: replace operation requires a reference element but none specified`);
      }
    }

    // 4) Operación sobre región vacía
    if (order.target?.region && order.target.object_ids?.length === 0) {
      issues.push(`EMPTY_TARGET: no objects identified in target region "${order.target.region}"`);
    }

    return issues;
  }
}

export default IntentParserNode;