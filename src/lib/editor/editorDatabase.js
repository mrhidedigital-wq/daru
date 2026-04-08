// src/lib/editor/editorDatabase.js
// CRUD completo para las tablas del Editor.
// Sigue el mismo patrón que database.js del Studio.

import { supabase } from '../supabase/client';

// ============================================================
// editSessionsDB — Sesiones de edición
// ============================================================

export const editSessionsDB = {
  async create(userId, data) {
    const { data: record, error } = await supabase
      .from('edit_sessions')
      .insert({
        user_id:      userId,
        project_id:   data.project_id || null,
        name:         data.name || 'Untitled Edit',
        media_type:   data.media_type,
        original_url: data.original_url,
        current_url:  data.original_url,
        metadata:     data.metadata || {},
      })
      .select()
      .single();
    if (error) throw error;
    return record;
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('edit_sessions')
      .select('*, edit_operations(*), edit_elements(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async listByUser(userId, limit = 20) {
    const { data, error } = await supabase
      .from('edit_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('edit_sessions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateCurrentVersion(id, currentUrl, versionNumber, sceneAnalysis = null) {
    const updates = {
      current_url:     currentUrl,
      current_version: versionNumber,
      updated_at:      new Date().toISOString(),
    };
    if (sceneAnalysis) updates.scene_analysis = sceneAnalysis;
    return this.update(id, updates);
  },

  async delete(id) {
    const { error } = await supabase.from('edit_sessions').delete().eq('id', id);
    if (error) throw error;
  },
};

// ============================================================
// editOperationsDB — Historial de ediciones
// ============================================================

export const editOperationsDB = {
  async create(sessionId, data) {
    const { data: record, error } = await supabase
      .from('edit_operations')
      .insert({
        session_id:      sessionId,
        version_number:  data.version_number,
        instruction:     data.instruction,
        operation_type:  data.operation_type || 'pending',
        edit_order:      data.edit_order || null,
        preservation:    data.preservation || null,
        composed_prompt: data.composed_prompt || null,
        provider:        data.provider || null,
        result_url:      data.result_url || null,
        original_url:    data.original_url || null,
        validation:      data.validation || null,
        score:           data.score || null,
        cost_usd:        data.cost_usd || 0,
        tokens_used:     data.tokens_used || 0,
        status:          data.status || 'pending',
        execution_time_ms: data.execution_time_ms || null,
      })
      .select()
      .single();
    if (error) throw error;
    return record;
  },

  async listBySession(sessionId) {
    const { data, error } = await supabase
      .from('edit_operations')
      .select('*')
      .eq('session_id', sessionId)
      .order('version_number', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async updateResult(id, result) {
    const { data, error } = await supabase
      .from('edit_operations')
      .update({
        result_url:     result.result_url,
        validation:     result.validation || null,
        score:          result.score || null,
        cost_usd:       result.cost_usd || 0,
        tokens_used:    result.tokens_used || 0,
        status:         result.status || 'completed',
        provider:       result.provider || null,
        execution_time_ms: result.execution_time_ms || null,
        error_message:  result.error_message || null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async rollback(id) {
    const { data, error } = await supabase
      .from('edit_operations')
      .update({ status: 'rolled_back' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

// ============================================================
// editElementsDB — Elementos de referencia
// ============================================================

export const editElementsDB = {
  async upsert(sessionId, elementIndex, data) {
    const { data: record, error } = await supabase
      .from('edit_elements')
      .upsert({
        session_id:     sessionId,
        element_index:  elementIndex,
        name:           data.name || `Element ${elementIndex}`,
        description:    data.description || null,
        image_url:      data.image_url,
        reference_urls: data.reference_urls || [],
      }, { onConflict: 'session_id,element_index' })
      .select()
      .single();
    if (error) throw error;
    return record;
  },

  async listBySession(sessionId) {
    const { data, error } = await supabase
      .from('edit_elements')
      .select('*')
      .eq('session_id', sessionId)
      .order('element_index', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async delete(sessionId, elementIndex) {
    const { error } = await supabase
      .from('edit_elements')
      .delete()
      .eq('session_id', sessionId)
      .eq('element_index', elementIndex);
    if (error) throw error;
  },

  async deleteAll(sessionId) {
    const { error } = await supabase
      .from('edit_elements')
      .delete()
      .eq('session_id', sessionId);
    if (error) throw error;
  },
};

// ============================================================
// editorStorage — Upload a Supabase Storage
// ============================================================

export const editorStorage = {
  bucket: 'editor-assets',

  async upload(userId, sessionId, file, filename) {
    const ext  = filename?.split('.').pop() || 'png';
    const path = `${userId}/${sessionId}/${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from(this.bucket)
      .upload(path, file, { cacheControl: '3600', upsert: true });
    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from(this.bucket)
      .getPublicUrl(data.path);

    return `${urlData.publicUrl}?t=${Date.now()}`;
  },

  async uploadBase64(userId, sessionId, base64Data, mimeType = 'image/png') {
    const ext  = mimeType.split('/')[1] || 'png';
    const path = `${userId}/${sessionId}/${Date.now()}.${ext}`;

    // base64 → Blob
    const byteChars = atob(base64Data);
    const byteNums  = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNums)], { type: mimeType });

    const { data, error } = await supabase.storage
      .from(this.bucket)
      .upload(path, blob, { cacheControl: '3600', upsert: true, contentType: mimeType });
    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from(this.bucket)
      .getPublicUrl(data.path);

    return `${urlData.publicUrl}?t=${Date.now()}`;
  },

  async delete(path) {
    const { error } = await supabase.storage.from(this.bucket).remove([path]);
    if (error) throw error;
  },
};