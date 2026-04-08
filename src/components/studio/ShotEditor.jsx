// src/components/studio/ShotEditor.jsx
import React, { useEffect, useState } from 'react';

const SHOT_SIZES = [
  { id: 'gran_plano_general', label: 'Gran plano general' },
  { id: 'plano_general', label: 'Plano General' },
  { id: 'plano_entero', label: 'Plano Entero' },
  { id: 'plano_americano', label: 'Plano Americano' },
  { id: 'plano_medio', label: 'Plano Medio' },
  { id: 'primer_plano', label: 'Primer Plano' },
  { id: 'primerisimo_primer_plano', label: 'Primerísimo PP' },
];

const ANGLES = [
  { id: 'frontal', label: 'Frontal' },
  { id: 'tres_cuartos_izq', label: '3/4 Izquierda' },
  { id: 'tres_cuartos_der', label: '3/4 Derecha' },
  { id: 'lateral_izq', label: 'Lateral Izq.' },
  { id: 'lateral_der', label: 'Lateral Der.' },
  { id: 'picado', label: 'Picado' },
  { id: 'contrapicado', label: 'Contrapicado' },
];

const CAMERA_MOVES = [
  { id: 'static', label: 'Static' },
  { id: 'dolly_in', label: 'Dolly In' },
  { id: 'dolly_out', label: 'Dolly Out' },
  { id: 'pan_left', label: 'Pan Left' },
  { id: 'pan_right', label: 'Pan Right' },
  { id: 'tilt_up', label: 'Tilt Up' },
  { id: 'tilt_down', label: 'Tilt Down' },
  { id: 'arc', label: 'Arc' },
  { id: 'parallax', label: 'Parallax' },
  { id: 'handheld', label: 'Handheld' },
];

const LIGHTING_MOODS = [
  { id: 'natural', label: 'Natural' },
  { id: 'warm', label: 'Warm / Golden' },
  { id: 'cool', label: 'Cool / Blue' },
  { id: 'dramatic', label: 'Dramatic' },
  { id: 'soft', label: 'Soft / Diffused' },
  { id: 'night', label: 'Night' },
];

const LIGHTING_SCHEMES = [
  { id: 'three_point', label: '3-Point' },
  { id: 'rembrandt', label: 'Rembrandt' },
  { id: 'split', label: 'Split' },
  { id: 'butterfly', label: 'Butterfly' },
  { id: 'natural_window', label: 'Natural Window' },
  { id: 'rim', label: 'Rim / Backlight' },
];

const BACKGROUND_MODES = [
  { id: 'keep_start_end', label: 'Keep start/end' },
  { id: 'shared_place', label: 'Shared place' },
  { id: 'custom', label: 'Custom' },
  { id: 'replace_background', label: 'Replace background' },
];

const TABS = ['CÁMARA', 'ILUMINACIÓN', 'TRANSICIÓN'];

function buildInitialData(shot) {
  return {
    id: shot?.id,
    name: shot?.name || '',
    duration_seconds: shot?.duration_seconds || 4,

    frame_start: {
      shot: shot?.frame_start?.shot || 'plano_medio',
      angle: shot?.frame_start?.angle || 'frontal',
      lighting: {
        scheme: shot?.frame_start?.lighting?.scheme || 'three_point',
        mood: shot?.frame_start?.lighting?.mood || 'natural',
      },
      semantic: {
        characterIds: shot?.frame_start?.semantic?.characterIds || [],
        elementIds: shot?.frame_start?.semantic?.elementIds || [],
      },
    },

    frame_end: {
      shot: shot?.frame_end?.shot || 'primer_plano',
      angle: shot?.frame_end?.angle || 'frontal',
      semantic: {
        characterIds: shot?.frame_end?.semantic?.characterIds || [],
        elementIds: shot?.frame_end?.semantic?.elementIds || [],
      },
    },

    transition: {
      cameraMove: shot?.transition?.cameraMove || 'dolly_in',
      intensity: shot?.transition?.intensity || 0.2,
      timing: shot?.transition?.timing || 'ease-out',
      actionText: shot?.transition?.actionText || '',
      actionTargets: {
        characterIds: shot?.transition?.actionTargets?.characterIds || [],
        elementIds: shot?.transition?.actionTargets?.elementIds || [],
      },
    },

    scene: {
      placeText: shot?.scene?.placeText || '',
      backgroundMode: shot?.scene?.backgroundMode || 'keep_start_end',
    },
  };
}

