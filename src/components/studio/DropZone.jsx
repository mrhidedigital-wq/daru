import React, { useState, useRef, useCallback } from 'react';
import { ACCEPTED } from './frameUploaderConfig';

const C = {
  accent:  '#00A8E8',
  success: '#00D084',
  error:   '#FF4757',
  muted:   '#888888',
  dim:     '#555555',
  border:  '#404040',
};

export default function DropZone({ label, sublabel, imageUrl, onFile, onClear, uploading, disabled }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }, [disabled, onFile]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = '';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
      <div style={S.header}>
        <span style={S.label}>{label}</span>
        {imageUrl && !uploading && (
          <button style={S.clearBtn} onClick={onClear}>✕ LIMPIAR</button>
        )}
      </div>

      <div
        onClick={() => !disabled && !imageUrl && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          ...S.zone,
          borderColor: dragging ? C.accent : imageUrl ? C.success : C.border,
          background: dragging ? 'rgba(0,168,232,0.05)' : '#1A1A1A',
          cursor: disabled || imageUrl ? 'default' : 'pointer',
        }}
      >
        {uploading ? (
          <div style={S.uploading}>
            <span style={{ color: C.accent, fontSize: 18 }}>⟳</span>
            <span style={S.uploadingText}>UPLOADING...</span>
          </div>
        ) : imageUrl ? (
          <>
            <img src={imageUrl} alt={label} style={S.preview} />
            <div style={{ ...S.corner, top: 4, left: 4, borderTop: `2px solid ${C.success}`, borderLeft: `2px solid ${C.success}` }} />
            <div style={{ ...S.corner, top: 4, right: 4, borderTop: `2px solid ${C.success}`, borderRight: `2px solid ${C.success}` }} />
            <div style={{ ...S.corner, bottom: 4, left: 4, borderBottom: `2px solid ${C.success}`, borderLeft: `2px solid ${C.success}` }} />
            <div style={{ ...S.corner, bottom: 4, right: 4, borderBottom: `2px solid ${C.success}`, borderRight: `2px solid ${C.success}` }} />
          </>
        ) : (
          <div style={S.empty}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span style={S.emptyLabel}>
              {dragging ? 'SOLTAR AQUÍ' : 'SOLTAR O HACER CLIC'}
            </span>
            {sublabel && <span style={S.sublabel}>{sublabel}</span>}
          </div>
        )}
      </div>

      {imageUrl && !uploading && (
        <button style={S.replaceBtn} onClick={() => inputRef.current?.click()}>
          ↑ REEMPLAZAR IMAGEN
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        style={{ display: 'none' }}
        onChange={handleFile}
      />
    </div>
  );
}

const S = {
  header:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  label:    { fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: '0.12em', fontFamily: 'monospace' },
  clearBtn: { background: 'transparent', border: 'none', color: C.error, fontSize: 9, cursor: 'pointer', fontFamily: 'monospace', letterSpacing: '0.08em', padding: 0 },
  zone: {
    position: 'relative', height: 110, borderRadius: 5, border: '1px dashed',
    overflow: 'hidden', transition: 'border-color 0.15s, background 0.15s',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  preview:      { width: '100%', height: '100%', objectFit: 'cover' },
  corner:       { position: 'absolute', width: 8, height: 8 },
  empty:        { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
  emptyLabel:   { fontSize: 9, color: '#444', fontFamily: 'monospace', letterSpacing: '0.1em', fontWeight: 700 },
  sublabel:     { fontSize: 9, color: '#333', fontFamily: 'monospace' },
  uploading:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  uploadingText:{ fontSize: 9, color: C.accent, fontFamily: 'monospace', letterSpacing: '0.1em' },
  replaceBtn:   { background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 3, color: C.dim, fontSize: 9, cursor: 'pointer', fontFamily: 'monospace', letterSpacing: '0.08em', padding: '3px 8px', alignSelf: 'flex-start' },
};
