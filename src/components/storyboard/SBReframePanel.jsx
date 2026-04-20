import React, { useState } from 'react';
import { C, PLANOS, ANGULOS_H, ANGULOS_V } from '../../services/assetUtils';

export default function SBReframePanel({ frame, onApply, applying }) {
  const [shotType, setShotType] = useState(frame?.shotType || 'plano_medio');
  const [angleH, setAngleH] = useState(frame?.angleH || 'frontal');
  const [angleV, setAngleV] = useState(frame?.angleV || 'normal');
  const [target, setTarget] = useState(frame?.reframeTarget || '');

  const subjects = frame?.subjects || [];
  const canApply = !!frame?.generatedImage;

  return (
    <div style={S.wrap}>
      <div style={S.section}>
        <div style={S.label}>TIPO DE PLANO</div>
        <div style={S.grid2}>
          {PLANOS.map(p => (
            <button
              key={p.value}
              onClick={() => setShotType(p.value)}
              style={{ ...S.optBtn, ...(shotType === p.value ? S.optBtnActive : {}) }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div style={S.section}>
        <div style={S.label}>ÁNGULO HORIZONTAL</div>
        <div style={S.grid2}>
          {ANGULOS_H.map(a => (
            <button
              key={a.value}
              onClick={() => setAngleH(a.value)}
              style={{ ...S.optBtn, ...(angleH === a.value ? S.optBtnActive : {}) }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div style={S.section}>
        <div style={S.label}>ÁNGULO VERTICAL</div>
        <div style={S.grid2}>
          {ANGULOS_V.map(a => (
            <button
              key={a.value}
              onClick={() => setAngleV(a.value)}
              style={{ ...S.optBtn, ...(angleV === a.value ? S.optBtnActive : {}) }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {subjects.length > 0 && (
        <div style={S.section}>
          <div style={S.label}>ENFOCAR EN</div>
          <div style={S.grid2}>
            <button
              onClick={() => setTarget('')}
              style={{ ...S.optBtn, ...(target === '' ? S.optBtnActive : {}) }}
            >
              General
            </button>
            {subjects.map(sub => (
              <button
                key={sub.id}
                onClick={() => setTarget(sub.label)}
                style={{ ...S.optBtn, ...(target === sub.label ? S.optBtnActive : {}) }}
              >
                {sub.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!canApply && (
        <div style={S.hint}>Genera un frame primero para poder reencuadrarlo.</div>
      )}

      <button
        onClick={() => onApply(shotType, angleH, angleV, target || null)}
        disabled={!canApply || applying}
        style={{
          ...S.applyBtn,
          opacity: !canApply || applying ? 0.5 : 1,
          cursor: !canApply || applying ? 'default' : 'pointer',
        }}
      >
        {applying ? '⟳ APLICANDO...' : 'APLICAR REENCUADRE'}
      </button>
    </div>
  );
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 14 },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: '0.12em', fontFamily: 'monospace' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 },
  optBtn: {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.muted, padding: '6px 8px', fontSize: 9, cursor: 'pointer',
    fontFamily: 'monospace', letterSpacing: '0.06em', transition: 'all 0.1s',
  },
  optBtnActive: {
    background: `${C.accent}20`, borderColor: C.accent, color: C.accent,
  },
  hint: { fontSize: 9, color: C.dim, fontFamily: 'monospace', textAlign: 'center', padding: '4px 0' },
  applyBtn: {
    background: C.accent, border: 'none', borderRadius: 6,
    color: '#fff', padding: '11px', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.1em', fontFamily: 'monospace', width: '100%',
    transition: 'opacity 0.2s',
  },
};
