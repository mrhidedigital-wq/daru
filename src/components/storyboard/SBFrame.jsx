import React, { useRef, useState, useEffect } from 'react';
import { C } from '../../services/assetUtils';
import { ACCEPTED } from '../studio/frameUploaderConfig';

const STATUS_LABELS = {
  empty:      { label: 'VACÍO',      color: C.dim },
  analyzing:  { label: 'ANALIZANDO…', color: C.warning },
  analyzed:   { label: 'ANALIZADO',   color: C.accent },
  generating: { label: 'GENERANDO…', color: C.warning },
  done:       { label: 'LISTO',       color: C.success },
  error:      { label: 'ERROR',       color: C.error },
};

export default function SBFrame({ frame, index, isActive, onActivate, onFileUpload, onDownload, onDelete }) {
  const inputRef = useRef();
  const [showRef, setShowRef] = useState(false);

  const { status, referenceImage, generatedImage, errorMsg, resolution } = frame;

  useEffect(() => {
    if (status === 'done') {
      setShowRef(false);
    }
  }, [generatedImage, status]);
  const isLandscape = (resolution || '16:9') === '16:9';
  const st = STATUS_LABELS[status] || STATUS_LABELS.empty;

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (file) onFileUpload(frame.id, file);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) onFileUpload(frame.id, file);
  };

  // Background shown under the generating overlay:
  // prefer current generatedImage (user sees what's being modified), fallback to referenceImage
  const generatingBg = generatedImage || referenceImage;

  // Image shown in done state respects the REF/GEN toggle
  const displayImage = showRef ? referenceImage : generatedImage;

  return (
    <div
      onClick={onActivate}
      style={{
        ...S.card,
        borderColor: isActive ? C.accent : C.border,
        boxShadow: isActive ? `0 0 0 2px ${C.accent}40` : 'none',
        cursor: 'pointer',
      }}
    >
      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ ...S.frameNum }}>FRAME {index + 1}</span>
          <span style={{ ...S.statusDot, background: st.color }} />
          <span style={{ fontSize: 8, color: st.color, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
            {st.label}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <span style={{ fontSize: 8, color: C.dim, fontFamily: 'monospace' }}>
            {isLandscape ? '16:9' : '9:16'}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onDelete(frame.id); }}
            style={S.deleteBtn}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        style={{
          ...S.imageArea,
          aspectRatio: isLandscape ? '16/9' : '9/16',
        }}
        onDragOver={e => { e.preventDefault(); }}
        onDrop={handleDrop}
      >
        {status === 'empty' && (
          <div
            style={S.dropZone}
            onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span style={S.dropLabel}>SOLTAR O HACER CLIC</span>
            <span style={S.dropSub}>JPG, PNG, WEBP</span>
          </div>
        )}

        {status === 'analyzing' && (
          <>
            {referenceImage && (
              <img src={referenceImage} alt="referencia" style={S.bgImg} />
            )}
            <div style={S.overlay}>
              <div style={S.spinner}>⟳</div>
              <div style={S.overlayLabel}>Analizando…</div>
            </div>
          </>
        )}

        {status === 'generating' && (
          <>
            {generatingBg && (
              <img src={generatingBg} alt="base" style={S.bgImg} />
            )}
            <div style={S.overlay}>
              <div style={S.spinner}>⟳</div>
              <div style={S.overlayLabel}>Aplicando cambios…</div>
            </div>
          </>
        )}

        {status === 'analyzed' && referenceImage && (
          <>
            <img src={referenceImage} alt="referencia" style={S.bgImg} />
            <div style={S.overlay}>
              <div style={S.analyzed}>IMAGEN ANALIZADA</div>
              <div style={{ fontSize: 9, color: C.muted, fontFamily: 'monospace' }}>
                Haz click en el panel izquierdo para generar
              </div>
            </div>
          </>
        )}

        {status === 'done' && displayImage && (
          <img src={displayImage} alt={`frame ${index + 1}`} style={S.bgImg} />
        )}

        {status === 'error' && (
          <div style={S.errorArea}>
            <div style={{ color: C.error, fontSize: 10, fontFamily: 'monospace', textAlign: 'center' }}>
              ⚠ {errorMsg || 'Error al procesar'}
            </div>
            <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, display: 'flex', gap: 6 }}>
              <button
                onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
                style={{
                  flex: 1, background: C.card, border: `1px solid ${C.warning}`,
                  borderRadius: 4, color: C.warning, padding: '6px', fontSize: 9,
                  fontFamily: 'monospace', cursor: 'pointer', letterSpacing: '0.06em',
                }}
              >
                ↑ REEMPLAZAR IMAGEN
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {(status === 'done' || status === 'analyzed') && referenceImage && (
        <div style={S.footer}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <img
              src={showRef ? referenceImage : (generatedImage || referenceImage)}
              alt="preview"
              style={S.refThumb}
            />
            {status === 'done' && generatedImage && (
              <button
                onClick={e => { e.stopPropagation(); setShowRef(v => !v); }}
                style={{
                  ...S.toggleBtn,
                  color: showRef ? C.warning : C.accent,
                  borderColor: showRef ? C.warning : C.accent,
                }}
              >
                {showRef ? 'GEN' : 'REF'}
              </button>
            )}
            {!(status === 'done' && generatedImage) && (
              <span style={{ fontSize: 8, color: C.dim, fontFamily: 'monospace' }}>REF</span>
            )}
          </div>
          {status === 'done' && (
            <button
              onClick={e => { e.stopPropagation(); onDownload(frame); }}
              style={S.downloadBtn}
            >
              ↓ DESCARGAR
            </button>
          )}
        </div>
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
  card: {
    background: C.card,
    border: `1px solid`,
    borderRadius: 8,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    transition: 'border-color 0.15s',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 10px', borderBottom: `1px solid ${C.border}`,
    background: C.panel,
  },
  frameNum: { fontSize: 9, fontWeight: 700, color: C.muted, fontFamily: 'monospace', letterSpacing: '0.1em' },
  statusDot: { width: 5, height: 5, borderRadius: '50%', flexShrink: 0 },
  deleteBtn: {
    background: 'transparent', border: 'none', color: C.error,
    fontSize: 10, cursor: 'pointer', padding: '2px 4px', opacity: 0.6,
  },
  imageArea: {
    position: 'relative', background: '#111', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '100%',
  },
  dropZone: {
    position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 6,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  dropLabel: { fontSize: 9, color: C.dim, fontFamily: 'monospace', letterSpacing: '0.1em' },
  dropSub: { fontSize: 8, color: '#333', fontFamily: 'monospace' },
  bgImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  overlay: {
    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  spinner: {
    fontSize: 22, color: C.accent,
    animation: 'spin 1s linear infinite',
  },
  overlayLabel: { fontSize: 10, color: C.muted, fontFamily: 'monospace' },
  analyzed: { fontSize: 10, color: C.accent, fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.1em' },
  errorArea: {
    position: 'absolute', inset: 0, background: `${C.error}10`,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
  },
  footer: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '6px 10px', borderTop: `1px solid ${C.border}`,
    background: C.panel,
  },
  refThumb: { width: 20, height: 14, objectFit: 'cover', borderRadius: 2, border: `1px solid ${C.border}` },
  toggleBtn: {
    background: 'transparent', border: `1px solid`, borderRadius: 3,
    padding: '2px 6px', fontSize: 8, cursor: 'pointer',
    fontFamily: 'monospace', letterSpacing: '0.06em',
  },
  downloadBtn: {
    background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 3,
    color: C.muted, padding: '3px 8px', fontSize: 8, cursor: 'pointer',
    fontFamily: 'monospace', letterSpacing: '0.06em',
  },
};