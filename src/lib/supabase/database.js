// src/lib/supabase/database.js
// CRUD completo para Supabase.
// Cada objeto exportado corresponde a una tabla y expone
// exactamente los métodos que el resto de la app consume.
//
// SCHEMA REAL de referencia:
//   projects          → id, user_id, name, description, duration_seconds, format, status, created_at, updated_at
//   shots             → id, project_id, shot_number, name, duration_seconds, frame_start, frame_end, transition,
//                        status, result_video_url, result_preview_url, error_message, media_provider_id, provider_job_id
//   character_assets  → id, project_id, view_front_url, view_three_quarter_url, view_profile_url, view_back_url,
//                        description, style_analysis
//   dag_nodes         → id, shot_id, node_type, input_node_ids, parameters, status, result, error_message,
//                        execution_time_ms, tokens_used, cost_usd, created_at, executed_at
//   token_usage       → id, user_id, project_id, shot_id, node_id, service, operation,
//                        tokens_input, tokens_output, tokens_total, cost_usd, metadata
//   media_providers   → id, name, display_name, model_id, is_active, supports_video, supports_image,
//                        supports_reference_image, max_duration_seconds, cost_per_second, config
//   prompt_cache      → id, input_hash, input_params, optimized_prompt, tokens_original, tokens_optimized,
//                        tokens_saved, hit_count, created_at, last_used_at

import { supabase } from './client';

// ============================================================
// PROJECTS
// ============================================================

export const projectsDB = {

  /**
   * Obtener todos los proyectos de un usuario (con conteo de shots)
   */
  async getAll(userId) {
    const { data, error } = await supabase
      .from('projects')
      .select('*, shots(id, status, shot_number)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`projectsDB.getAll: ${error.message}`);
    return data;
  },

  /**
   * Obtener un proyecto por ID (con sus shots ordenados)
   */
  async getById(projectId) {
    const { data, error } = await supabase
      .from('projects')
      .select('*, shots(*)')
      .eq('id', projectId)
      .single();

    if (error) throw new Error(`projectsDB.getById: ${error.message}`);

    // Ordenar shots por shot_number
    if (data.shots) {
      data.shots.sort((a, b) => (a.shot_number || 0) - (b.shot_number || 0));
    }

    return data;
  },

  /**
   * Crear proyecto
   */
  async create(userId, projectData) {
    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id:          userId,
        name:             projectData.name,
        description:      projectData.description || '',
        format:           projectData.format || '16:9',
        duration_seconds: projectData.duration_seconds || 15,
        status:           'draft',
      })
      .select()
      .single();

    if (error) throw new Error(`projectsDB.create: ${error.message}`);
    return data;
  },

  /**
   * Actualizar proyecto
   */
  async update(projectId, updates) {
    const { data, error } = await supabase
      .from('projects')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .select()
      .single();

    if (error) throw new Error(`projectsDB.update: ${error.message}`);
    return data;
  },

  /**
   * Eliminar proyecto (cascade borra shots, character_assets)
   */
  async delete(projectId) {
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    if (error) throw new Error(`projectsDB.delete: ${error.message}`);
    return true;
  },
};

// ============================================================
// SHOTS
// Columnas reales: result_video_url, result_preview_url,
//                  media_provider_id, provider_job_id
// ============================================================

// ── WHITELIST de columnas válidas en la tabla shots ──────────
// Supabase rechaza con error de schema cache cualquier campo
// que no exista como columna real. Esta constante se usa en
// shotsDB.update() para filtrar silenciosamente campos inválidos
// como 'scene', 'durationSec', alias internos del DAG, etc.
const SHOTS_ALLOWED_COLUMNS = new Set([
  'shot_number',
  'name',
  'duration_seconds',
  'frame_start',
  'frame_end',
  'transition',
  'status',
  'error_message',
  'result_video_url',
  'result_preview_url',
  'media_provider_id',
  'provider_job_id',
  'updated_at',
]);

