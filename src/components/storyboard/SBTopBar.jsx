import React from 'react';
import { C } from '../../services/assetUtils';

export default function SBTopBar({ projectName, resolution, onResolutionChange, onNewFrame, onNavigateBack, frameCount }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      height: 48, background: C.panel,
      borderBottom: `1px solid ${C.border}`,
      padding: '0 16px', flexShrink: 0,
    }}>
      <button style={S.btn} onClick={onNavigateBack}>← VOLVER</button>

      <div style={{ width: 1, height: 20, background: C.border }} />

      <div style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: '0.14em', fontFamily: 'monospace' }}>
        🎬 STORYBOARD STUDIO
      </div>

      {projectName && (
        <div style={{ fontSize: 10, color: C.muted, fontFamily: 'monospace' }}>/ {projectName}</div>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ fontSize: 9, color: C.muted, fontFamily: 'monospace', marginRight: 4 }}>
        {frameCount} frame{frameCount !== 1 ? 's' : ''}
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        {[{ value: '16:9', label: 'LANDSCAPE' }, { value: '9:16', label: 'REEL' }].map(r => (
          <button
            key={r.value}
            onClick={() => onResolutionChange(r.value)}
            style={{
              ...S.btn,
              background: resolution === r.value ? C.accent : 'transparent',
              color: resolution === r.value ? '#fff' : C.muted,
              borderColor: resolution === r.value ? C.accent : C.border,
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 20, background: C.border }} />

      <button
        onClick={onNewFrame}
        style={{ ...S.btn, background: C.accent, color: '#fff', borderColor: C.accent }}
      >
        + FRAME
      </button>
    </div>
  );
}

const S = {
  btn: {
    background: 'transparent',
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    color: C.muted,
    padding: '5px 12px',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.1em',
    cursor: 'pointer',
    fontFamily: 'monospace',
    transition: 'all 0.15s',
  },
};
