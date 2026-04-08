import React, { useRef } from 'react';

const C = {
  panel:   '#232328',
  card:    '#2C2C32',
  border:  '#3A3A42',
  accent:  '#00A8E8',
  error:   '#FF4757',
  success: '#00D084',
  warning: '#FFB800',
  text:    '#E0E0E0',
  muted:   '#888892',
  dim:     '#555560',
};

/**
 * Props:
 *   elements          — array of element objects { index, imageUrl, name, description }
 *   operations        — array of edit operations (for history)
 *   currentMedia      — URL of current edited media
 *   originalMedia     — { url, type, name } of original
 *   session           — current session object
 *   maskMode          — null | 'brush' | 'eraser'
 *   maskData          — base64 PNG mask or null
 *   brushSize         — number
 *   showHistory       — boolean
 *   isProcessing      — boolean
 *   onOpenMedia       — () => void  — triggers main media file picker
 *   onAddElement      — (File) => void
 *   onRemoveElement   — (idx) => void
 *   onSetMaskMode     — (mode) => void
 *   onSetBrushSize    — (size) => void
 *   onClearMask       — () => void
 *   onToggleHistory   — () => void
 *   onRollback        — (versionIndex) => void
 */
export default function ElementsPanel({
  elements, operations, currentMedia, originalMedia,
  session, maskMode, maskData, brushSize, showHistory, isProcessing,
  onOpenMedia, onAddElement, onRemoveElement,
  onSetMaskMode, onSetBrushSize, onClearMask,
  onToggleHistory, onRollback,
}) {
  const elementInputRef = useRef(null);

  return (
    <div style={S.leftPanel}>
      <div style={{ marginBottom: 12 }}>
        <button style={S.addElementBtn} onClick={onOpenMedia}>
          📁 CARGAR / REEMPLAZAR ORIGINAL
        </button>
      </div>

      <div style={S.panelHeader}>
        <span>ELEMENTS</span>
        <span style={S.panelHint}>{elements.length}/4</span>
      </div>

      {elements.map((el) => (
        <div key={el.index} style={S.elementCard}>
          <img src={el.imageUrl} alt={el.name} style={S.elementImg} />
          <div style={S.elementInfo}>
            <span style={S.elementLabel}>Element {el.index}</span>
            <span style={S.elementName}>{el.name}</span>
          </div>
          <button style={S.removeBtn} onClick={() => onRemoveElement(el.index)}>✕</button>
        </div>
      ))}

      {elements.length < 4 && session && (
        <button style={S.addElementBtn} onClick={() => elementInputRef.current?.click()}>
          + ADD ELEMENT
        </button>
      )}
      <input
        ref={elementInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => { if (e.target.files[0]) onAddElement(e.target.files[0]); e.target.value = ''; }}
      />

      {/* ── MASK TOOLS ── */}
      {currentMedia && originalMedia?.type === 'image' && (
        <>
          <div style={{ ...S.panelHeader, marginTop: 20 }}>SELECTION TOOLS</div>

          <div style={S.toolRow}>
            <button
              style={{ ...S.toolBtn, ...(maskMode === 'brush' ? S.toolActive : {}) }}
              onClick={() => onSetMaskMode(maskMode === 'brush' ? null : 'brush')}
            >
              🖌️ Brush
            </button>
            <button
              style={{ ...S.toolBtn, ...(maskMode === 'eraser' ? S.toolActive : {}) }}
              onClick={() => onSetMaskMode(maskMode === 'eraser' ? null : 'eraser')}
            >
              ✂️ Eraser
            </button>
          </div>

          {maskMode && (
            <div style={S.brushRow}>
              <span style={{ fontSize: 10, color: C.muted }}>SIZE: {brushSize}px</span>
              <input
                type="range" min="5" max="100" value={brushSize}
                onChange={(e) => onSetBrushSize(+e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
          )}

          {maskData && (
            <div style={S.toolRow}>
              <button style={S.clearMaskBtn} onClick={onClearMask}>
                🗑️ CLEAR MASK
              </button>
              <span style={{ fontSize: 9, color: C.success }}>✓ Mask ready</span>
            </div>
          )}
        </>
      )}

      {/* ── HISTORY ── */}
      <div
        style={{ ...S.panelHeader, marginTop: 20, cursor: 'pointer' }}
        onClick={onToggleHistory}
      >
        HISTORY {showHistory ? '▲' : '▼'}
      </div>

      {showHistory && (
        <div style={S.historyList}>
          {operations.length === 0 && (
            <span style={{ fontSize: 10, color: C.dim }}>No edits yet</span>
          )}
          {operations.map((op, i) => (
            <div key={i} style={S.historyItem}>
              <div style={S.historyTop}>
                <span style={S.historyVersion}>v{op.version_number || i + 1}</span>
                {op.score != null && (
                  <span style={{
                    ...S.historyScore,
                    color: op.score >= 0.8 ? C.success : op.score >= 0.5 ? C.warning : C.error,
                  }}>
                    {Math.round(op.score * 100)}%
                  </span>
                )}
              </div>
              <span style={S.historyInstr}>{op.instruction}</span>
              <div style={S.historyActions}>
                {op.cost_usd > 0 && (
                  <span style={{ fontSize: 9, color: C.dim }}>${op.cost_usd.toFixed(4)}</span>
                )}
                <button style={S.rollbackBtn} onClick={() => onRollback(i)}>
                  ↩ UNDO
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const S = {
  leftPanel: {
    width: 220, background: C.panel, borderRight: `1px solid ${C.border}`,
    padding: 12, overflowY: 'auto', flexShrink: 0,
  },
  panelHeader: {
    fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: '0.15em',
    marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  panelHint:    { fontSize: 9, color: C.dim },
  elementCard: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: 6, background: C.card, borderRadius: 4, marginBottom: 6,
    border: `1px solid ${C.border}`,
  },
  elementImg:   { width: 40, height: 40, objectFit: 'cover', borderRadius: 3, flexShrink: 0 },
  elementInfo:  { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  elementLabel: { fontSize: 9, color: C.accent, fontWeight: 600 },
  elementName:  { fontSize: 10, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  removeBtn:    { background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 12, padding: 2 },
  addElementBtn: {
    width: '100%', padding: '8px 0', background: 'transparent',
    border: `1px dashed ${C.border}`, borderRadius: 4, color: C.muted,
    cursor: 'pointer', fontSize: 10, letterSpacing: '0.05em',
  },
  toolRow:     { display: 'flex', gap: 6, marginBottom: 8 },
  toolBtn: {
    flex: 1, padding: '6px 0', background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 4, color: C.muted, cursor: 'pointer', fontSize: 10, textAlign: 'center',
  },
  toolActive:   { border: `1px solid ${C.accent}`, color: C.accent, background: 'rgba(0,168,232,0.08)' },
  brushRow:     { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  clearMaskBtn: {
    flex: 1, padding: '4px 0', background: 'rgba(255,71,87,0.1)', border: `1px solid ${C.error}`,
    borderRadius: 4, color: C.error, cursor: 'pointer', fontSize: 9,
  },
  historyList:    { display: 'flex', flexDirection: 'column', gap: 6 },
  historyItem: {
    padding: 8, background: C.card, borderRadius: 4, border: `1px solid ${C.border}`,
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  historyTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  historyVersion: { fontSize: 9, fontWeight: 600, color: C.accent },
  historyScore:   { fontSize: 9, fontWeight: 600 },
  historyInstr:   { fontSize: 10, color: C.muted, lineHeight: 1.3 },
  historyActions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  rollbackBtn: {
    background: 'none', border: `1px solid ${C.border}`, borderRadius: 3,
    color: C.muted, cursor: 'pointer', fontSize: 9, padding: '2px 6px',
  },
};
