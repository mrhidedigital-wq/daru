import React from 'react';
import {
  FASHION_TASK_TYPE_OPTIONS,
  FASHION_SUBJECT_TYPE_OPTIONS,
  FASHION_POSE_OPTIONS,
  FASHION_BODY_AREA_OPTIONS,
  FASHION_FIDELITY_MODE_OPTIONS,
} from '../../lib/editor/fashionAssistSchema';

const C = {
  card:    '#2C2C32',
  border:  '#3A3A42',
  accent:  '#00A8E8',
  accent2: '#7C3AED',
  text:    '#E0E0E0',
  muted:   '#888892',
  dim:     '#555560',
};

const S = {
  panelHeader: {
    fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: '0.15em',
    marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  selectInput: {
    width: '100%', marginTop: 4, padding: 6, background: C.card, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: 'inherit',
    fontSize: 10, boxSizing: 'border-box',
  },
  textInputSmall: {
    width: '100%', marginTop: 4, padding: 6, background: C.card, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: 'inherit',
    fontSize: 10, boxSizing: 'border-box',
  },
  checkboxRow: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 9, color: C.muted },
};

/**
 * Props:
 *   session             — current session object
 *   currentMedia        — URL of current media
 *   elements            — array of uploaded elements
 *   fashionAssistInput  — fashion assist state object
 *   isEnhancing         — boolean
 *   isProcessing        — boolean
 *   onUpdateField       — (key, value) => void
 *   onUpdateConstraint  — (key, value) => void
 *   onDress             — () => void
 */
export default function FashionAssistPanel({
  session, currentMedia, elements,
  fashionAssistInput, isEnhancing, isProcessing,
  onUpdateField, onUpdateConstraint, onDress,
}) {
  if (!session || !currentMedia) return null;

  return (
    <>
      <div style={{ ...S.panelHeader, marginTop: 20 }}>
        <span>👗 FASHION ASSIST</span>
      </div>

      {elements.length === 0 ? (
        <div style={{
          padding: '8px 10px', fontSize: 9, color: C.dim, lineHeight: 1.5,
          background: C.card, borderRadius: 4, border: `1px solid ${C.border}`,
        }}>
          Sube un elemento (prenda o accesorio) en{' '}
          <span style={{ color: C.accent }}>ELEMENTS</span> para vestir al modelo
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ fontSize: 9, color: C.muted }}>
            Task Type
            <select
              value={fashionAssistInput.taskType}
              onChange={(e) => onUpdateField('taskType', e.target.value)}
              style={S.selectInput}
            >
              {FASHION_TASK_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 9, color: C.muted }}>
            Subject Type
            <select
              value={fashionAssistInput.subjectType}
              onChange={(e) => {
                const nextSubject = e.target.value;
                onUpdateField('subjectType', nextSubject);
                onUpdateField('pose', FASHION_POSE_OPTIONS[nextSubject][0].value);
              }}
              style={S.selectInput}
            >
              {FASHION_SUBJECT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 9, color: C.muted }}>
            Pose
            <select
              value={fashionAssistInput.pose}
              onChange={(e) => onUpdateField('pose', e.target.value)}
              style={S.selectInput}
            >
              {(FASHION_POSE_OPTIONS[fashionAssistInput.subjectType] || []).map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 9, color: C.muted }}>
            Body Area
            <select
              value={fashionAssistInput.bodyArea}
              onChange={(e) => onUpdateField('bodyArea', e.target.value)}
              style={S.selectInput}
            >
              {FASHION_BODY_AREA_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 9, color: C.muted }}>
            Fidelity Mode
            <select
              value={fashionAssistInput.fidelityMode}
              onChange={(e) => onUpdateField('fidelityMode', e.target.value)}
              style={S.selectInput}
            >
              {FASHION_FIDELITY_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 9, color: C.muted }}>
            Exact Color
            <input
              type="text"
              value={fashionAssistInput.constraints.exactColor}
              onChange={(e) => onUpdateConstraint('exactColor', e.target.value)}
              placeholder="vinotinto"
              style={S.textInputSmall}
            />
          </label>

          <label style={S.checkboxRow}>
            <input
              type="checkbox"
              checked={fashionAssistInput.constraints.noRedesign}
              onChange={(e) => onUpdateConstraint('noRedesign', e.target.checked)}
            />
            No redesign
          </label>

          <label style={S.checkboxRow}>
            <input
              type="checkbox"
              checked={fashionAssistInput.constraints.preserveFace}
              onChange={(e) => onUpdateConstraint('preserveFace', e.target.checked)}
            />
            Preserve face
          </label>

          <label style={S.checkboxRow}>
            <input
              type="checkbox"
              checked={fashionAssistInput.constraints.preservePose}
              onChange={(e) => onUpdateConstraint('preservePose', e.target.checked)}
            />
            Preserve pose
          </label>

          <label style={S.checkboxRow}>
            <input
              type="checkbox"
              checked={fashionAssistInput.constraints.preserveBackground}
              onChange={(e) => onUpdateConstraint('preserveBackground', e.target.checked)}
            />
            Preserve background
          </label>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: 6,
            background: C.card, borderRadius: 4, border: `1px solid ${C.border}`,
          }}>
            <img
              src={elements[0].imageUrl}
              alt="Element"
              style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 3 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 8, color: C.accent2, fontWeight: 600, letterSpacing: '0.1em' }}>
                ELEMENTO
              </div>
              <div style={{ fontSize: 9, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {elements[0].name}
              </div>
            </div>
            <span style={{ fontSize: 14 }}>→</span>
            <div style={{ width: 36, height: 36, borderRadius: 3, overflow: 'hidden', border: `1px solid ${C.border}`, flexShrink: 0 }}>
              <img src={currentMedia} alt="Model" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>

          <button
            onClick={onDress}
            disabled={isEnhancing || isProcessing}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 4, cursor: 'pointer',
              fontSize: 11, fontWeight: 700, fontFamily: 'inherit', letterSpacing: '0.1em',
              background: isEnhancing || isProcessing ? C.card : `linear-gradient(135deg, ${C.accent2}, #9F5AFF)`,
              color: isEnhancing || isProcessing ? C.dim : '#fff',
              border: 'none',
              opacity: isEnhancing || isProcessing ? 0.5 : 1,
              transition: 'all 0.2s',
            }}
          >
            {isEnhancing ? '🔄 ANALIZANDO...' : isProcessing ? '⏳ PROCESANDO...' : '👗 VESTIR MODELO'}
          </button>

          <div style={{ fontSize: 8, color: C.dim, textAlign: 'center', lineHeight: 1.4 }}>
            Usa varias referencias del producto y restricciones de fidelidad para reducir alucinación.
          </div>
        </div>
      )}
    </>
  );
}
