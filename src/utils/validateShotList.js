// src/utils/validateShotList.js
//
// Valida la lista de tomas del flujo DaruConfigurator + ShotDirector.
// Schema esperado (Mundo A — formato original):
//   {
//     durationSec:  number,          // 4 | 5 | 6 | 7 | 8
//     start:  { shot: string, angle: string },
//     end:    { shot: string, angle: string },
//     camera: { motion: string, intensity: number },
//     focus?: "main" | "group"       // opcional
//   }
//
// Schema DaruStudio (Mundo B — formato de Supabase):
//   {
//     duration_seconds: number,
//     frame_start: { shot: string, angle: string, ... },
//     frame_end:   { shot: string, angle: string, ... },
//     transition:  { cameraMove: string, intensity: number, ... },
//   }
//
// Retorna: { ok: boolean, error: string, advertencias: string[] }
//   - ok: false solo si hay un error que impide generar
//   - error: descripción del bloqueo (vacío si ok=true)
//   - advertencias: array de avisos no bloqueantes

const SHOT_ORDER = [
  "gran_plano_general",
  "plano_general",
  "plano_entero",
  "plano_americano",
  "plano_medio",
  "primer_plano",
  "primerisimo_primer_plano",
];

const DURACIONES_VALIDAS = [4, 5, 6, 7, 8];

function idxShot(shotId) {
  const i = SHOT_ORDER.indexOf(shotId);
  return i === -1 ? 3 : i; // fallback → plano_americano
}

function clamp(n, min, max) {
  const x = Number(n);
  if (Number.isNaN(x)) return min;
  return Math.max(min, Math.min(x, max));
}

// ============================================================
// VALIDADOR CORE (formato original "Mundo A")
// ============================================================

export function validateShotList(shots, extrasCount = 0) {
  const advertencias = [];

  // ── Verificación de array ───────────────────────────────────
  if (!Array.isArray(shots) || shots.length === 0) {
    return {
      ok: false,
      error: "No hay tomas. Elige un preset (3 / 5 / 6) o añade al menos 1 toma.",
      advertencias: [],
    };
  }

  // ── Límite máximo ───────────────────────────────────────────
  if (shots.length > 7) {
    return {
      ok: false,
      error: "Máximo 7 tomas para evitar drift y mantener coherencia visual.",
      advertencias: [],
    };
  }

  // ── Validación por toma ─────────────────────────────────────
  for (let i = 0; i < shots.length; i++) {
    const s    = shots[i];
    const num  = i + 1;

    // Duración válida (ya no exige exactamente 4s)
    const dur = s.durationSec ?? 4;
    if (!DURACIONES_VALIDAS.includes(Number(dur))) {
      return {
        ok: false,
        error: `Toma ${num}: duración inválida (${dur}s). Valores permitidos: ${DURACIONES_VALIDAS.join(", ")}s.`,
        advertencias,
      };
    }

    // Encuadre inicio obligatorio
    if (!s.start?.shot || !s.start?.angle) {
      return {
        ok: false,
        error: `Toma ${num}: falta definir encuadre/ángulo de inicio.`,
        advertencias,
      };
    }

    // Encuadre fin obligatorio
    if (!s.end?.shot || !s.end?.angle) {
      return {
        ok: false,
        error: `Toma ${num}: falta definir encuadre/ángulo de fin.`,
        advertencias,
      };
    }

    // Movimiento de cámara obligatorio
    if (!s.camera?.motion) {
      return {
        ok: false,
        error: `Toma ${num}: falta definir movimiento de cámara.`,
        advertencias,
      };
    }

    const intensity    = clamp(s.camera?.intensity ?? 0.2, 0.1, 0.4);
    const endShotIdx   = idxShot(s.end.shot);
    const startShotIdx = idxShot(s.start.shot);
    const delta        = Math.abs(endShotIdx - startShotIdx);

    // ── Reglas de intensidad (advertencias, no bloqueos) ──────

    // Cierre muy cerrado con intensidad alta → advertencia
    if (endShotIdx >= idxShot("primerisimo_primer_plano") && intensity > 0.25) {
      advertencias.push(
        `Toma ${num}: intensidad alta (${intensity}) para un cierre en primerísimo plano. Recomendado ≤ 0.25.`
      );
    }

    // Salto grande con dolly e intensidad alta → advertencia
    if (
      delta >= 2 &&
      (s.camera.motion === "dolly_in" || s.camera.motion === "dolly_out") &&
      intensity > 0.25
    ) {
      advertencias.push(
        `Toma ${num}: salto grande de encuadre con dolly e intensidad alta (${intensity}). Puede generar drift. Recomendado ≤ 0.25.`
      );
    }

    // Duración larga con primerísimo plano → advertencia (no bloqueo)
    if (endShotIdx >= idxShot("primerisimo_primer_plano") && dur > 5) {
      advertencias.push(
        `Toma ${num}: primerísimo primer plano con duración larga (${dur}s). Puede verse forzado.`
      );
    }

    // Con extras, primer plano enfocado en grupo → advertencia
    if (
      extrasCount > 0 &&
      endShotIdx >= idxShot("primer_plano") &&
      s.focus === "group"
    ) {
      advertencias.push(
        `Toma ${num}: con personajes adicionales, un primer plano en grupo puede perder coherencia. Considera enfoque en protagonista.`
      );
    }
  }

  return { ok: true, error: "", advertencias };
}

