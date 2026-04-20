import React from 'react';
import { C, PLANOS } from '../../services/assetUtils';

const ESTILO_COLORS = {
  fotografía:   C.accent,
  animación:    '#9B59B6',
  ilustración:  '#E67E22',
  pintura:      '#E74C3C',
  '3d_render':  C.success,
};

export default function SBAnalysisPanel({ analysis, subjects, onSubjectClick, onGenerate, generating }) {
  if (!analysis) return null;

  if (analysis.error) {
    return (
      <div style={S.wrap}>
        <div style={S.errorBanner}>
          <div style={S.errorTitle}>⚠ No se pudo analizar la imagen</div>
          <div style={S.errorMsg}>{analysis.mensaje}</div>
        </div>
      </div>
    );
  }

  const planoLabel = PLANOS.find(p => p.value === analysis.tipo_plano)?.label || analysis.tipo_plano;
  const estiloColor = ESTILO_COLORS[analysis.estilo] || C.muted;

  return (
    <div style={S.wrap}>
      {/* Estilo */}
      <div style={S.section}>
        <div style={S.sectionLabel}>ESTILO DETECTADO</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...S.badge, background: `${estiloColor}20`, color: estiloColor, borderColor: estiloColor }}>
            {analysis.estilo?.toUpperCase()}
          </span>
          {!analysis.puede_replicar && (
            <span style={{ ...S.badge, background: `${C.warning}15`, color: C.warning, borderColor: C.warning }}>
              ⚠ LIMITADO
            </span>
          )}
        </div>
        {analysis.estilo_descripcion && (
          <div style={S.descText}>{analysis.estilo_descripcion}</div>
        )}
      </div>

      {/* Advertencia de replicación */}
      {!analysis.puede_replicar && (
        <div style={S.warnBox}>
          <div style={S.warnTitle}>⚠ Este estilo tiene limitaciones</div>
          {(analysis.limitaciones || []).map((l, i) => (
            <div key={i} style={S.warnItem}>· {l}</div>
          ))}
        </div>
      )}

      {/* Plano y ángulos */}
      <div style={S.section}>
        <div style={S.sectionLabel}>ENCUADRE DETECTADO</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <InfoChip label="PLANO" value={planoLabel} />
          <InfoChip label="ÁNGULO H" value={analysis.angulo_h?.replace(/_/g, ' ')} />
          <InfoChip label="ÁNGULO V" value={analysis.angulo_v?.replace(/_/g, ' ')} />
        </div>
      </div>

      {/* Iluminación y paleta */}
      <div style={S.section}>
        <div style={S.sectionLabel}>ILUMINACIÓN</div>
        <div style={S.descText}>{analysis.iluminacion || '—'}</div>
        <div style={{ ...S.sectionLabel, marginTop: 8 }}>PALETA</div>
        <div style={S.descText}>{analysis.paleta || '—'}</div>
      </div>

      {/* Fondo */}
      {analysis.fondo && (
        <div style={S.section}>
          <div style={S.sectionLabel}>FONDO / ESCENARIO</div>
          <div style={S.descText}>{analysis.fondo}</div>
        </div>
      )}

      {/* Personajes */}
      {subjects && subjects.length > 0 && (
        <div style={S.section}>
          <div style={S.sectionLabel}>PERSONAJES DETECTADOS ({subjects.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {subjects.map(sub => (
              <button
                key={sub.id}
                onClick={() => onSubjectClick(sub.id)}
                style={S.subjectBtn}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
              >
                <div style={{ fontSize: 10, color: C.text, fontWeight: 600, fontFamily: 'monospace', textAlign: 'left' }}>
                  {sub.label.toUpperCase()}
                </div>
                <div style={{ fontSize: 9, color: C.muted, lineHeight: 1.4, marginTop: 2, textAlign: 'left' }}>
                  {sub.description?.slice(0, 80)}{sub.description?.length > 80 ? '...' : ''}
                </div>
                <div style={{ fontSize: 9, color: C.accent, marginTop: 4, textAlign: 'right', fontFamily: 'monospace' }}>
                  EDITAR →
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Notas */}
      {analysis.notas_adicionales && (
        <div style={S.section}>
          <div style={S.sectionLabel}>NOTAS</div>
          <div style={S.descText}>{analysis.notas_adicionales}</div>
        </div>
      )}

      {/* Botón generar */}
      <button
        onClick={onGenerate}
        disabled={generating}
        style={{
          ...S.generateBtn,
          opacity: generating ? 0.6 : 1,
          cursor: generating ? 'default' : 'pointer',
        }}
      >
        {generating ? '⟳ GENERANDO...' : '▶ GENERAR FRAME'}
      </button>
    </div>
  );
}

function InfoChip({ label, value }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 4,
      padding: '3px 8px', display: 'flex', flexDirection: 'column', gap: 1,
    }}>
      <div style={{ fontSize: 7, color: C.muted, fontFamily: 'monospace', letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ fontSize: 9, color: C.text, fontFamily: 'monospace', textTransform: 'uppercase' }}>{value || '—'}</div>
    </div>
  );
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12, padding: '0 2px' },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  sectionLabel: { fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: '0.12em', fontFamily: 'monospace' },
  badge: {
    display: 'inline-block', padding: '3px 8px', borderRadius: 4,
    fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', fontFamily: 'monospace',
    border: '1px solid',
  },
  descText: { fontSize: 10, color: C.muted, lineHeight: 1.5 },
  warnBox: {
    background: `${C.warning}10`, border: `1px solid ${C.warning}40`,
    borderRadius: 6, padding: '10px 12px',
  },
  warnTitle: { fontSize: 9, color: C.warning, fontWeight: 700, fontFamily: 'monospace', marginBottom: 6 },
  warnItem: { fontSize: 9, color: C.warning, lineHeight: 1.5 },
  errorBanner: {
    background: `${C.error}12`, border: `1px solid ${C.error}40`,
    borderRadius: 6, padding: '12px 14px',
  },
  errorTitle: { fontSize: 10, color: C.error, fontWeight: 700, fontFamily: 'monospace', marginBottom: 6 },
  errorMsg: { fontSize: 10, color: C.error, lineHeight: 1.5 },
  subjectBtn: {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
    padding: '10px 12px', cursor: 'pointer', transition: 'border-color 0.15s',
    width: '100%',
  },
  generateBtn: {
    background: C.accent, border: 'none', borderRadius: 6,
    color: '#fff', padding: '12px', fontSize: 11, fontWeight: 700,
    letterSpacing: '0.1em', fontFamily: 'monospace', width: '100%',
    marginTop: 4, transition: 'opacity 0.2s',
  },
};
