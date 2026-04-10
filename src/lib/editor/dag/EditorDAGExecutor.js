// src/lib/editor/dag/EditorDAGExecutor.js
// Orquestador principal del DAG de edición.
// Construye el grafo, ejecuta nodos en orden topológico,
// maneja reintentos automáticos y reporta progreso.
//
// Flujo:
//   Analysis → IntentParser → MaskGenerator → PreservationGuard
//     → PromptComposer → Execution → Validation
//                                        ↑
//                    retry si score < 0.5 ┘

import { EDITOR_NODE_TYPES }        from './EditorNode';
import { AnalysisNode }             from './nodes/AnalysisNode';
import { IntentParserNode }         from './nodes/IntentParserNode';
import { MaskGeneratorNode }        from './nodes/MaskGeneratorNode';
import { PreservationGuardNode }    from './nodes/PreservationGuardNode';
import { PromptComposerNode }       from './nodes/PromptComposerNode';
import { ExecutionNode }            from './nodes/ExecutionNode';
import { ValidationNode }           from './nodes/ValidationNode';

// ============================================================
// FACTORY DE NODOS
// ============================================================

function createEditorNode(type, config) {
  switch (type) {
    case EDITOR_NODE_TYPES.ANALYSIS:           return new AnalysisNode(config);
    case EDITOR_NODE_TYPES.INTENT_PARSER:      return new IntentParserNode(config);
    case EDITOR_NODE_TYPES.MASK_GENERATOR:     return new MaskGeneratorNode(config);
    case EDITOR_NODE_TYPES.PRESERVATION_GUARD: return new PreservationGuardNode(config);
    case EDITOR_NODE_TYPES.PROMPT_COMPOSER:    return new PromptComposerNode(config);
    case EDITOR_NODE_TYPES.EXECUTION:          return new ExecutionNode(config);
    case EDITOR_NODE_TYPES.VALIDATION:         return new ValidationNode(config);
    default:
      throw new Error(`Unknown editor node type: ${type}`);
  }
}

// ============================================================
// DAG EXECUTOR PARA EDITOR
// ============================================================

export class EditorDAGExecutor {
  constructor(options = {}) {
    this.nodes          = new Map();
    this.onProgress     = options.onProgress   || null;
    this.onNodeUpdate   = options.onNodeUpdate || null;
    this.context        = options.context      || {};
    this.maxRetries     = options.maxRetries   || 1;
    // context: { userId, sessionId, mediaUrl, mediaType, instruction,
    //            elements, userMask, targetProvider, llmProviderName }
  }

  // ============================================================
  // CONSTRUCCIÓN DEL GRAFO
  // ============================================================

  build() {
    this.nodes.clear();

    const sessionId = this.context.sessionId;

    // ── Nodo 1: Análisis ──
    const analysisNode = this._addNode(EDITOR_NODE_TYPES.ANALYSIS, {
      sessionId,
      parameters: {
        mediaType: this.context.mediaType || 'image',
      },
    });

    // ── Nodo 2: Intent Parser ──
    const intentNode = this._addNode(EDITOR_NODE_TYPES.INTENT_PARSER, {
      sessionId,
      parameters: {
        instruction: this.context.instruction,
      },
    });
    intentNode.inputs = [analysisNode];

    // ── Nodo 3: Mask Generator ──
    const maskNode = this._addNode(EDITOR_NODE_TYPES.MASK_GENERATOR, {
      sessionId,
      parameters: {},
    });
    maskNode.inputs = [analysisNode, intentNode];

    // ── Nodo 4: Preservation Guard ──
    const preservationNode = this._addNode(EDITOR_NODE_TYPES.PRESERVATION_GUARD, {
      sessionId,
      parameters: {},
    });
    preservationNode.inputs = [analysisNode, intentNode];

    // ── Nodo 5: Prompt Composer ──
    const composerNode = this._addNode(EDITOR_NODE_TYPES.PROMPT_COMPOSER, {
      sessionId,
      parameters: {
        targetProvider: this.context.targetProvider,
      },
    });
    composerNode.inputs = [analysisNode, intentNode, maskNode, preservationNode];

    // ── Nodo 6: Execution ──
    const executionNode = this._addNode(EDITOR_NODE_TYPES.EXECUTION, {
      sessionId,
      parameters: {},
    });
    executionNode.inputs = [composerNode];

    // ── Nodo 7: Validation ──
    const validationNode = this._addNode(EDITOR_NODE_TYPES.VALIDATION, {
      sessionId,
      parameters: {},
    });
    validationNode.inputs = [analysisNode, intentNode, preservationNode, composerNode, executionNode];

    return this;
  }

