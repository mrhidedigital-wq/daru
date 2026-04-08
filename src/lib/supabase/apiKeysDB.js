// src/lib/supabase/apiKeysDB.js
// CRUD para la tabla api_keys.
// Key names canónicos:
//   kling_api_key        → REACT_APP_KLING_API_KEY (Freepik/Kling)
//   seeddance_api_key    → REACT_APP_SEEDDANCE_API_KEY (AIMLAPI)
//   gemini_api_key       → GEMINI_API_KEY / REACT_APP_GEMINI_API_KEY
//   google_cloud_project → REACT_APP_GOOGLE_CLOUD_PROJECT (VEO)
//   vertex_access_token  → REACT_APP_VERTEX_ACCESS_TOKEN (VEO / expira en 60 min)

import { supabase } from './client';

export const apiKeysDB = {

  /**
   * Obtener todas las keys (para la UI de settings)
   * @returns {Promise<Record<string, { key_value: string, updated_at: string }>>}
   */
  async getAll() {
    const { data, error } = await supabase
      .from('api_keys')
      .select('key_name, key_value, updated_at');

    if (error) throw new Error(`apiKeysDB.getAll: ${error.message}`);

    // Convertir array a mapa { key_name: { key_value, updated_at } }
    return Object.fromEntries(
      (data || []).map(row => [row.key_name, { key_value: row.key_value, updated_at: row.updated_at }])
    );
  },

  /**
   * Obtener una key por nombre
   * @param {string} keyName
   * @returns {Promise<string|null>}
   */
  async get(keyName) {
    const { data, error } = await supabase
      .from('api_keys')
      .select('key_value, updated_at')
      .eq('key_name', keyName)
      .maybeSingle();

    if (error) throw new Error(`apiKeysDB.get: ${error.message}`);
    return data || null;
  },

  /**
   * Guardar (upsert) una key
   * @param {string} keyName
   * @param {string} keyValue
   */
  async set(keyName, keyValue) {
    const { error } = await supabase
      .from('api_keys')
      .upsert(
        { key_name: keyName, key_value: keyValue },
        { onConflict: 'key_name' }
      );

    if (error) throw new Error(`apiKeysDB.set: ${error.message}`);
  },

  /**
   * Verificar si el vertex_access_token tiene menos de 60 minutos
   * @returns {Promise<{ token: string|null, minsLeft: number|null, expired: boolean }>}
   */
  async getVertexTokenStatus() {
    const row = await this.get('vertex_access_token');
    if (!row || !row.key_value) return { token: null, minsLeft: null, expired: true };

    const ageMs   = Date.now() - new Date(row.updated_at).getTime();
    const minsLeft = Math.max(0, 60 - ageMs / 60_000);
    const expired  = minsLeft <= 0;

    return {
      token:    expired ? null : row.key_value,
      minsLeft: Math.floor(minsLeft),
      expired,
      updatedAt: row.updated_at,
    };
  },
};

export default apiKeysDB;
