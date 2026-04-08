// src/components/studio/StudioTopBar.jsx
// Barra superior de DaruStudio.
// Props:
//   project             — { name } del proyecto actual
//   dagProgress         — { percent, currentNode } o null
//   generating          — boolean
//   llmProvider         — 'gemini' | 'claude' | 'gpt4'
//   onLlmProviderChange — callback(provider)
//   shots               — array de shots (para habilitar/deshabilitar botones)
//   quickStartLoading   — boolean
//   projectCost         — { totalCost, totals } o null
//   exporting           — boolean
//   onNavigateBack      — callback
//   onGenerateAll       — callback
//   onExport            — callback
//   onOpenPreset        — callback(presetKey)

import React from 'react';
import { QUICK_PRESETS } from './QuickStartModal';

const C = {
  accent: '#00A8E8',
  text:   '#DDDDDD',
  muted:  '#888888',
  border: '#404040',
};

export default function StudioTopBar({
  project,
  dagProgress,
  generating,
  llmProvider,
  onLlmProviderChange,
  shots,
  quickStartLoading,
  projectCost,
  exporting,
  onNavigateBack,
  onGenerateAll,
  onExport,
  onOpenPreset,
}) {
  const hasVideos = shots.filter(s => s.result_video_url).length > 0;

  return (
    <div style={s.topBar}>

      {/* Izquierda: navegación + nombre */}
      <div style={s.topLeft}>
        <button style={s.backBtn} onClick={onNavigateBack}>←</button>
        <div style={s.logoMark}>▶</div>
        <div>
          <div style={s.appName}>DARU STUDIO</div>
          <div style={s.projectName}>{project?.name || 'New Project'}</div>
        </div>
      </div>

      {/* Centro: barra de progreso DAG */}
      <div style={s.topCenter}>
        {dagProgress && generating && (
          <div style={s.progressBar}>
            <div style={{ ...s.progressFill, width: `${dagProgress.percent}%` }} />
            <span style={s.progressLabel}>
              {dagProgress.currentNode || 'Processing...'} — {dagProgress.percent}%
            </span>
          </div>
        )}
      </div>

      {/* Derecha: controles y botones de acción */}
      <div style={s.topRight}>
        <select
          value={llmProvider}
          onChange={e => onLlmProviderChange(e.target.value)}
          style={s.providerSelect}
          title="LLM Provider for prompt building"
        >
          <option value="gemini">Gemini 2.5</option>
          <option value="claude">Claude Sonnet</option>
          <option value="gpt4">GPT-4o</option>
        </select>

        {Object.entries(QUICK_PRESETS).map(([key, preset]) => (
          <button
            key={key}
            style={{ ...s.btnQuick, opacity: quickStartLoading ? 0.5 : 1 }}
            disabled={quickStartLoading}
            onClick={() => onOpenPreset(key)}
            title={preset.descripcion}
          >
            {quickStartLoading ? '⟳' : preset.label}
          </button>
        ))}

        {projectCost && (
          <div
            style={s.costBadge}
            title={Object.entries(projectCost.totals || {}).map(([k, v]) => `${k}: $${v.cost_usd.toFixed(4)}`).join('\n')}
          >
            <span style={s.costText}>💰 ${projectCost.totalCost}</span>
          </div>
        )}

        <button
          style={{ ...s.btnGenAll, opacity: generating || shots.length === 0 ? 0.5 : 1 }}
          disabled={generating || shots.length === 0}
          onClick={onGenerateAll}
        >
          {generating ? '⟳ GENERATING...' : '▶ GENERATE ALL'}
        </button>

        <button
          style={{ ...s.btnQuick, borderColor: '#00D084', color: '#00D084', opacity: exporting || !hasVideos ? 0.4 : 1 }}
          disabled={exporting || !hasVideos}
          onClick={onExport}
          title="Concatenar todos los videos en un solo MP4"
        >
          {exporting ? '⟳ EXPORTING...' : '⬇ EXPORT MP4'}
        </button>
      </div>
    </div>
  );
}

// ─── Estilos ──────────────────────────────────────────────────
const s = {
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    background: '#222',
    borderBottom: `1px solid ${C.border}`,
    padding: '0 14px',
    flexShrink: 0,
    gap: 16,
  },
  topLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 200,
  },
  backBtn: {
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: 4,
    color: '#888',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 14,
  },
  logoMark: {
    width: 28,
    height: 28,
    background: C.accent,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    color: '#fff',
    fontWeight: 700,
    flexShrink: 0,
  },
  appName: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.14em',
    color: C.text,
    fontFamily: 'monospace',
    lineHeight: 1.2,
  },
  projectName: {
    fontSize: 9,
    color: C.muted,
    fontFamily: 'monospace',
    letterSpacing: '0.08em',
    lineHeight: 1.2,
  },
  topCenter: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
  },
  progressBar: {
    position: 'relative',
    width: 280,
    height: 22,
    background: '#333',
    borderRadius: 3,
    overflow: 'hidden',
    border: '1px solid #444',
  },
  progressFill: {
    position: 'absolute',
    top: 0, left: 0, bottom: 0,
    background: C.accent,
    transition: 'width 0.3s ease',
    opacity: 0.3,
  },
  progressLabel: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 9,
    color: C.text,
    fontFamily: 'monospace',
    letterSpacing: '0.06em',
  },
  topRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 200,
    justifyContent: 'flex-end',
  },
  providerSelect: {
    background: '#333',
    border: '1px solid #444',
    borderRadius: 4,
    color: C.muted,
    padding: '4px 8px',
    fontSize: 10,
    fontFamily: 'monospace',
    cursor: 'pointer',
    outline: 'none',
  },
  btnQuick: {
    background: 'transparent',
    border: '1px solid #404040',
    borderRadius: 4,
    color: C.text,
    padding: '5px 10px',
    fontSize: 10,
    cursor: 'pointer',
    fontFamily: 'monospace',
    letterSpacing: '0.06em',
  },
  costBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    background: 'rgba(0,208,132,0.08)',
    border: '1px solid rgba(0,208,132,0.2)',
    borderRadius: 4,
  },
  costText: {
    fontSize: 9,
    color: '#00D084',
    fontFamily: 'monospace',
    fontWeight: 700,
  },
  btnGenAll: {
    background: C.accent,
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    padding: '6px 16px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
    cursor: 'pointer',
    fontFamily: 'monospace',
    transition: 'opacity 0.2s',
  },
};