  // ============================================================
  // EJECUCIÓN
  // ============================================================

  async execute() {
    const totalNodes = this.nodes.size;
    let completedNodes = 0;

    this._reportProgress('starting', 0, totalNodes, 'Initializing edit pipeline...');

    // Ejecutar en orden topológico
    const executionOrder = this._getTopologicalOrder();

    for (const node of executionOrder) {
      const stepName = this._getStepName(node.type);
      this._reportProgress('processing', completedNodes, totalNodes, stepName);

      try {
        await node.execute(this.context);

        completedNodes++;
        this._reportNodeUpdate(node, 'completed');

        // ── Check especial: IntentParser puede pedir clarificación ──
        if (node.type === EDITOR_NODE_TYPES.INTENT_PARSER) {
          if (node.result?.requiresClarification) {
            this._reportProgress('clarification_needed', completedNodes, totalNodes,
              node.result.clarificationQuestion || 'The system needs more information.');

            return {
              status:      'clarification_needed',
              question:    node.result.clarificationQuestion,
              editOrder:   node.result.editOrder,
              partialResults: this._collectResults(),
            };
          }
        }

      } catch (error) {
        this._reportNodeUpdate(node, 'error', error.message);

        // Para el nodo de Ejecución, intentar retry
        if (node.type === EDITOR_NODE_TYPES.EXECUTION && this.maxRetries > 0) {
          console.warn(`Execution failed, retrying (${this.maxRetries} attempts left)...`);
          this.maxRetries--;

          // Reset del nodo y reintentar
          node.status = 'pending';
          node.result = null;
          node.errorMsg = null;

          try {
            await node.execute(this.context);
            completedNodes++;
            this._reportNodeUpdate(node, 'completed');
            continue;
          } catch (retryError) {
            // Retry también falló
            return {
              status:  'error',
              error:   retryError.message,
              node:    node.type,
              partialResults: this._collectResults(),
            };
          }
        }

        return {
          status:  'error',
          error:   error.message,
          node:    node.type,
          partialResults: this._collectResults(),
        };
      }
    }

    // ── Resultado final ──
    const results      = this._collectResults();
    const validation   = results[EDITOR_NODE_TYPES.VALIDATION];
    const execution    = results[EDITOR_NODE_TYPES.EXECUTION];

    this._reportProgress('completed', totalNodes, totalNodes, 'Edit complete!');

    return {
      status:         'completed',
      resultUrl:      execution?.resultUrl || null,
      mediaType:      execution?.mediaType || 'image',
      provider:       execution?.provider || null,
      cost:           this._calculateTotalCost(),
      validation:     validation?.validation || null,
      score:          validation?.score || 0,
      recommendation: validation?.recommendation || 'accept',
      issues:         validation?.issues || [],
      allResults:     results,
    };
  }

  // ============================================================
  // EJECUTAR SOLO ANÁLISIS (para pre-cargar inventario)
  // ============================================================

  async executeAnalysisOnly() {
    this.build();

    const analysisNode = [...this.nodes.values()].find(
      n => n.type === EDITOR_NODE_TYPES.ANALYSIS
    );

    if (!analysisNode) throw new Error('Analysis node not found');

    await analysisNode.execute(this.context);
    return analysisNode.result;
  }

  // ============================================================
  // HELPERS INTERNOS
  // ============================================================

  _addNode(type, config) {
    const node = createEditorNode(type, config);
    this.nodes.set(type, node);
    return node;
  }

