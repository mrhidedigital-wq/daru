import React from 'react';
import { C } from '../../services/assetUtils';
import TurnaroundSlot from '../studio/TurnaroundSlot';

const VIEWS = [
  { key: 'frontal',      label: 'FRONTAL' },
  { key: 'lateral_izq',  label: 'LAT. IZQ' },
  { key: 'lateral_der',  label: 'LAT. DER' },
  { key: 'perfil',       label: 'PERFIL' },
  { key: 'espalda',      label: 'ESPALDA' },
];

export default function SBTurnaround({
  subject,
  generatingViews,
  onGenerateViews,
  onFileUpload,
  onClear,
}) {
  const selectedViews = subject.selectedViews || ['frontal'];
  const turnaround = subject.turnaround || {};

  const toggleView = (key) => {
    const next = selectedViews.includes(key)
      ? selectedViews.filter(k => k !== key)
      : [...selectedViews, key];
    onFileUpload('selectedViews', next);
  };

  return (
    <div style={S.wrap}>
      <div style={S.label}>VISTAS A GENERAR</div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
        {VIEWS.map(v => (
          <button
            key={v.key}
            onClick={() => toggleView(v.key)}
            style={{
              ...S.viewToggle,
              ...(selectedViews.includes(v.key) ? S.viewToggleActive : {}),
            }}
          >
            {selectedViews.includes(v.key) ? '☑' : '☐'} {v.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => onGenerateViews(selectedViews)}
        disabled={generatingViews || selectedViews.length === 0}
        style={{
          ...S.generateBtn,
          opacity: generatingViews || selectedViews.length === 0 ? 0.5 : 1,
          cursor: generatingViews || selectedViews.length === 0 ? 'default' : 'pointer',
        }}
      >
        {generatingViews ? '⟳ GENERANDO...' : 'GENERAR VISTAS SELECCIONADAS'}
      </button>

      {/* Slots de vistas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginTop: 6 }}>
        {VIEWS.map(v => (
          <TurnaroundSlot
            key={v.key}
            label={v.label}
            imageUrl={turnaround[v.key] || null}
            uploading={generatingViews && selectedViews.includes(v.key) && !turnaround[v.key]}
            onFile={file => onFileUpload(v.key, file)}
            onClear={() => onClear(v.key)}
          />
        ))}
      </div>
    </div>
  );
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 },
  label: { fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: '0.12em', fontFamily: 'monospace' },
  viewToggle: {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.muted, padding: '4px 8px', fontSize: 9, cursor: 'pointer',
    fontFamily: 'monospace', transition: 'all 0.1s',
  },
  viewToggleActive: {
    background: `${C.success}15`, borderColor: C.success, color: C.success,
  },
  generateBtn: {
    background: `${C.success}20`, border: `1px solid ${C.success}`,
    borderRadius: 5, color: C.success, padding: '8px', fontSize: 9,
    fontWeight: 700, letterSpacing: '0.08em', fontFamily: 'monospace',
    width: '100%', transition: 'opacity 0.2s',
  },
};
