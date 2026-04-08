// src/components/studio/QuickStartModal.jsx
// Modal de configuración Quick Start para crear secuencias predefinidas.
// Props:
//   presetKey         — clave del preset activo ('quick3' | 'pro5' | 'cinematic6') o null
//   existingShotsCount — número de shots existentes (para mostrar aviso)
//   modalShots        — array de shots editables
//   loading           — si el proceso de creación está en curso
//   onClose           — callback al cancelar / cerrar
//   onConfirm         — callback al confirmar la creación
//   onChangeDuration  — callback(idx, value) para cambiar duración de un shot

import React from 'react';

// ─── Constantes de presets ────────────────────────────────────
export const DURACIONES = [4, 5, 6, 7, 8];

export const LABEL_PLANO = {
  gran_plano_general:       'Gran plano general',
  plano_general:            'Plano general',
  plano_entero:             'Plano entero',
  plano_americano:          'Plano americano',
  plano_medio:              'Plano medio',
  primer_plano:             'Primer plano',
  primerisimo_primer_plano: 'P.P.P.',
};

export const LABEL_CAMARA = {
  static:    'Estática',
  dolly_in:  'Dolly in',
  dolly_out: 'Dolly out',
  pan_left:  'Pan izq.',
  pan_right: 'Pan der.',
  parallax:  'Parallax',
  tilt_up:   'Tilt arriba',
  tilt_down: 'Tilt abajo',
};

export const QUICK_PRESETS = {
  quick3: {
    label:       '⚡ RÁPIDO',
    descripcion: '3 tomas · Simple y efectivo',
    shots: [
      { shot_number: 1, name: 'Toma 001', duration_seconds: 4, frame_start: { shot: 'plano_general',   angle: 'frontal' }, frame_end: { shot: 'plano_general',   angle: 'frontal' }, transition: { cameraMove: 'parallax', intensity: 0.2  }, status: 'pending' },
      { shot_number: 2, name: 'Toma 002', duration_seconds: 4, frame_start: { shot: 'plano_americano', angle: 'frontal' }, frame_end: { shot: 'plano_medio',     angle: 'frontal' }, transition: { cameraMove: 'dolly_in', intensity: 0.22 }, status: 'pending' },
      { shot_number: 3, name: 'Toma 003', duration_seconds: 4, frame_start: { shot: 'primer_plano',    angle: 'frontal' }, frame_end: { shot: 'primer_plano',    angle: 'frontal' }, transition: { cameraMove: 'static',   intensity: 0.2  }, status: 'pending' },
    ],
  },
  pro5: {
    label:       '🎬 PRO',
    descripcion: '5 tomas · Comercial estándar',
    shots: [
      { shot_number: 1, name: 'Toma 001', duration_seconds: 4, frame_start: { shot: 'plano_general',   angle: 'frontal'          }, frame_end: { shot: 'plano_general',   angle: 'frontal'          }, transition: { cameraMove: 'parallax',  intensity: 0.2  }, status: 'pending' },
      { shot_number: 2, name: 'Toma 002', duration_seconds: 4, frame_start: { shot: 'plano_americano', angle: 'tres_cuartos_izq' }, frame_end: { shot: 'plano_americano', angle: 'tres_cuartos_izq' }, transition: { cameraMove: 'pan_right', intensity: 0.2  }, status: 'pending' },
      { shot_number: 3, name: 'Toma 003', duration_seconds: 4, frame_start: { shot: 'plano_medio',     angle: 'lateral_izq'     }, frame_end: { shot: 'primer_plano',    angle: 'frontal'          }, transition: { cameraMove: 'dolly_in',  intensity: 0.25 }, status: 'pending' },
      { shot_number: 4, name: 'Toma 004', duration_seconds: 4, frame_start: { shot: 'primer_plano',    angle: 'frontal'         }, frame_end: { shot: 'primer_plano',    angle: 'frontal'          }, transition: { cameraMove: 'pan_left',  intensity: 0.18 }, status: 'pending' },
      { shot_number: 5, name: 'Toma 005', duration_seconds: 4, frame_start: { shot: 'plano_general',   angle: 'frontal'         }, frame_end: { shot: 'plano_general',   angle: 'frontal'          }, transition: { cameraMove: 'dolly_out', intensity: 0.2  }, status: 'pending' },
    ],
  },
  cinematic6: {
    label:       '🎥 CINEMÁTICO',
    descripcion: '6 tomas · Producción premium',
    shots: [
      { shot_number: 1, name: 'Toma 001', duration_seconds: 4, frame_start: { shot: 'gran_plano_general', angle: 'frontal'          }, frame_end: { shot: 'plano_general',   angle: 'frontal'          }, transition: { cameraMove: 'dolly_in',  intensity: 0.2  }, status: 'pending' },
      { shot_number: 2, name: 'Toma 002', duration_seconds: 4, frame_start: { shot: 'plano_americano',    angle: 'tres_cuartos_der' }, frame_end: { shot: 'plano_americano', angle: 'tres_cuartos_der' }, transition: { cameraMove: 'pan_left',  intensity: 0.2  }, status: 'pending' },
      { shot_number: 3, name: 'Toma 003', duration_seconds: 4, frame_start: { shot: 'plano_medio',        angle: 'lateral_der'     }, frame_end: { shot: 'primer_plano',    angle: 'frontal'          }, transition: { cameraMove: 'dolly_in',  intensity: 0.25 }, status: 'pending' },
      { shot_number: 4, name: 'Toma 004', duration_seconds: 4, frame_start: { shot: 'primer_plano',       angle: 'frontal'         }, frame_end: { shot: 'primer_plano',    angle: 'frontal'          }, transition: { cameraMove: 'static',    intensity: 0.2  }, status: 'pending' },
      { shot_number: 5, name: 'Toma 005', duration_seconds: 4, frame_start: { shot: 'plano_medio',        angle: 'tres_cuartos_izq'}, frame_end: { shot: 'plano_americano', angle: 'tres_cuartos_izq' }, transition: { cameraMove: 'dolly_out', intensity: 0.2  }, status: 'pending' },
      { shot_number: 6, name: 'Toma 006', duration_seconds: 4, frame_start: { shot: 'plano_general',      angle: 'frontal'         }, frame_end: { shot: 'plano_general',   angle: 'frontal'          }, transition: { cameraMove: 'parallax',  intensity: 0.2  }, status: 'pending' },
    ],
  },
};

