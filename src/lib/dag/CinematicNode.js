// src/lib/dag/CinematicNode.js
// Clase base del DAG. Todos los nodos cinematográficos la heredan.

import { dagNodesDB }     from '../supabase/database';
import { tokenUsageDB }   from '../supabase/database';
import { LLMProviderFactory } from '../ai/LLMProviderFactory';

// ============================================================
// TIPOS DE NODOS
// ============================================================

export const NODE_TYPES = {
  // Inputs
  INPUT_CHARACTER:   'input_character',
  INPUT_BACKGROUND:  'input_background',
  INPUT_REFERENCE:   'input_reference',

  // Cámara
  CAMERA_SETUP:      'camera_setup',
  LENS_CHOICE:       'lens_choice',
  CAMERA_MOVE:       'camera_move',
  SHOT_FRAMING:      'shot_framing',
  SHOT_ANGLE:        'shot_angle',

  // Iluminación
  LIGHTING_SETUP:    'lighting_setup',

  // Prompt
  PROMPT_BUILDER:    'prompt_builder',

  // Render
  RENDER_IMAGE:      'render_image',
  RENDER_VIDEO:      'render_video',

  // Post
  COMPOSITE:         'composite',
};

// ============================================================
// CLASE BASE
// ============================================================

export class CinematicNode {
  constructor(config = {}) {
    // Identidad
    this.id          = config.id || null;       // UUID de Supabase (null hasta guardar en DB)
    this.type        = config.type;
    this.name        = config.name || config.type;
    this.shotId      = config.shotId || null;

    // DAG
    this.inputs      = config.inputs || [];     // Array de nodos de los que depende
    this.outputs     = [];                       // Nodos que dependen de este

    // Config
    this.parameters  = config.parameters || {};
    this.llmProvider = config.llmProvider || null; // instancia de BaseLLMProvider

    // Estado
    this.status      = config.status || 'pending';
    this.result      = config.result || null;
    this.errorMsg    = config.errorMsg || null;

    // Métricas
    this.executionTimeMs = null;
    this.tokensUsed      = 0;
    this.costUsd         = 0;
  }

  // ============================================================
  // CONTROL DE EJECUCIÓN
  // ============================================================

  /**
   * ¿Puede ejecutarse? Solo si todos los inputs están completados
   */
  canExecute() {
    // Un nodo puede ejecutarse si todos sus inputs terminaron,
    // ya sea 'completed' o 'error'.
    // Inputs en 'error' son manejados en process() de cada subclase
    // (e.g. PromptBuilderNode omite fragmentos de nodos fallidos,
    //  y si el START falló, el END hace su propia llamada LLM).
    return this.inputs.every(n =>
      (n.status === 'completed' && n.result !== null) || n.status === 'error'
    );
  }

  /**
   * Obtener el resultado de un nodo input por tipo
   */
  getInputResult(nodeType) {
    const node = this.inputs.find(n => n.type === nodeType);
    return node?.result || null;
  }

  /**
   * Obtener todos los resultados de inputs como objeto plano
   */
  getInputsMap() {
    return this.inputs.reduce((acc, node) => {
      acc[node.type] = node.result;
      return acc;
    }, {});
  }

  // ============================================================
  // EJECUCIÓN PRINCIPAL
  // ============================================================