export default function ShotEditor({ shot, onSave, onClose, onEnhanceField }) {
  const [activeTab, setActiveTab] = useState('CÁMARA');
  const [enhancingAction, setEnhancingAction] = useState(false);
  const [enhancingPlace, setEnhancingPlace] = useState(false);

  const [data, setData] = useState(() => buildInitialData(shot));

  useEffect(() => {
    setData(buildInitialData(shot));
  }, [shot]);

  const set = (path, value) => {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.');
      let cur = next;

      for (let i = 0; i < keys.length - 1; i++) {
        cur = cur[keys[i]];
      }

      cur[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const handleEnhanceAction = async () => {
    if (!onEnhanceField || !data.transition?.actionText?.trim()) return;

    try {
      setEnhancingAction(true);

      const improved = await onEnhanceField({
        fieldType: 'action',
        value: data.transition.actionText,
        shot: data,
      });

      if (improved && typeof improved === 'string') {
        set('transition.actionText', improved.trim());
      }
    } catch (err) {
      console.error('Error enhancing action:', err);
      alert('No se pudo mejorar la acción.');
    } finally {
      setEnhancingAction(false);
    }
  };

  const handleEnhancePlace = async () => {
    if (!onEnhanceField || !data.scene?.placeText?.trim()) return;

    try {
      setEnhancingPlace(true);

      const improved = await onEnhanceField({
        fieldType: 'place',
        value: data.scene.placeText,
        shot: data,
      });

      if (improved && typeof improved === 'string') {
        set('scene.placeText', improved.trim());
      }
    } catch (err) {
      console.error('Error enhancing place:', err);
      alert('No se pudo mejorar el lugar o fondo.');
    } finally {
      setEnhancingPlace(false);
    }
  };

  const handleSave = () => {
    onSave?.(data);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.panelHeader}>
          <div style={styles.panelTitle}>
            <span style={styles.editingLabel}>EDITING</span>
            <input
              value={data.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Shot name..."
              style={styles.nameInput}
            />
          </div>

          <div style={styles.panelActions}>
            <button style={styles.btnSave} onClick={handleSave}>
              GUARDAR
            </button>
            <button style={styles.btnClose} onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div style={styles.tabs}>
          {TABS.map((tab) => (
            <button
              key={tab}
              style={{
                ...styles.tab,
                ...(activeTab === tab ? styles.tabActive : {}),
              }}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div style={styles.content}>
          <Field label="ACTION">
            <textarea
              value={data.transition.actionText}
              onChange={(e) => set('transition.actionText', e.target.value)}
              placeholder="Describe la acción..."
              style={styles.textarea}
            />
            <div style={styles.actionRow}>
              <button
                type="button"
                onClick={handleEnhanceAction}
                disabled={
                  enhancingAction ||
                  !data.transition.actionText?.trim() ||
                  !onEnhanceField
                }
                style={{
                  ...styles.enhanceBtn,
                  opacity:
                    enhancingAction ||
                    !data.transition.actionText?.trim() ||
                    !onEnhanceField
                      ? 0.6
                      : 1,
                  cursor:
                    enhancingAction ||
                    !data.transition.actionText?.trim() ||
                    !onEnhanceField
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {enhancingAction ? 'MEJORANDO...' : '✨ MEJORAR ACTION'}
              </button>
            </div>
          </Field>

          <Field label="LUGAR / FONDO">
            <textarea
              value={data.scene.placeText}
              onChange={(e) => set('scene.placeText', e.target.value)}
              placeholder="Describe el lugar o fondo compartido..."
              style={styles.textarea}
            />
            <div style={styles.actionRow}>
              <button
                type="button"
                onClick={handleEnhancePlace}
                disabled={
                  enhancingPlace || !data.scene.placeText?.trim() || !onEnhanceField
                }
                style={{
                  ...styles.enhanceBtn,
                  opacity:
                    enhancingPlace || !data.scene.placeText?.trim() || !onEnhanceField
                      ? 0.6
                      : 1,
                  cursor:
                    enhancingPlace || !data.scene.placeText?.trim() || !onEnhanceField
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                {enhancingPlace ? 'MEJORANDO...' : '✨ MEJORAR FONDO'}
              </button>
            </div>
          </Field>

          {activeTab === 'CÁMARA' && (
            <div style={styles.grid2}>
              <div style={styles.frameCol}>
                <div style={styles.colHeader}>
                  <span style={styles.colDot} />
                  <span style={styles.colLabel}>INICIO</span>
                </div>

                <Field label="Encuadre">
                  <Select
                    value={data.frame_start.shot}
                    options={SHOT_SIZES}
                    onChange={(v) => set('frame_start.shot', v)}
                  />
                </Field>

                <Field label="Ángulo">
                  <Select
                    value={data.frame_start.angle}
                    options={ANGLES}
                    onChange={(v) => set('frame_start.angle', v)}
                  />
                </Field>
              </div>

              <div style={styles.frameCol}>
                <div style={styles.colHeader}>
                  <span style={{ ...styles.colDot, background: '#00D084' }} />
                  <span style={styles.colLabel}>FIN</span>
                </div>

                <Field label="Encuadre">
                  <Select
                    value={data.frame_end.shot}
                    options={SHOT_SIZES}
                    onChange={(v) => set('frame_end.shot', v)}
                  />
                </Field>

                <Field label="Ángulo">
                  <Select
                    value={data.frame_end.angle}
                    options={ANGLES}
                    onChange={(v) => set('frame_end.angle', v)}
                  />
                </Field>
              </div>
            </div>
          )}

          {activeTab === 'ILUMINACIÓN' && (
            <div style={styles.singleCol}>
              <Field label="Esquema">
                <Select
                  value={data.frame_start.lighting.scheme}
                  options={LIGHTING_SCHEMES}
                  onChange={(v) => set('frame_start.lighting.scheme', v)}
                />
              </Field>

              <Field label="Ambiente">
                <Select
                  value={data.frame_start.lighting.mood}
                  options={LIGHTING_MOODS}
                  onChange={(v) => set('frame_start.lighting.mood', v)}
                />
              </Field>
            </div>
          )}

          {activeTab === 'TRANSICIÓN' && (
            <div style={styles.singleCol}>
              <Field label="Movimiento">
                <Select
                  value={data.transition.cameraMove}
                  options={CAMERA_MOVES}
                  onChange={(v) => set('transition.cameraMove', v)}
                />
              </Field>

              <Field label="Background Mode">
                <Select
                  value={data.scene.backgroundMode}
                  options={BACKGROUND_MODES}
                  onChange={(v) => set('scene.backgroundMode', v)}
                />
              </Field>

              <Field label={`Intensidad: ${data.transition.intensity}`}>
                <input
                  type="range"
                  min="0.1"
                  max="0.4"
                  step="0.01"
                  value={data.transition.intensity}
                  onChange={(e) =>
                    set('transition.intensity', parseFloat(e.target.value))
                  }
                  style={styles.range}
                />
                <div style={styles.rangeLabels}>
                  <span>Suave</span>
                  <span>Dramático</span>
                </div>
                {data.duration_seconds > 8 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#9CA3AF', lineHeight: 1.4 }}>
                    Veo continuo en Vertex: 20s = 8s base + extensiones de 7s + trim final.
                  </div>
                )}
              </Field>

              <Field label="Timing">
                <Select
                  value={data.transition.timing}
                  options={[
                    { id: 'ease-out', label: 'Ease Out' },
                    { id: 'ease-in', label: 'Ease In' },
                    { id: 'ease-in-out', label: 'Ease In Out' },
                    { id: 'linear', label: 'Linear' },
                  ]}
                  onChange={(v) => set('transition.timing', v)}
                />
              </Field>

              <Field label="Duración (segundos)">
                <div style={styles.durationRow}>
                  {[3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map((d) => (
                    <button
                      key={d}
                      onClick={() => set('duration_seconds', d)}
                      style={{
                        ...styles.durationBtn,
                        ...(data.duration_seconds === d
                          ? styles.durationBtnActive
                          : {}),
                      }}
                    >
                      {d}s
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={fieldStyles.label}>{label}</label>
      {children}
    </div>
  );
}

function Select({ value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={fieldStyles.select}
    >
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const fieldStyles = {
  label: {
    display: 'block',
    fontSize: 10,
    fontWeight: 700,
    color: '#888',
    letterSpacing: '0.1em',
    marginBottom: 6,
    fontFamily: 'monospace',
  },
  select: {
    width: '100%',
    background: '#2A2A2A',
    border: '1px solid #444',
    borderRadius: 4,
    color: '#DDD',
    padding: '7px 10px',
    fontSize: 12,
    outline: 'none',
    cursor: 'pointer',
  },
};

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  panel: {
    background: '#3A3A3A',
    border: '1px solid #4A4A4A',
    borderRadius: 8,
    width: '100%',
    maxWidth: 640,
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid #4A4A4A',
  },
  panelTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  editingLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: '#00A8E8',
    letterSpacing: '0.12em',
    fontFamily: 'monospace',
  },
  nameInput: {
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid #555',
    color: '#FFF',
    fontSize: 14,
    fontWeight: 600,
    outline: 'none',
    padding: '2px 4px',
    width: 200,
  },
  panelActions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  btnSave: {
    background: '#00A8E8',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    padding: '6px 16px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
    cursor: 'pointer',
    fontFamily: 'monospace',
  },
  btnClose: {
    background: 'transparent',
    border: '1px solid #555',
    borderRadius: 4,
    color: '#888',
    padding: '6px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid #4A4A4A',
    padding: '0 16px',
  },
  tab: {
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#666',
    padding: '10px 14px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
    cursor: 'pointer',
    fontFamily: 'monospace',
    transition: 'color 0.15s',
  },
  tabActive: {
    color: '#00A8E8',
    borderBottomColor: '#00A8E8',
  },
  content: {
    padding: 20,
    overflowY: 'auto',
    flex: 1,
  },
  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 20,
  },
  frameCol: {
    display: 'flex',
    flexDirection: 'column',
  },
  colHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  colDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#00A8E8',
  },
  colLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: '#888',
    letterSpacing: '0.12em',
    fontFamily: 'monospace',
  },
  singleCol: {
    maxWidth: 320,
  },
  range: {
    width: '100%',
    accentColor: '#00A8E8',
    cursor: 'pointer',
  },
  rangeLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 9,
    color: '#666',
    fontFamily: 'monospace',
    marginTop: 4,
  },
  durationRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  durationBtn: {
    background: '#2A2A2A',
    border: '1px solid #444',
    borderRadius: 4,
    color: '#888',
    padding: '6px 14px',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'monospace',
    transition: 'all 0.1s',
  },
  durationBtnActive: {
    background: '#00A8E8',
    borderColor: '#00A8E8',
    color: '#fff',
  },
  textarea: {
    width: '100%',
    minHeight: 88,
    resize: 'vertical',
    background: '#2A2A2A',
    border: '1px solid #444',
    borderRadius: 4,
    color: '#DDD',
    padding: '10px 12px',
    fontSize: 12,
    outline: 'none',
    fontFamily: 'inherit',
    lineHeight: 1.5,
    boxSizing: 'border-box',
  },
  actionRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  enhanceBtn: {
    background: 'transparent',
    border: '1px solid #00A8E8',
    borderRadius: 4,
    color: '#00A8E8',
    padding: '7px 12px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    fontFamily: 'monospace',
  },
};