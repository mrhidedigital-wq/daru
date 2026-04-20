import React, { useRef } from 'react';
import { C } from '../../services/assetUtils';
import SBTurnaround from './SBTurnaround';
import { ACCEPTED } from '../studio/frameUploaderConfig';

const fileToBase64 = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

export default function SBSubjectEditor({ subject, onUpdate, onGenerateTurnaround, generatingViews }) {
  const faceInputRef = useRef();
  const costumeInputRef = useRef();

  if (!subject) {
    return (
      <div style={S.empty}>
        <div style={S.emptyText}>Selecciona un personaje del análisis para editarlo.</div>
      </div>
    );
  }

  const handleFaceFile = async (file) => {
    const b64 = await fileToBase64(file);
    onUpdate({ faceImage: b64 });
  };

  const handleCostumeFile = async (file) => {
    const b64 = await fileToBase64(file);
    onUpdate({ costumeImage: b64 });
  };

  const handleTurnaroundFile = async (key, fileOrValue) => {
    if (key === 'selectedViews') {
      onUpdate({ selectedViews: fileOrValue });
      return;
    }
    const b64 = await fileToBase64(fileOrValue);
    onUpdate({ turnaround: { ...subject.turnaround, [key]: b64 } });
  };

  const handleTurnaroundClear = (key) => {
    onUpdate({ turnaround: { ...subject.turnaround, [key]: null } });
  };

  return (
    <div style={S.wrap}>
      {/* Header personaje */}
      <div style={S.subjectHeader}>
        <div style={S.subjectName}>{subject.label?.toUpperCase()}</div>
        <span style={S.positionBadge}>{subject.position}</span>
      </div>

      <div style={S.descText}>{subject.description}</div>

      {/* Cara */}
      <div style={S.section}>
        <div style={S.label}>CARA</div>
        {subject.faceImage ? (
          <div style={S.imgPreviewRow}>
            <img src={subject.faceImage} alt="cara" style={S.imgThumb} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button style={S.smallBtn} onClick={() => faceInputRef.current?.click()}>
                ↑ REEMPLAZAR
              </button>
              <button style={{ ...S.smallBtn, color: C.error, borderColor: C.error }} onClick={() => onUpdate({ faceImage: null })}>
                ✕ QUITAR
              </button>
            </div>
          </div>
        ) : (
          <button style={S.uploadBtn} onClick={() => faceInputRef.current?.click()}>
            + SUBIR REFERENCIA DE CARA
          </button>
        )}
        <input ref={faceInputRef} type="file" accept={ACCEPTED} style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFaceFile(f); e.target.value = ''; }} />
      </div>

      {/* Vestuario */}
      <div style={S.section}>
        <div style={S.label}>VESTUARIO</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { value: true, label: '○ Mantener vestuario original' },
            { value: false, label: '○ Subir nuevo vestuario' },
          ].map(opt => (
            <div
              key={String(opt.value)}
              onClick={() => onUpdate({ keepCostume: opt.value })}
              style={{
                ...S.radioRow,
                color: subject.keepCostume === opt.value ? C.text : C.muted,
              }}
            >
              <span style={{
                color: subject.keepCostume === opt.value ? C.accent : C.muted,
                marginRight: 6,
              }}>
                {subject.keepCostume === opt.value ? '●' : '○'}
              </span>
              {opt.label.slice(2)}
            </div>
          ))}
        </div>

        {!subject.keepCostume && (
          <div style={{ marginTop: 6 }}>
            {subject.costumeImage ? (
              <div style={S.imgPreviewRow}>
                <img src={subject.costumeImage} alt="vestuario" style={S.imgThumb} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button style={S.smallBtn} onClick={() => costumeInputRef.current?.click()}>↑ REEMPLAZAR</button>
                  <button style={{ ...S.smallBtn, color: C.error, borderColor: C.error }} onClick={() => onUpdate({ costumeImage: null })}>✕ QUITAR</button>
                </div>
              </div>
            ) : (
              <button style={S.uploadBtn} onClick={() => costumeInputRef.current?.click()}>
                + SUBIR REFERENCIA DE VESTUARIO
              </button>
            )}
            <input ref={costumeInputRef} type="file" accept={ACCEPTED} style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleCostumeFile(f); e.target.value = ''; }} />
          </div>
        )}
      </div>

      {/* Descripción personalizada */}
      <div style={S.section}>
        <div style={S.label}>O DESCRIBE EL PERSONAJE LIBREMENTE</div>
        <textarea
          value={subject.customDescription || ''}
          onChange={e => onUpdate({ customDescription: e.target.value })}
          placeholder="Ej: hombre de 40 años, traje oscuro, corbata roja, gafas redondas..."
          rows={3}
          style={S.textarea}
        />
        {subject.customDescription && (
          <div style={S.hintText}>Esta descripción reemplazará al personaje original en su totalidad.</div>
        )}
      </div>

      {/* Turnaround */}
      <SBTurnaround
        subject={subject}
        generatingViews={generatingViews}
        onGenerateViews={(views) => onGenerateTurnaround(subject.id, views)}
        onFileUpload={handleTurnaroundFile}
        onClear={handleTurnaroundClear}
      />
    </div>
  );
}

const S = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  empty: { padding: '24px 0', textAlign: 'center' },
  emptyText: { fontSize: 10, color: C.dim, fontFamily: 'monospace' },
  subjectHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  subjectName: { fontSize: 11, fontWeight: 700, color: C.text, fontFamily: 'monospace', letterSpacing: '0.08em' },
  positionBadge: {
    fontSize: 8, color: C.muted, background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 3, padding: '2px 6px', fontFamily: 'monospace', textTransform: 'uppercase',
  },
  descText: { fontSize: 10, color: C.muted, lineHeight: 1.5 },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: '0.12em', fontFamily: 'monospace' },
  uploadBtn: {
    background: C.card, border: `1px dashed ${C.border}`, borderRadius: 5,
    color: C.muted, padding: '10px', fontSize: 9, cursor: 'pointer',
    fontFamily: 'monospace', letterSpacing: '0.06em', width: '100%',
    transition: 'border-color 0.15s',
  },
  imgPreviewRow: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  imgThumb: { width: 60, height: 60, objectFit: 'cover', borderRadius: 4, border: `1px solid ${C.border}` },
  smallBtn: {
    background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 3,
    color: C.muted, padding: '4px 8px', fontSize: 9, cursor: 'pointer',
    fontFamily: 'monospace', letterSpacing: '0.06em',
  },
  radioRow: {
    fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center',
    fontFamily: 'monospace', padding: '2px 0',
  },
  textarea: {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.text, padding: '8px 10px', fontSize: 10, outline: 'none',
    fontFamily: 'monospace', resize: 'vertical', width: '100%', boxSizing: 'border-box',
    lineHeight: 1.5,
  },
  hintText: { fontSize: 9, color: C.warning, fontFamily: 'monospace' },
};
