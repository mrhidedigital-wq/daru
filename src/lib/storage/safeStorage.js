// src/lib/storage/safeStorage.js
// Utilidades seguras para localStorage: auto-recuperación, límite de tamaño y monitoreo.

const SIZE_LIMIT_BYTES = 3 * 1024 * 1024; // 3 MB — umbral de limpieza
const MAX_VALUE_BYTES  = 512 * 1024;       // 512 KB — valor individual máximo permitido

// ─── helpers internos ───────────────────────────────────────────────────────

function byteSize(str) {
  // Cada carácter JS puede ocupar 1-4 bytes en UTF-16 storage; aproximamos con 2.
  return str ? str.length * 2 : 0;
}

function getTotalSize() {
  try {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const val = localStorage.getItem(key) || '';
      total += byteSize(key) + byteSize(val);
    }
    return total;
  } catch {
    return 0;
  }
}

function getAllEntries() {
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const val = localStorage.getItem(key) || '';
      entries.push({ key, size: byteSize(key) + byteSize(val) });
    }
  } catch { /* ignorar */ }
  return entries;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Lee un valor del localStorage de forma segura.
 * Si el JSON está corrupto limpia la key automáticamente y devuelve el default.
 */
export function safeGet(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;

    // Si parece JSON, parsear; si no, devolver como string.
    if (raw.trimStart().startsWith('{') || raw.trimStart().startsWith('[')) {
      return JSON.parse(raw);
    }
    return raw;
  } catch (err) {
    console.warn(`[safeStorage] Key "${key}" corrupta — limpiando.`, err.message);
    safeRemove(key);
    return defaultValue;
  }
}

/**
 * Guarda un valor en localStorage de forma segura.
 * - Rechaza valores > MAX_VALUE_BYTES (datos pesados deben ir a Supabase).
 * - Ejecuta checkLocalStorageSize() después de cada escritura.
 * - Captura QuotaExceededError y limpia espacio automáticamente.
 */
export function safeSet(key, value) {
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);

    if (byteSize(serialized) > MAX_VALUE_BYTES) {
      console.warn(
        `[safeStorage] Valor para "${key}" supera ${MAX_VALUE_BYTES / 1024}KB — ` +
        'no se guarda en localStorage. Usa Supabase para datos pesados.'
      );
      return false;
    }

    localStorage.setItem(key, serialized);
    checkLocalStorageSize();
    return true;
  } catch (err) {
    if (err?.name === 'QuotaExceededError' || err?.code === 22) {
      console.warn(`[safeStorage] QuotaExceededError al escribir "${key}" — liberando espacio...`);
      checkLocalStorageSize(true); // forzar limpieza
      try {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        localStorage.setItem(key, serialized);
        return true;
      } catch {
        console.warn(`[safeStorage] No se pudo guardar "${key}" incluso después de limpiar.`);
      }
    } else {
      console.warn(`[safeStorage] Error escribiendo "${key}":`, err.message);
    }
    return false;
  }
}

/**
 * Elimina una key de localStorage de forma segura.
 */
export function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[safeStorage] Error eliminando "${key}":`, err.message);
  }
}

/**
 * Intenta parsear el valor de una key; si está corrupto, limpia y retorna null.
 * Útil para reemplazar llamadas directas a JSON.parse(localStorage.getItem(key)).
 */
export function safeParse(key, defaultValue = null) {
  return safeGet(key, defaultValue);
}

/**
 * Monitoreo de tamaño de localStorage.
 * - Calcula el total usado.
 * - Si supera SIZE_LIMIT_BYTES (o si forceClean=true), elimina las keys más pesadas
 *   que NO sean de autenticación de Supabase ni preferencias críticas de la app.
 *
 * @param {boolean} forceClean - Si true, limpia aunque no se supere el límite.
 * @returns {{ usedBytes: number, usedMB: string, cleaned: string[] }}
 */
export function checkLocalStorageSize(forceClean = false) {
  const used = getTotalSize();
  const usedMB = (used / (1024 * 1024)).toFixed(2);

  if (used < SIZE_LIMIT_BYTES && !forceClean) {
    return { usedBytes: used, usedMB, cleaned: [] };
  }

  console.warn(
    `[safeStorage] localStorage al ${usedMB}MB — iniciando limpieza automática...`
  );

  // Keys protegidas: sesión de Supabase y preferencias pequeñas de la app.
  const PROTECTED_PREFIXES = [
    'sb-',          // sesión de Supabase (sb-<projectRef>-auth-token, etc.)
    'supabase',
    'daru_shot_mode',
    'daru_speech_rate',
  ];

  const isProtected = (key) =>
    PROTECTED_PREFIXES.some((prefix) => key.startsWith(prefix));

  // Ordenar por tamaño descendente y limpiar las más pesadas primero.
  const entries = getAllEntries()
    .filter((e) => !isProtected(e.key))
    .sort((a, b) => b.size - a.size);

  const cleaned = [];
  for (const entry of entries) {
    if (getTotalSize() < SIZE_LIMIT_BYTES && !forceClean) break;
    safeRemove(entry.key);
    cleaned.push(entry.key);
    console.warn(`[safeStorage] Key eliminada por tamaño: "${entry.key}" (${(entry.size / 1024).toFixed(1)}KB)`);
  }

  const finalUsed = getTotalSize();
  console.info(
    `[safeStorage] Limpieza completada. ` +
    `Antes: ${usedMB}MB → Después: ${(finalUsed / (1024 * 1024)).toFixed(2)}MB. ` +
    `Keys eliminadas: ${cleaned.length}`
  );

  return { usedBytes: finalUsed, usedMB: (finalUsed / (1024 * 1024)).toFixed(2), cleaned };
}

/**
 * Adaptador de storage compatible con la interfaz que espera Supabase:
 * { getItem, setItem, removeItem }
 *
 * Úsalo como `storage` en createClient() para que Supabase también
 * quede protegido contra JSON corruptos.
 */
export const safeStorageAdapter = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      console.warn(`[safeStorage] Error leyendo key Supabase "${key}":`, err.message);
      return null;
    }
  },

  setItem(key, value) {
    try {
      // Supabase guarda el token como string; lo escribimos directamente
      // pero primero verificamos que no esté corrupto (JSON válido si aplica).
      if (value && (value.startsWith('{') || value.startsWith('['))) {
        JSON.parse(value); // lanza si está mal formado antes de guardar
      }
      localStorage.setItem(key, value);
      checkLocalStorageSize();
    } catch (err) {
      if (err instanceof SyntaxError) {
        console.warn(`[safeStorage] Supabase intentó guardar JSON malformado en "${key}" — ignorado.`);
      } else if (err?.name === 'QuotaExceededError' || err?.code === 22) {
        console.warn(`[safeStorage] QuotaExceededError al guardar sesión Supabase — liberando espacio...`);
        checkLocalStorageSize(true);
        try { localStorage.setItem(key, value); } catch { /* no se pudo, la sesión se perderá */ }
      } else {
        console.warn(`[safeStorage] Error guardando "${key}":`, err.message);
      }
    }
  },

  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn(`[safeStorage] Error eliminando "${key}":`, err.message);
    }
  },
};
