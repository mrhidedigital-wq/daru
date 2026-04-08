import React, { useRef } from 'react';
import { ACCEPTED } from './frameUploaderConfig';

const C = {
  accent:  '#00A8E8',
  success: '#00D084',
  error:   '#FF4757',
  dim:     '#555555',
  border:  '#404040',
};

export default function TurnaroundSlot({ label, imageUrl, onFile, onClear, uploading }) {
  const inputRef = useRef();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
      <span style={{ fontSize: 8, color: C.dim, fontFamily: 'monospace', letterSpacing: '0.1em', textAlign: 'center' }}>
        {label}
      </span>
      <div
        onClick={() => !imageUrl && inputRef.current?.click()}
        style={{
          ...S.slot,
          borderColor: imageUrl ? C.success : C.border,
          cursor: imageUrl ? 'default' : 'pointer',
        }}
      >
        {uploading ? (
          <span style={{ color: C.accent, fontSize: 14 }}>⟳</span>
        ) : imageUrl ? (
          <>
            <img src={imageUrl} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <button onClick={e => { e.stopPropagation(); onClear(); }} style={S.clearOverlay}>✕</button>
          </>
        ) : (
          <span style={{ color: '#333', fontSize: 16 }}>+</span>
        )}
      </div>
      {imageUrl && (
        <button style={S.replaceBtn} onClick={() => inputRef.current?.click()}>
          ↑ REEMPLAZAR
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />
    </div>
  );
}

const S = {
  slot: {
    position: 'relative', height: 70, background: '#1A1A1A',
    border: '1px dashed', borderRadius: 4,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', transition: 'border-color 0.15s',
  },
  clearOverlay: {
    position: 'absolute', top: 3, right: 3,
    background: 'rgba(0,0,0,0.7)', border: 'none', color: C.error,
    fontSize: 10, cursor: 'pointer', borderRadius: 3, padding: '1px 4px', lineHeight: 1,
  },
  replaceBtn: {
    background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 3,
    color: C.dim, fontSize: 9, cursor: 'pointer', fontFamily: 'monospace',
    letterSpacing: '0.08em', padding: '3px 8px', alignSelf: 'flex-start',
  },
};
