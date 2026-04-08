// src/lib/supabase/storage.js
// Upload / download helpers for Supabase Storage.
// Tres buckets públicos:
//   character-assets  → turnaround del personaje (front, 3/4, profile, back)
//   shot-results      → frames preview e imágenes/videos generados
//   project-exports   → videos finales concatenados por FFmpeg
//
// IMPORTANTE: Los buckets deben estar creados en Supabase Dashboard
// con acceso público (o con políticas RLS que permitan lectura pública).

import { supabase } from './client';

// ─── Helpers ───────────────────────────────────────────────

/**
 * Sube un archivo a un bucket y retorna la URL pública.
 * Si ya existe un archivo en la misma ruta, lo sobreescribe (upsert).
 *
 * @param {string} bucket   - Nombre del bucket
 * @param {string} path     - Ruta dentro del bucket (e.g. "userId/projectId/front.png")
 * @param {Blob|File} file  - Archivo a subir
 * @param {string} [contentType] - MIME type (se detecta automáticamente si es File)
 * @returns {string} URL pública del archivo
 */
async function uploadFile(bucket, path, file, contentType) {
  const mime = contentType || file.type || 'application/octet-stream';

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: mime,
    });

  if (error) throw new Error(`Storage upload (${bucket}/${path}): ${error.message}`);

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  if (!urlData?.publicUrl) {
    throw new Error(`Storage getPublicUrl failed for ${bucket}/${path}`);
  }

  // Agregar timestamp para cache-busting en el browser
  return `${urlData.publicUrl}?t=${Date.now()}`;
}

/**
 * Elimina un archivo de un bucket.
 *
 * @param {string} bucket - Nombre del bucket
 * @param {string} path   - Ruta del archivo
 */
async function deleteFile(bucket, path) {
  const { error } = await supabase.storage
    .from(bucket)
    .remove([path]);

  if (error) {
    console.warn(`Storage delete (${bucket}/${path}): ${error.message}`);
  }
}

/**
 * Detecta la extensión correcta para un archivo.
 */
function getExtension(file) {
  if (file.name) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext) return ext;
  }
  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/png':  'png',
    'image/webp': 'webp',
    'image/gif':  'gif',
    'video/mp4':  'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  };
  return mimeMap[file.type] || 'bin';
}

// ============================================================
// CHARACTER STORAGE
// Bucket: character-assets
// Ruta:   {userId}/{projectId}/{viewType}.{ext}
// ============================================================

export const characterStorage = {

  /**
   * Sube una vista del turnaround del personaje.
   * Consumido por FrameUploader.jsx:
   *   characterStorage.uploadView(userId, projectId, file, 'front')
   *
   * @param {string} userId
   * @param {string} projectId
   * @param {File}   file      - Imagen del turnaround
   * @param {string} viewType  - 'front' | 'three_quarter' | 'profile' | 'back'
   * @returns {string} URL pública
   */
  async uploadView(userId, projectId, file, viewType) {
    const ext  = getExtension(file);
    const path = `${userId}/${projectId}/${viewType}.${ext}`;
    return uploadFile('character-assets', path, file);
  },

  /**
   * Elimina una vista del turnaround.
   */
  async deleteView(userId, projectId, viewType) {
    // No sabemos la extensión exacta, intentamos las comunes
    const extensions = ['jpg', 'png', 'webp'];
    for (const ext of extensions) {
      await deleteFile('character-assets', `${userId}/${projectId}/${viewType}.${ext}`);
    }
  },

  /**
   * Obtiene la URL pública de una vista (sin subir).
   */
  getViewUrl(userId, projectId, viewType, ext = 'png') {
    const { data } = supabase.storage
      .from('character-assets')
      .getPublicUrl(`${userId}/${projectId}/${viewType}.${ext}`);
    return data?.publicUrl || null;
  },
};

// ============================================================
// SHOT STORAGE
// Bucket: shot-results
// Ruta imágenes: {userId}/{projectId}/{shotId}/preview.{ext}
// Ruta videos:   {userId}/{projectId}/{shotId}/video.{ext}
// ============================================================

export const shotStorage = {

  /**
   * Sube una imagen de preview de un shot (frame generado por ImageRenderNode
   * o frame subido por el usuario).
   * Consumido por FrameUploader.jsx:
   *   shotStorage.uploadPreview(userId, projectId, shotId, blob)
   *
   * @param {string}    userId
   * @param {string}    projectId
   * @param {string}    shotId
   * @param {Blob|File} file
   * @returns {string} URL pública
   */
  async uploadPreview(userId, projectId, shotId, file) {
    const ext  = getExtension(file);
    const path = `${userId}/${projectId}/${shotId}/preview.${ext}`;
    return uploadFile('shot-results', path, file);
  },

  /**
   * Sube un video generado o un video de referencia de movimiento.
   * Consumido por FrameUploader.jsx (motion reference):
   *   shotStorage.uploadVideo(userId, projectId, shotId, blob)
   * También consumible por VideoRenderNode si necesita persistir resultado.
   *
   * @param {string}    userId
   * @param {string}    projectId
   * @param {string}    shotId
   * @param {Blob|File} file
   * @returns {string} URL pública
   */
  async uploadVideo(userId, projectId, shotId, file) {
    const ext  = getExtension(file);
    const path = `${userId}/${projectId}/${shotId}/video.${ext}`;
    return uploadFile('shot-results', path, file);
  },

  /**
   * Elimina todos los archivos de un shot.
   */
  async deleteShot(userId, projectId, shotId) {
    const { data: files } = await supabase.storage
      .from('shot-results')
      .list(`${userId}/${projectId}/${shotId}`);

    if (files?.length) {
      const paths = files.map(f => `${userId}/${projectId}/${shotId}/${f.name}`);
      await supabase.storage.from('shot-results').remove(paths);
    }
  },
};

// ============================================================
// EXPORT STORAGE
// Bucket: project-exports
// Ruta:   {userId}/{projectId}/export_{timestamp}.mp4
//
// Nota: El upload real del export lo hace server.js con service role.
// Estos helpers son para el frontend (descarga, listado, limpieza).
// ============================================================

export const exportStorage = {

  /**
   * Obtiene la URL pública de un export por su path.
   *
   * @param {string} storagePath - Path retornado por server.js
   * @returns {string} URL pública
   */
  getUrl(storagePath) {
    const { data } = supabase.storage
      .from('project-exports')
      .getPublicUrl(storagePath);
    return data?.publicUrl || null;
  },

  /**
   * Lista los exports disponibles de un proyecto.
   *
   * @param {string} userId
   * @param {string} projectId
   * @returns {Array} Lista de archivos
   */
  async listExports(userId, projectId) {
    const { data, error } = await supabase.storage
      .from('project-exports')
      .list(`${userId}/${projectId}`, {
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) {
      console.warn(`exportStorage.listExports: ${error.message}`);
      return [];
    }
    return data || [];
  },

  /**
   * Elimina un export específico.
   */
  async deleteExport(storagePath) {
    await deleteFile('project-exports', storagePath);
  },
};