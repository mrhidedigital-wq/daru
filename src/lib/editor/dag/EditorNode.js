// src/lib/editor/dag/EditorNode.js
// Clase base de todos los nodos del DAG de edición.
// Hereda de CinematicNode para reutilizar DB sync, métricas y callLLM.

import { CinematicNode } from '../../dag/CinematicNode';

// ============================================================
// TIPOS DE NODOS — DAG DE EDICIÓN
// ============================================================

export const EDITOR_NODE_TYPES = {
  // Análisis
  ANALYSIS:           'editor_analysis',
  // Interpretación
  INTENT_PARSER:      'editor_intent_parser',
  // Máscara
  MASK_GENERATOR:     'editor_mask_generator',
  // Guardia de preservación
  PRESERVATION_GUARD: 'editor_preservation_guard',
  // Composición de prompt
  PROMPT_COMPOSER:    'editor_prompt_composer',
  // Ejecución
  EXECUTION:          'editor_execution',
  // Validación
  VALIDATION:         'editor_validation',
};

// ============================================================
// CLASE BASE EDITOR NODE
// ============================================================

export class EditorNode extends CinematicNode {
  constructor(config = {}) {
    super({
      ...config,
      // Sobreescribir shotId con sessionId para el editor
      shotId: config.sessionId || config.shotId || null,
    });

    // Referencia a la sesión de edición (en lugar de shot)
    this.sessionId   = config.sessionId || null;
    this.operationId = config.operationId || null;
  }

  // ============================================================
  // Override para usar edit_sessions en vez de shots para DB
  // ============================================================

  async saveToDb() {
    if (!this.sessionId) return null;

    // Reutilizar dagNodesDB pero con sessionId como shotId
    // Esto funciona porque dag_nodes.shot_id es un FK genérico UUID
    // En producción se podría crear editor_dag_nodes aparte
    const { dagNodesDB } = await import('../../supabase/database');

    const record = await dagNodesDB.create(this.sessionId, {
      node_type:       this.type,
      input_node_ids:  this.inputs.map(n => n.id).filter(Boolean),
      parameters:      this.parameters,
    });

    this.id = record.id;
    return record;
  }

  // ============================================================
  // HELPERS ESPECÍFICOS DEL EDITOR
  // ============================================================

  /**
   * Convierte una imagen a base64 desde URL (para enviar a APIs)
   */
  async imageToBase64(imageUrl) {
    if (imageUrl.startsWith('data:')) {
      // Ya es base64
      return imageUrl.split(',')[1];
    }

    const res = await fetch(imageUrl);
    const blob = await res.blob();

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Detecta si un URL es imagen o video
   */
  detectMediaType(url) {
    if (!url) return 'unknown';
    const lower = url.toLowerCase();
    if (/\.(jpg|jpeg|png|webp|gif|bmp|svg)/.test(lower)) return 'image';
    if (/\.(mp4|webm|mov|avi|mkv)/.test(lower)) return 'video';
    if (lower.includes('data:image/'))    return 'image';
    if (lower.includes('data:video/'))    return 'video';
    return 'unknown';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      sessionId:   this.sessionId,
      operationId: this.operationId,
    };
  }
}

export default EditorNode;