export const shotsDB = {

  /**
   * Obtener shots de un proyecto, ordenados
   */
  async getByProject(projectId) {
    const { data, error } = await supabase
      .from('shots')
      .select('*')
      .eq('project_id', projectId)
      .order('shot_number', { ascending: true });

    if (error) throw new Error(`shotsDB.getByProject: ${error.message}`);
    return data;
  },

  /**
   * Crear un shot
   */
  async create(projectId, shotData) {
    const { data, error } = await supabase
      .from('shots')
      .insert({
        project_id:       projectId,
        shot_number:      shotData.shot_number,
        name:             shotData.name || `Shot ${shotData.shot_number}`,
        duration_seconds: shotData.duration_seconds || shotData.durationSec || 4,
        frame_start:      shotData.frame_start || shotData.start || {},
        frame_end:        shotData.frame_end   || shotData.end   || {},
        transition:       shotData.transition   || shotData.camera || {},
        status:           'pending',
      })
      .select()
      .single();

    if (error) throw new Error(`shotsDB.create: ${error.message}`);
    return data;
  },

  /**
   * Actualizar un shot (campos parciales).
   * Mapea nombres de conveniencia del código → nombres reales de columna.
   * Filtra silenciosamente cualquier campo que no exista en la tabla shots
   * para evitar el error "Could not find the 'X' column in the schema cache".
   */
  async update(shotId, updates) {
    const mapped = { ...updates };

    // Mapeo: el código usa video_url / preview_url pero la tabla usa result_video_url / result_preview_url
    if ('video_url' in mapped) {
      mapped.result_video_url = mapped.video_url;
      delete mapped.video_url;
    }
    if ('preview_url' in mapped) {
      mapped.result_preview_url = mapped.preview_url;
      delete mapped.preview_url;
    }

    // ── WHITELIST FILTER ─────────────────────────────────────────
    // Eliminar cualquier campo no reconocido por la tabla shots.
    // Causas comunes: 'scene' del DAGExecutor enrichedShot,
    // 'durationSec' de presets, alias internos mezclados en el estado.
    for (const key of Object.keys(mapped)) {
      if (!SHOTS_ALLOWED_COLUMNS.has(key)) {
        console.warn(`[shotsDB.update] Campo descartado (no existe en tabla shots): "${key}"`);
        delete mapped[key];
      }
    }
    // ─────────────────────────────────────────────────────────────

    mapped.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('shots')
      .update(mapped)
      .eq('id', shotId)
      .select()
      .single();

    if (error) throw new Error(`shotsDB.update: ${error.message}`);
    return data;
  },

  /**
   * Actualizar solo el status
   */
  async updateStatus(shotId, status) {
    return this.update(shotId, { status });
  },

  /**
   * Guardar resultado de video + marcar como completed
   * Columnas reales: result_video_url, result_preview_url
   */
  async setVideoResult(shotId, videoUrl, previewUrl = null) {
    return this.update(shotId, {
      result_video_url:   videoUrl,
      result_preview_url: previewUrl || videoUrl,
      status:             'completed',
      error_message:      null,
    });
  },

  /**
   * Marcar error en un shot
   */
  async setError(shotId, errorMessage) {
    return this.update(shotId, {
      status:        'error',
      error_message: errorMessage,
    });
  },

  /**
   * Eliminar un shot
   */
  async delete(shotId) {
    // Borrar registros dependientes primero (evita 409 Conflict por FK)
    try { await supabase.from('token_usage').delete().eq('shot_id', shotId); } catch {}
    try { await supabase.from('dag_nodes').delete().eq('shot_id', shotId); } catch {}

    const { error } = await supabase
      .from('shots')
      .delete()
      .eq('id', shotId);

    if (error) throw new Error(`shotsDB.delete: ${error.message}`);
    return true;
  },
};

// ============================================================
// CHARACTER ASSETS
// Schema real: UNA fila por proyecto con 4 columnas de URL
//   view_front_url, view_three_quarter_url, view_profile_url, view_back_url
//   description, style_analysis
// NO tiene user_id, view_type, file_url
// ============================================================

// Mapeo de view keys usados en el código → columnas reales de la tabla
const VIEW_COLUMN_MAP = {
  front:            'view_front_url',
  three_quarter:    'view_three_quarter_url',
  profile:          'view_profile_url',
  back:             'view_back_url',
  // Alias comunes que el UI puede usar
  '3/4':            'view_three_quarter_url',
  'three-quarter':  'view_three_quarter_url',
};

