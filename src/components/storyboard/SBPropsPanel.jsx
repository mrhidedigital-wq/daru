import React, { useState } from 'react';
import { C } from '../../services/assetUtils';

export default function SBPropsPanel({ frame, onApply, applying }) {
  const [input, setInput] = useState('');
  const [targetSubject, setTargetSubject] = useState('');

  const subjects = frame?.subjects || [];
  const props = frame?.props || [];
  const canApply = !!frame?.generatedImage;

  const handleAdd = () => {
    if (!input.trim() || !canApply) return;
    onApply(input.trim(), targetSubject || null);
    setInput('');
  };

  return (
    <div style={S.wrap}>
      {/* Props actuales */}
      {props.length > 0 && (
        <div style={S.section}>
          <div style={S.label}>ELEMENTOS ACTUALES</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {props.map((p, i) => (
              <span key={i} style={S.tag}>{p}</span>
            ))}
          </div>
        </div>
      )}

      {/* Agregar prop */}
      <div style={S.section}>
        <div style={S.label}>AGREGAR ELEMENTO</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="ej: café, maletín, sombrero..."
            style={S.input}
          />
        </div>
      </div>

      {/* A quién */}
      {subjects.length > 0 && (
        <div style={S.section}>
          <div style={S.label}>¿A QUIÉN?</div>
          <div style={S.grid2}>
            <button
              onClick={() => setTargetSubject('')}
              style={{ ...S.optBtn, ...(targetSubject === '' ? S.optBtnActive : {}) }}
            >
              A la escena
            </button>
            {subjects.map(sub => (
              <button
                key={sub.id}
                onClick={() => setTargetSubject(sub.label)}
                style={{ ...S.optBtn, ...(targetSubject === sub.label ? S.optBtnActive : {}) }}
              >
                {sub.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!canApply && (
        <div style={S.hint}>Genera un frame primero para poder agregar elementos.</div>
      )}

      <button
        onClick={handleAdd}
        disabled={!canApply || applying || !input.trim()}
        style={{
          ...S.applyBtn,
          opacity: !canApply || applying || !input.trim() ? 0.5 : 1,
          cursor: !canApply || applying || !input.trim() ? 'default' : 'pointer',
        }}
      >
        {applying ? '⟳ APLICANDO...' : 'AGREGAR A LA IMAGEN'}
      </button>
    </div>
  );
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 14 },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: '0.12em', fontFamily: 'monospace' },
  tag: {
    background: `${C.accent}15`, border: `1px solid ${C.accent}40`,
    borderRadius: 4, padding: '3px 8px', fontSize: 9, color: C.accent,
    fontFamily: 'monospace',
  },
  input: {
    flex: 1, background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 4, color: C.text, padding: '8px 10px',
    fontSize: 11, outline: 'none', fontFamily: 'monospace',
  },
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
    background: C.success, border: 'none', borderRadius: 6,
    color: '#fff', padding: '11px', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.1em', fontFamily: 'monospace', width: '100%',
    transition: 'opacity 0.2s',
  },
};