// ─── Componente ───────────────────────────────────────────────
export default function QuickStartModal({
  presetKey,
  existingShotsCount,
  modalShots,
  loading,
  onClose,
  onConfirm,
  onChangeDuration,
}) {
  if (!presetKey) return null;

  const preset = QUICK_PRESETS[presetKey];
  if (!preset) return null;

  const totalSeconds = modalShots.reduce((acc, s) => acc + (s.duration_seconds || 4), 0);

  return (
    <div style={s.overlay}>
      <div style={s.panel}>

        <div style={s.header}>
          <div>
            <div style={s.titulo}>{preset.label}</div>
            <div style={s.subtitulo}>{preset.descripcion}</div>
          </div>
          <button style={s.btnCerrar} onClick={onClose}>✕</button>
        </div>

        {existingShotsCount > 0 && (
          <div style={s.aviso}>
            ⚠ Este proyecto ya tiene <strong>{existingShotsCount} toma{existingShotsCount !== 1 ? 's' : ''}</strong>.
            Al confirmar se eliminarán y se crearán las nuevas.
          </div>
        )}

        <div style={s.lista}>
          <div style={s.listaHeader}>
            <span style={s.colToma}>TOMA</span>
            <span style={s.colPlano}>INICIO → FIN</span>
            <span style={s.colCamara}>CÁMARA</span>
            <span style={s.colDur}>DURACIÓN</span>
          </div>
          {modalShots.map((shot, idx) => (
            <div key={idx} style={s.fila}>
              <span style={s.numToma}>#{idx + 1}</span>
              <span style={s.infoPlano}>
                {LABEL_PLANO[shot.frame_start?.shot] || shot.frame_start?.shot}
                <span style={{ color: '#555', margin: '0 6px' }}>→</span>
                {LABEL_PLANO[shot.frame_end?.shot] || shot.frame_end?.shot}
              </span>
              <span style={s.infoCamara}>
                {LABEL_CAMARA[shot.transition?.cameraMove] || shot.transition?.cameraMove}
              </span>
              <select
                value={shot.duration_seconds}
                onChange={e => onChangeDuration(idx, e.target.value)}
                style={s.selectDur}
              >
                {DURACIONES.map(d => (
                  <option key={d} value={d}>{d}s</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div style={s.footer}>
          <span style={s.total}>
            Total: <strong style={{ color: '#DDD' }}>{totalSeconds}s</strong>
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={s.btnCancelar} onClick={onClose}>
              Cancelar
            </button>
            <button
              style={{ ...s.btnConfirmar, opacity: loading ? 0.6 : 1 }}
              disabled={loading}
              onClick={onConfirm}
            >
              {loading ? '⟳ Creando...' : '✓ Crear secuencia'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────
const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  panel: {
    background: '#2A2A2A',
    border: '1px solid #404040',
    borderRadius: 8,
    width: 580,
    maxWidth: '95vw',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '18px 20px 14px',
    borderBottom: '1px solid #383838',
  },
  titulo: {
    fontSize: 14,
    fontWeight: 700,
    color: '#DDDDDD',
    fontFamily: 'monospace',
    letterSpacing: '0.1em',
    marginBottom: 3,
  },
  subtitulo: {
    fontSize: 10,
    color: '#666',
    fontFamily: 'monospace',
  },
  btnCerrar: {
    background: 'transparent',
    border: 'none',
    color: '#666',
    fontSize: 16,
    cursor: 'pointer',
    padding: '2px 6px',
    lineHeight: 1,
  },
  aviso: {
    margin: '12px 20px 0',
    padding: '10px 14px',
    background: 'rgba(255,184,0,0.08)',
    border: '1px solid rgba(255,184,0,0.25)',
    borderRadius: 5,
    fontSize: 11,
    color: '#FFB800',
    fontFamily: 'monospace',
    lineHeight: 1.5,
  },
  lista: {
    padding: '14px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  listaHeader: {
    display: 'grid',
    gridTemplateColumns: '32px 1fr 90px 70px',
    gap: 8,
    padding: '0 0 8px',
    borderBottom: '1px solid #383838',
    marginBottom: 6,
  },
  colToma:   { fontSize: 9, color: '#555', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em' },
  colPlano:  { fontSize: 9, color: '#555', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em' },
  colCamara: { fontSize: 9, color: '#555', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em' },
  colDur:    { fontSize: 9, color: '#555', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em' },
  fila: {
    display: 'grid',
    gridTemplateColumns: '32px 1fr 90px 70px',
    gap: 8,
    alignItems: 'center',
    padding: '7px 0',
    borderBottom: '1px solid #2F2F2F',
  },
  numToma:    { fontSize: 10, color: '#00A8E8', fontFamily: 'monospace', fontWeight: 700 },
  infoPlano:  { fontSize: 10, color: '#AAAAAA', fontFamily: 'monospace' },
  infoCamara: { fontSize: 10, color: '#777',    fontFamily: 'monospace' },
  selectDur: {
    background: '#1A1A1A',
    border: '1px solid #444',
    borderRadius: 4,
    color: '#DDDDDD',
    padding: '4px 6px',
    fontSize: 11,
    fontFamily: 'monospace',
    cursor: 'pointer',
    outline: 'none',
    width: '100%',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 20px',
    borderTop: '1px solid #383838',
    background: '#242424',
  },
  total: { fontSize: 11, color: '#666', fontFamily: 'monospace' },
  btnCancelar: {
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: 5,
    color: '#888',
    padding: '8px 18px',
    fontSize: 11,
    fontFamily: 'monospace',
    cursor: 'pointer',
    letterSpacing: '0.06em',
  },
  btnConfirmar: {
    background: '#00A8E8',
    border: 'none',
    borderRadius: 5,
    color: '#fff',
    padding: '8px 22px',
    fontSize: 11,
    fontWeight: 700,
    fontFamily: 'monospace',
    cursor: 'pointer',
    letterSpacing: '0.08em',
  },
};