// ============================================================
// ADAPTADOR PARA DARUSTUDIO (formato "Mundo B")
// Convierte shots del formato DaruStudio/Supabase al formato
// que espera validateShotList y ejecuta la validación.
//
// Uso en DaruStudio.jsx:
//   import { validateStudioShots } from '../utils/validateShotList';
//   const result = validateStudioShots(shots);
//   if (!result.ok) setError(result.error);
//   if (result.advertencias.length) setWarnings(result.advertencias);
// ============================================================

/**
 * Convierte UN shot del formato DaruStudio al formato del validador.
 *
 * DaruStudio:
 *   { duration_seconds, frame_start: { shot, angle }, frame_end: { shot, angle },
 *     transition: { cameraMove, intensity } }
 *
 * Validador:
 *   { durationSec, start: { shot, angle }, end: { shot, angle },
 *     camera: { motion, intensity } }
 */
function studioShotToValidator(shot) {
  return {
    durationSec: shot.duration_seconds ?? shot.durationSec ?? 4,
    start: {
      shot:  shot.frame_start?.shot  || '',
      angle: shot.frame_start?.angle || '',
    },
    end: {
      shot:  shot.frame_end?.shot  || '',
      angle: shot.frame_end?.angle || '',
    },
    camera: {
      motion:    shot.transition?.cameraMove || shot.transition?.motion || '',
      intensity: shot.transition?.intensity  ?? 0.2,
    },
    focus: shot.focus || undefined,
  };
}

/**
 * Valida un array de shots en formato DaruStudio.
 * Acepta tanto un solo shot como un array.
 *
 * @param {Object|Array} shots - Shot(s) en formato DaruStudio
 * @param {number} [extrasCount=0] - Cantidad de personajes extra
 * @returns {{ ok: boolean, error: string, advertencias: string[] }}
 */
export function validateStudioShots(shots, extrasCount = 0) {
  const arr = Array.isArray(shots) ? shots : [shots];
  const converted = arr.map(studioShotToValidator);
  return validateShotList(converted, extrasCount);
}

/**
 * Valida UN solo shot en formato DaruStudio.
 * Wrapper de conveniencia para validar antes de BUILD PROMPTS individual.
 *
 * @param {Object} shot - Shot en formato DaruStudio
 * @returns {{ ok: boolean, error: string, advertencias: string[] }}
 */
export function validateStudioShot(shot) {
  if (!shot) {
    return { ok: false, error: 'No hay shot seleccionado.', advertencias: [] };
  }
  const converted = studioShotToValidator(shot);
  return validateShotList([converted], 0);
}