export const characterAssetsDB = {

  /**
   * Obtener el asset del proyecto (un solo registro con las 4 vistas)
   */
  async getByProject(projectId) {
    const { data, error } = await supabase
      .from('character_assets')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) throw new Error(`characterAssetsDB.getByProject: ${error.message}`);
    return data;
  },

  /**
   * Crear o actualizar una vista específica del turnaround.
   * Si ya existe un registro para el proyecto, actualiza la columna.
   * Si no existe, crea uno nuevo.
   *
   * @param {string} projectId
   * @param {string} viewType - 'front' | 'three_quarter' | 'profile' | 'back'
   * @param {string} fileUrl  - URL pública del archivo
   */
  async setView(projectId, viewType, fileUrl) {
    const column = VIEW_COLUMN_MAP[viewType];
    if (!column) throw new Error(`characterAssetsDB.setView: viewType "${viewType}" no reconocido`);

    // Verificar si ya existe registro para este proyecto
    const existing = await this.getByProject(projectId);

    if (existing) {
      const { data, error } = await supabase
        .from('character_assets')
        .update({ [column]: fileUrl })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw new Error(`characterAssetsDB.setView update: ${error.message}`);
      return data;
    } else {
      const { data, error } = await supabase
        .from('character_assets')
        .insert({
          project_id: projectId,
          [column]:   fileUrl,
          view_front_url: column === 'view_front_url' ? fileUrl : '',
        })
        .select()
        .single();

      if (error) throw new Error(`characterAssetsDB.setView insert: ${error.message}`);
      return data;
    }
  },

  /**
   * Actualizar descripción del personaje
   */
  async setDescription(projectId, description) {
    const existing = await this.getByProject(projectId);

    if (existing) {
      const { data, error } = await supabase
        .from('character_assets')
        .update({ description })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw new Error(`characterAssetsDB.setDescription: ${error.message}`);
      return data;
    } else {
      const { data, error } = await supabase
        .from('character_assets')
        .insert({ project_id: projectId, description, view_front_url: '' })
        .select()
        .single();

      if (error) throw new Error(`characterAssetsDB.setDescription: ${error.message}`);
      return data;
    }
  },

  /**
   * Guardar análisis de estilo (output de LLM)
   */
  async setStyleAnalysis(projectId, styleAnalysis) {
    const existing = await this.getByProject(projectId);
    if (!existing) return null;

    const { data, error } = await supabase
      .from('character_assets')
      .update({ style_analysis: styleAnalysis })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw new Error(`characterAssetsDB.setStyleAnalysis: ${error.message}`);
    return data;
  },

  /**
   * Eliminar asset
   */
  async delete(assetId) {
    const { error } = await supabase
      .from('character_assets')
      .delete()
      .eq('id', assetId);

    if (error) throw new Error(`characterAssetsDB.delete: ${error.message}`);
    return true;
  },
};

// ============================================================
// DAG NODES
// Schema real: NO tiene updated_at ni llm_provider_id
//              SÍ tiene executed_at
// ============================================================

