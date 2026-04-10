import React from 'react';

const C = {
  panel:   '#232328',
  card:    '#2C2C32',
  border:  '#3A3A42',
  accent:  '#00A8E8',
  accent2: '#7C3AED',
  warning: '#FFB800',
  text:    '#E0E0E0',
  muted:   '#888892',
};

export default function EditorTopBar({ session, originalMedia, operations, onDownload }) {
  const totalCost = operations.reduce((sum, op) => sum + (op.cost_usd || 0), 0);

  return (
    <div style={S.topBar}>
      <div style={S.topLeft}>
        <a href="/" style={S.backLink}>← DASHBOARD</a>
        <span style={S.logo}>DARU</span>
        <span style={S.logoSub}>EDITOR</span>
      </div>
      <div style={S.topCenter}>
        {session && <span style={S.sessionName}>{session.name || 'Untitled'}</span>}
        {originalMedia && (
          <span style={S.badge}>
            {originalMedia.type === 'video' ? '🎬' : '🖼️'} {originalMedia.type.toUpperCase()}
          </span>
        )}
      </div>
      <div style={S.topRight}>
        {totalCost > 0 && (
          <span style={S.costBadge}>💰 ${totalCost.toFixed(4)}</span>
        )}
        <span style={S.versionBadge}>v{operations.length}</span>
        {onDownload && (
          <button onClick={onDownload} style={S.downloadBtn} title="Descargar imagen">
            ↓
          </button>
        )}
      </div>
    </div>
  );
}

const S = {
  topBar: {
    height: 48, background: C.panel, borderBottom: `1px solid ${C.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 16px', flexShrink: 0,
  },
  topLeft:      { display: 'flex', alignItems: 'center', gap: 12 },
  topCenter:    { display: 'flex', alignItems: 'center', gap: 8 },
  topRight:     { display: 'flex', alignItems: 'center', gap: 10 },
  backLink:     { fontSize: 10, color: C.muted, textDecoration: 'none', letterSpacing: '0.05em' },
  logo:         { fontSize: 14, fontWeight: 700, color: C.accent, letterSpacing: '0.15em' },
  logoSub:      { fontSize: 10, color: C.accent2, letterSpacing: '0.2em', fontWeight: 500 },
  sessionName:  { fontSize: 11, color: C.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badge:        { fontSize: 9, background: C.card, padding: '2px 8px', borderRadius: 3, color: C.muted, letterSpacing: '0.1em' },
  costBadge:    { fontSize: 10, color: C.warning, background: 'rgba(255,184,0,0.1)', padding: '2px 8px', borderRadius: 3 },
  versionBadge: { fontSize: 9, background: C.accent, color: '#000', padding: '2px 6px', borderRadius: 3, fontWeight: 600 },
  downloadBtn:  { background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14, fontWeight: 700, flexShrink: 0 },
};