  async execute(context = {}) {
    if (!this.canExecute()) {
      const pending = this.inputs
        .filter(n => n.status !== 'completed')
        .map(n => n.type)
        .join(', ');
      throw new Error(`Node "${this.type}" waiting for: ${pending}`);
    }

    this.status = 'processing';
    await this._updateDBStatus('processing');

    const startTime = Date.now();

    try {
      // Obtener LLM provider si este nodo lo necesita
      if (!this.llmProvider && context.llmProviderName) {
        this.llmProvider = LLMProviderFactory.create(context.llmProviderName);
      } else if (!this.llmProvider) {
        this.llmProvider = LLMProviderFactory.createDefault();
      }

      // Ejecutar lógica del nodo (implementada en cada subclase)
      this.result = await this.process(context);

      this.status          = 'completed';
      this.executionTimeMs = Date.now() - startTime;

      // Guardar en DB
      await this._saveResult();

      // Log de tokens si el nodo usó LLM
      if (this.tokensUsed > 0 && context.userId) {
        await tokenUsageDB.log({
          user_id:    context.userId,
          project_id: context.projectId || null,
          shot_id:    this.shotId,
          node_id:    this.id,
          service:    this.llmProvider?.name || 'unknown',
          operation:  this.type,
          tokens_input:  this._tokensInput || 0,
          tokens_output: this._tokensOutput || 0,
          cost_usd:   this.costUsd,
          metadata:   { model: this.llmProvider?.modelId },
        });
      }

      return this.result;

    } catch (error) {
      this.status  = 'error';
      this.errorMsg = error.message;
      this.executionTimeMs = Date.now() - startTime;

      await this._saveError();
      throw error;
    }
  }

  // ============================================================
  // PROCESO — implementado por cada subclase
  // ============================================================

  async process(context) {
    throw new Error(`process() must be implemented in ${this.constructor.name}`);
  }

  // ============================================================
  // HELPERS LLM
  // ============================================================

  async callLLM({ system, prompt, temperature, max_tokens } = {}) {
    if (!this.llmProvider) {
      this.llmProvider = LLMProviderFactory.createDefault();
    }

    const result = await this.llmProvider.complete({ system, prompt, temperature, max_tokens });

    // Acumular métricas
    this._tokensInput  = (this._tokensInput  || 0) + result.tokens_input;
    this._tokensOutput = (this._tokensOutput || 0) + result.tokens_output;
    this.tokensUsed    = (this.tokensUsed    || 0) + result.tokens_total;
    this.costUsd       = (this.costUsd       || 0) + result.cost_usd;

    return result;
  }

  async callLLMJSON({ system, prompt, temperature } = {}) {
    if (!this.llmProvider) {
      this.llmProvider = LLMProviderFactory.createDefault();
    }

    const result = await this.llmProvider.completeJSON({ system, prompt, temperature });

    this._tokensInput  = (this._tokensInput  || 0) + result.tokens_input;
    this._tokensOutput = (this._tokensOutput || 0) + result.tokens_output;
    this.tokensUsed    = (this.tokensUsed    || 0) + result.tokens_total;
    this.costUsd       = (this.costUsd       || 0) + result.cost_usd;

    return result;
  }

  // ============================================================
  // DB SYNC
  // ============================================================

  async saveToDb() {
    if (!this.shotId) return null;

    const record = await dagNodesDB.create(this.shotId, {
      node_type:       this.type,
      input_node_ids:  this.inputs.map(n => n.id).filter(Boolean),
      parameters:      this.parameters,
      llm_provider_id: null, // se puede añadir si se quiere trazar
    });

    this.id = record.id;
    return record;
  }

  async _updateDBStatus(status) {
    if (!this.id) return;
    await dagNodesDB.updateStatus(this.id, status).catch(() => {});
  }

  async _saveResult() {
    if (!this.id) return;
    await dagNodesDB.setResult(this.id, {
      result:           this.result,
      execution_time_ms: this.executionTimeMs,
      tokens_used:      this.tokensUsed,
      cost_usd:         this.costUsd,
    }).catch(() => {});
  }

  async _saveError() {
    if (!this.id) return;
    await dagNodesDB.setError(this.id, this.errorMsg).catch(() => {});
  }

  // ============================================================
  // SERIALIZACIÓN
  // ============================================================

  toJSON() {
    return {
      id:          this.id,
      type:        this.type,
      name:        this.name,
      status:      this.status,
      parameters:  this.parameters,
      result:      this.result,
      errorMsg:    this.errorMsg,
      metrics: {
        executionTimeMs: this.executionTimeMs,
        tokensUsed:      this.tokensUsed,
        costUsd:         this.costUsd,
      },
    };
  }
}

export default CinematicNode;