export const dagNodesDB = {

  /**
   * Crear registro de nodo
   */
  async create(shotId, nodeData) {
    const { data, error } = await supabase
      .from('dag_nodes')
      .insert({
        shot_id:         shotId,
        node_type:       nodeData.node_type,
        input_node_ids:  nodeData.input_node_ids || [],
        parameters:      nodeData.parameters || {},
        status:          'pending',
      })
      .select()
      .single();

    if (error) throw new Error(`dagNodesDB.create: ${error.message}`);
    return data;
  },

  /**
   * Actualizar status de un nodo
   */
  async updateStatus(nodeId, status) {
    const updates = { status };
    if (status === 'completed' || status === 'error') {
      updates.executed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('dag_nodes')
      .update(updates)
      .eq('id', nodeId)
      .select()
      .single();

    if (error) throw new Error(`dagNodesDB.updateStatus: ${error.message}`);
    return data;
  },

  /**
   * Guardar resultado exitoso
   */
  async setResult(nodeId, resultData) {
    const { data, error } = await supabase
      .from('dag_nodes')
      .update({
        status:            'completed',
        result:            resultData.result,
        execution_time_ms: resultData.execution_time_ms || null,
        tokens_used:       resultData.tokens_used || 0,
        cost_usd:          resultData.cost_usd || 0,
        executed_at:       new Date().toISOString(),
      })
      .eq('id', nodeId)
      .select()
      .single();

    if (error) throw new Error(`dagNodesDB.setResult: ${error.message}`);
    return data;
  },

  /**
   * Guardar error
   */
  async setError(nodeId, errorMessage) {
    const { data, error } = await supabase
      .from('dag_nodes')
      .update({
        status:        'error',
        error_message: errorMessage,
        executed_at:   new Date().toISOString(),
      })
      .eq('id', nodeId)
      .select()
      .single();

    if (error) throw new Error(`dagNodesDB.setError: ${error.message}`);
    return data;
  },

  /**
   * Obtener nodos de un shot
   */
  async getByShotId(shotId) {
    const { data, error } = await supabase
      .from('dag_nodes')
      .select('*')
      .eq('shot_id', shotId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`dagNodesDB.getByShotId: ${error.message}`);
    return data;
  },
};

// ============================================================
// TOKEN USAGE
// Schema real: service, operation, node_id, tokens_total, metadata
//              NO tiene 'provider' ni 'model' como columnas
// ============================================================

export const tokenUsageDB = {

  /**
   * Registrar uso de tokens
   * Consumido por CinematicNode.js:
   *   tokenUsageDB.log({ user_id, project_id, shot_id, node_id,
   *                      service, operation, tokens_input, tokens_output,
   *                      cost_usd, metadata: { model } })
   */
  async log(usageData) {
    const tokens_input  = usageData.tokens_input  || 0;
    const tokens_output = usageData.tokens_output || 0;

    const { data, error } = await supabase
      .from('token_usage')
      .insert({
        user_id:       usageData.user_id,
        project_id:    usageData.project_id || null,
        shot_id:       usageData.shot_id    || null,
        node_id:       usageData.node_id    || null,
        service:       usageData.service,
        operation:     usageData.operation,
        tokens_input,
        tokens_output,
        cost_usd:      usageData.cost_usd   || 0,
        metadata:      usageData.metadata   || {},
      })
      .select()
      .single();

    if (error) {
      console.warn(`tokenUsageDB.log: ${error.message}`);
      return null;
    }
    return data;
  },

  /**
   * Obtener totales por usuario agrupados por servicio
   */
  async getTotalsByUser(userId) {
    const { data, error } = await supabase
      .from('token_usage')
      .select('service, tokens_input, tokens_output, cost_usd')
      .eq('user_id', userId);

    if (error) {
      console.warn(`tokenUsageDB.getTotalsByUser: ${error.message}`);
      return {};
    }

    // Agrupar por servicio
    return (data || []).reduce((acc, row) => {
      if (!acc[row.service]) acc[row.service] = { tokens_input: 0, tokens_output: 0, cost_usd: 0 };
      acc[row.service].tokens_input  += row.tokens_input  || 0;
      acc[row.service].tokens_output += row.tokens_output || 0;
      acc[row.service].cost_usd      += row.cost_usd      || 0;
      return acc;
    }, {});
  },
};

// ============================================================
// PROMPT CACHE
// ============================================================

export const promptCacheDB = {

  /**
   * Buscar prompt cacheado por hash del input
   */
  async getByHash(inputHash) {
    const { data, error } = await supabase
      .from('prompt_cache')
      .select('*')
      .eq('input_hash', inputHash)
      .maybeSingle();

    if (error) {
      console.warn(`promptCacheDB.getByHash: ${error.message}`);
      return null;
    }

    // Incrementar hit_count si encontró resultado
    if (data) {
      try {
        await supabase
          .from('prompt_cache')
          .update({
            hit_count:    (data.hit_count || 0) + 1,
            last_used_at: new Date().toISOString(),
          })
          .eq('id', data.id);
      } catch {}
    }

    return data;
  },

  /**
   * Guardar prompt optimizado en cache
   */
  async set(inputHash, inputParams, optimizedPrompt, tokensOriginal = 0, tokensOptimized = 0) {
    const { data, error } = await supabase
      .from('prompt_cache')
      .upsert(
        {
          input_hash:       inputHash,
          input_params:     inputParams,
          optimized_prompt: optimizedPrompt,
          tokens_original:  tokensOriginal,
          tokens_optimized: tokensOptimized,
          hit_count:        0,
          last_used_at:     new Date().toISOString(),
        },
        { onConflict: 'input_hash' }
      )
      .select()
      .single();

    if (error) {
      console.warn(`promptCacheDB.set: ${error.message}`);
      return null;
    }
    return data;
  },

  /**
   * Obtener estadísticas del cache
   */
  async getStats() {
    const { data, error } = await supabase
      .from('prompt_cache')
      .select('hit_count, tokens_saved')
      .order('hit_count', { ascending: false });

    if (error) return { totalEntries: 0, totalHits: 0, totalTokensSaved: 0 };

    return {
      totalEntries:     data.length,
      totalHits:        data.reduce((sum, r) => sum + (r.hit_count || 0), 0),
      totalTokensSaved: data.reduce((sum, r) => sum + (r.tokens_saved || 0), 0),
    };
  },
};