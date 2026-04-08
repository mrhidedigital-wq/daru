// src/lib/supabase/client.js
import { createClient } from '@supabase/supabase-js';
import { safeStorageAdapter, checkLocalStorageSize } from '../storage/safeStorage';

const supabaseUrl  = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey  = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl)  throw new Error('Missing REACT_APP_SUPABASE_URL');
if (!supabaseKey)  throw new Error('Missing REACT_APP_SUPABASE_ANON_KEY');

// Verificar localStorage al arrancar — limpia si supera 3MB o está corrupto.
try { checkLocalStorageSize(); } catch { /* no bloquear la app si falla */ }

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession:   true,
    autoRefreshToken: true,
    // Usamos safeStorageAdapter en lugar de window.localStorage directamente.
    // Protege contra JSON corruptos (QuotaExceededError, SyntaxError) y monitorea tamaño.
    storage: safeStorageAdapter,
    detectSessionInUrl: false,
    lock: async (name, acquireTimeout, fn) => {
      // Si el browser soporta Web Locks, úsalo pero captura el AbortError silenciosamente
      if (typeof navigator !== 'undefined' && navigator.locks) {
        try {
          return await navigator.locks.request(
            name,
            { ifAvailable: false },
            fn
          );
        } catch (err) {
          // AbortError por 'steal' de otra tab — no es un error real, ignorar
          if (err?.name === 'AbortError') {
            console.warn('[Supabase] Web Lock preempted by another tab — reconectando...');
            return await fn();
          }
          throw err;
        }
      }
      // Fallback sin locks (dev mode, SSR, browsers antiguos)
      return await fn();
    },
  },
  realtime: {
    // Desactiva reconexiones agresivas que disparan múltiples lock requests
    params: {
      eventsPerSecond: 2,
    },
  },
});

export async function testConnection() {
  try {
    const { error } = await supabase.from('projects').select('count').limit(1);
    if (error) throw error;
    return { success: true, message: 'Supabase conectado' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

export default supabase;