  _getTopologicalOrder() {
    // El orden ya está implícito en cómo construimos el grafo,
    // pero hacemos un sort topológico real para seguridad
    const visited  = new Set();
    const sorted   = [];
    const visiting = new Set();

    const visit = (node) => {
      if (visited.has(node.type)) return;
      if (visiting.has(node.type)) {
        throw new Error(`Cycle detected in editor DAG at node: ${node.type}`);
      }

      visiting.add(node.type);

      for (const input of (node.inputs || [])) {
        visit(input);
      }

      visiting.delete(node.type);
      visited.add(node.type);
      sorted.push(node);
    };

    for (const node of this.nodes.values()) {
      visit(node);
    }

    return sorted;
  }

  _collectResults() {
    const results = {};
    for (const [type, node] of this.nodes) {
      results[type] = node.result;
    }
    return results;
  }

  _calculateTotalCost() {
    let total = 0;
    for (const node of this.nodes.values()) {
      total += node.costUsd || 0;
    }
    return Math.round(total * 10000) / 10000; // 4 decimales
  }

  _getStepName(type) {
    const names = {
      [EDITOR_NODE_TYPES.ANALYSIS]:           '🔍 Analyzing scene...',
      [EDITOR_NODE_TYPES.INTENT_PARSER]:      '🧠 Understanding your instruction...',
      [EDITOR_NODE_TYPES.MASK_GENERATOR]:      '🎭 Preparing edit mask...',
      [EDITOR_NODE_TYPES.PRESERVATION_GUARD]: '🛡️ Setting preservation rules...',
      [EDITOR_NODE_TYPES.PROMPT_COMPOSER]:    '✍️ Composing edit prompt...',
      [EDITOR_NODE_TYPES.EXECUTION]:          '⚡ Applying edit...',
      [EDITOR_NODE_TYPES.VALIDATION]:         '✅ Validating result...',
    };
    return names[type] || type;
  }

  _reportProgress(status, completed, total, message) {
    if (this.onProgress) {
      this.onProgress({
        status,
        completed,
        total,
        percent: total > 0 ? Math.round((completed / total) * 100) : 0,
        message,
      });
    }
  }

  _reportNodeUpdate(node, status, error = null) {
    if (this.onNodeUpdate) {
      this.onNodeUpdate({
        type:   node.type,
        name:   node.name,
        status,
        error,
        result: node.result,
        cost:   node.costUsd,
        time:   node.executionTimeMs,
      });
    }
  }
}

// ============================================================
// HELPER DE ALTO NIVEL
// ============================================================

/**
 * Ejecuta una edición completa en una sola llamada.
 *
 * @param {Object} params
 * @param {string} params.mediaUrl        - URL de la imagen/video original
 * @param {string} params.mediaType       - 'image' | 'video'
 * @param {string} params.instruction     - Instrucción del usuario en lenguaje natural
 * @param {Array}  params.elements        - Elementos de referencia [{imageUrl, name, description}]
 * @param {string} params.userMask        - Máscara pintada por el usuario (data URL) o null
 * @param {string} params.targetProvider  - 'gemini_edit' | 'imagen_inpaint' | 'kling_edit' | null (auto)
 * @param {string} params.userId          - UUID del usuario
 * @param {string} params.sessionId       - UUID de la sesión de edición
 * @param {Function} params.onProgress    - Callback de progreso
 * @param {Function} params.onNodeUpdate  - Callback de actualización de nodo
 * @returns {Object} Resultado de la edición
 */
export async function executeEdit(params) {
  const executor = new EditorDAGExecutor({
    context: {
      mediaUrl:       params.mediaUrl,
      mediaType:      params.mediaType || 'image',
      instruction:    params.instruction,
      editMode:       params.editMode || 'faithful',
      aspectRatio:    params.aspectRatio || '16:9',
      elements:       params.elements || [],
      userMask:       params.userMask || null,
      targetProvider: params.targetProvider || null,
      userId:         params.userId,
      sessionId:      params.sessionId,
      llmProviderName: params.llmProviderName || 'gemini',
    },
    onProgress:   params.onProgress,
    onNodeUpdate: params.onNodeUpdate,
    maxRetries:   1,
  });

  executor.build();
  return executor.execute();
}

export default EditorDAGExecutor;