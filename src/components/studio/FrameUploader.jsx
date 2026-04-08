// src/components/studio/FrameUploader.jsx
import React, { useState, useRef, useEffect } from 'react';
import { characterStorage, shotStorage } from '../../lib/supabase/storage';
import { characterAssetsDB }             from '../../lib/supabase/database';
import { supabase }                      from '../../lib/supabase/client';
import DropZone                          from './DropZone';
import TurnaroundSlot                    from './TurnaroundSlot';
import ManualPromptSection               from './ManualPromptSection';

const C = {
  bg:      '#2A2A2A',
  panel:   '#333333',
  card:    '#3A3A3A',
  border:  '#404040',
  accent:  '#00A8E8',
  success: '#00D084',
  warning: '#FFB800',
  error:   '#FF4757',
  text:    '#DDDDDD',
  muted:   '#888888',
  dim:     '#555555',
};

const MAX_MB = 10;

export default function FrameUploader({
  shot,
  userId,
  projectId,
  mediaProvider = 'veo',
  globalFrameMode,       // 'exact' | 'reference' — default del proyecto
  onFramesChange, // ({ startUrl, endUrl, turnaround, motionRef, action, frameMode, characters }) => void
}) {
  const [startUrl,    setStartUrl]    = useState(shot?.frame_start?.uploadedImageUrl || shot?.frame_start?.image_url || null);
  const [endUrl,      setEndUrl]      = useState(shot?.frame_end?.uploadedImageUrl   || shot?.frame_end?.image_url   || null);
  const [action,      setAction]      = useState(shot?.frame_start?.action || '');
  const [frameMode,   setFrameMode]   = useState(shot?.frame_start?.frameMode || globalFrameMode || 'exact');
  const [turnaround,  setTurnaround]  = useState({
    front:         shot?.character_assets?.view_front_url         || shot?.character_assets?.front         || null,
    three_quarter: shot?.character_assets?.view_three_quarter_url || shot?.character_assets?.three_quarter || null,
    profile:       shot?.character_assets?.view_side_url          || shot?.character_assets?.profile       || null,
  });
  const [characters, setCharacters]   = useState(shot?.frame_start?.characters || [
    { id: 'char_1', name: 'Personaje 1', role: 'principal', images: {} },
  ]);
  const [motionRef,     setMotionRef]     = useState(null);
  const [uploading,     setUploading]     = useState({});
  const [error,         setError]         = useState(null);
  const [customPrompt,  setCustomPrompt]  = useState(shot?.customPrompt || '');
  const [showPrompt,    setShowPrompt]    = useState(!!(shot?.customPrompt));
  const [dialogue,      setDialogue]      = useState(shot?.dialogue || '');
  const [showDialogue,  setShowDialogue]  = useState(!!(shot?.dialogue));
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [subjectData,   setSubjectData]   = useState([]);  // subjects cargados de AssetManager
  const [sceneData,     setSceneData]     = useState([]);  // scenes cargadas de AssetManager

  // ── Cargar sujetos y escenas de AssetManager al montar ──────
  useEffect(() => {
    if (!projectId) return;
    const loadAssets = async () => {
      setLoadingAssets(true);
      try {
        const { data: subjects } = await supabase
          .from('subject_assets')
          .select('id, name, description, view_front_url, view_three_quarter_url, view_side_url')
          .eq('project_id', projectId)
          .limit(5);

        if (subjects?.length > 0) {
          const assetChars = subjects.map((s, i) => ({
            id:    `asset_${s.id}`,
            name:  s.name || `Personaje ${i + 1}`,
            role:  i === 0 ? 'principal' : 'secundario',
            fromAsset: true,
            images: {
              front:         s.view_front_url         || null,
              three_quarter: s.view_three_quarter_url || null,
              profile:       s.view_side_url          || null,
            },
          }));
          setSubjectData(subjects);
          const existingHasImages = characters.some(c =>
            Object.values(c.images || {}).some(Boolean)
          );
          if (!existingHasImages) {
            setCharacters(assetChars);
            notifyChange({ characters: assetChars });
          }
        }

        const { data: scenes } = await supabase
          .from('scene_assets')
          .select('id, name, description, image_url, image_url_lateral_der, image_url_lateral_izq, image_url_back')
          .eq('project_id', projectId)
          .limit(5);
        if (scenes?.length > 0) setSceneData(scenes);

      } catch (e) {
        console.warn('[FrameUploader] No se pudieron cargar assets:', e.message);
      } finally {
        setLoadingAssets(false);
      }
    };
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // ── Validar archivo ────────────────────────────────────────
  const validateFile = (file) => {
    if (!file.type.startsWith('image/')) {
      setError('Solo se aceptan imágenes JPG, PNG o WebP');
      return false;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`La imagen no puede superar ${MAX_MB}MB`);
      return false;
    }
    return true;
  };

  // ── Upload genérico ────────────────────────────────────────
  const uploadFrame = async (file, key, setter, bucket = 'shot') => {
    if (!validateFile(file)) return;
    setError(null);
    setUploading(prev => ({ ...prev, [key]: true }));

    try {
      let url;
      if (bucket === 'character') {
        url = await characterStorage.uploadView(userId, projectId, file, key);
      } else {
        const blob = new Blob([await file.arrayBuffer()], { type: file.type });
        url = await shotStorage.uploadPreview(userId, projectId, shot?.id || 'new', blob);
      }
      setter(url);
      notifyChange({ [key]: url });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(prev => ({ ...prev, [key]: false }));
    }
  };

  // ── Turnaround upload ──────────────────────────────────────
  const uploadTurnaround = async (file, view) => {
    if (!validateFile(file)) return;
    setUploading(prev => ({ ...prev, [`turn_${view}`]: true }));

    try {
      const url = await characterStorage.uploadView(userId, projectId, file, view);
      await characterAssetsDB.setView(projectId, view, url).catch(err =>
        console.warn(`[FrameUploader] characterAssetsDB.setView warning: ${err.message}`)
      );

      const updated = { ...turnaround, [view]: url };
      setTurnaround(updated);
      notifyChange({ turnaround: updated });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(prev => ({ ...prev, [`turn_${view}`]: false }));
    }
  };

  // ── Motion reference (solo SeedDance) ──────────────────────
  const motionInputRef = useRef();
  const uploadMotionRef = async (file) => {
    if (!file.type.startsWith('video/')) {
      setError('Solo se aceptan videos MP4 para referencia de movimiento');
      return;
    }
    setUploading(prev => ({ ...prev, motion: true }));
    try {
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });
      const url = await shotStorage.uploadVideo(userId, projectId, shot?.id || 'new', blob);
      setMotionRef(url);
      notifyChange({ motionRef: url });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(prev => ({ ...prev, motion: false }));
    }
  };

  // ── Notificar al padre ─────────────────────────────────────
  const notifyChange = (patch) => {
    onFramesChange?.({
      startUrl,
      endUrl,
      turnaround,
      motionRef,
      action,
      frameMode,
      characters,
      customPrompt,
      dialogue,
      ...patch,
    });
  };

  const turnaroundCount = Object.values(turnaround).filter(Boolean).length;
  const totalCharImages = characters.reduce((sum, c) => sum + Object.values(c.images || {}).filter(Boolean).length, 0);
  const isReady = startUrl && endUrl;

  return (
    <div style={styles.wrapper}>

      {/* ── FRAMES START / END ───────────────────────────────── */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>FRAMES</span>
        <span style={{ ...styles.sectionBadge, color: isReady ? C.success : C.dim }}>
          {isReady ? '✓ LISTO' : 'SUBE TUS FOTOGRAMAS'}
        </span>
      </div>

      <div style={styles.framesRow}>
        <DropZone
          label="FOTOGRAMA INICIO"
          sublabel="Min. 720p · JPG PNG WebP"
          imageUrl={startUrl}
          uploading={!!uploading.start}
          onFile={f => uploadFrame(f, 'start', setStartUrl, 'shot')}
          onClear={() => { setStartUrl(null); notifyChange({ startUrl: null }); }}
        />
        <div style={styles.arrow}>→</div>
        <DropZone
          label="FOTOGRAMA FIN"
          sublabel="Min. 720p · JPG PNG WebP"
          imageUrl={endUrl}
          uploading={!!uploading.end}
          onFile={f => uploadFrame(f, 'end', setEndUrl, 'shot')}
          onClear={() => { setEndUrl(null); notifyChange({ endUrl: null }); }}
        />
      </div>

      {/* ── MODO EXACTO / REFERENCIA ──────────────────────────── */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>MODO DE FRAMES</span>
        <span style={{ ...styles.sectionBadge, color: frameMode === 'exact' ? C.success : C.accent }}>
          {frameMode === 'exact' ? 'EXACTO — respeta frames pixel a pixel' : 'REFERENCIA — frames como guía visual'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => { setFrameMode('exact'); notifyChange({ frameMode: 'exact' }); }}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 4, cursor: 'pointer',
            fontSize: 10, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.08em',
            background: frameMode === 'exact' ? C.success : '#1A1A1A',
            color: frameMode === 'exact' ? '#000' : C.muted,
            border: `1px solid ${frameMode === 'exact' ? C.success : C.border}`,
            transition: 'all 0.15s',
          }}
        >
          EXACTO
        </button>
        <button
          onClick={() => { setFrameMode('reference'); notifyChange({ frameMode: 'reference' }); }}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 4, cursor: 'pointer',
            fontSize: 10, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.08em',
            background: frameMode === 'reference' ? C.accent : '#1A1A1A',
            color: frameMode === 'reference' ? '#000' : C.muted,
            border: `1px solid ${frameMode === 'reference' ? C.accent : C.border}`,
            transition: 'all 0.15s',
          }}
        >
          REFERENCIA
        </button>
      </div>

      {/* ── ACCIÓN ENTRE FRAMES ───────────────────────────────── */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>ACCIÓN</span>
        <span style={{ ...styles.sectionBadge, color: action.trim() ? C.success : C.dim }}>
          {action.trim() ? '✓ DEFINIDA' : 'DESCRIBE QUÉ PASA ENTRE LOS FRAMES'}
        </span>
      </div>
      <textarea
        value={action}
        onChange={e => { setAction(e.target.value); notifyChange({ action: e.target.value }); }}
        placeholder="Describe la acción entre los dos fotogramas. Ej: El personaje camina hacia la cámara mientras sonríe. La cámara hace un dolly in suave revelando el producto..."
        rows={3}
        style={{
          width: '100%', boxSizing: 'border-box', resize: 'vertical',
          background: '#1A1A1A', color: C.text, border: `1px solid ${C.border}`,
          borderRadius: 4, padding: '8px 10px', fontSize: 11, fontFamily: 'monospace',
          lineHeight: 1.5, outline: 'none',
        }}
      />

      {/* ── AUDIO / DIÁLOGO (solo Veo) ───────────────────────── */}
      {mediaProvider === 'veo' && (
        <>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionLabel}>AUDIO / DIÁLOGO</span>
            <button
              onClick={() => setShowDialogue(p => !p)}
              style={{
                background: showDialogue ? 'rgba(0,168,232,0.15)' : 'transparent',
                border: `1px solid ${showDialogue ? C.accent : C.border}`,
                borderRadius: 4,
                color: showDialogue ? C.accent : C.muted,
                padding: '2px 10px', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.08em', cursor: 'pointer', fontFamily: 'monospace',
              }}
            >
              {showDialogue ? '● ACTIVO' : '○ OPCIONAL'}
            </button>
          </div>

          {showDialogue && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea
                value={dialogue}
                onChange={e => { setDialogue(e.target.value); notifyChange({ dialogue: e.target.value }); }}
                placeholder={`Escribe el diálogo o audio exacto.\nEj: "Bienvenidos. Hoy les voy a mostrar algo increíble."\n\nSi hay múltiples personajes: el principal habla primero, una línea por clip.`}
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical',
                  background: '#1A1A1A', color: C.text,
                  border: `1px solid ${dialogue.trim() ? C.accent + '80' : C.border}`,
                  borderRadius: 4, padding: '8px 10px',
                  fontSize: 11, fontFamily: 'monospace', lineHeight: 1.5, outline: 'none',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 8, color: C.dim, fontFamily: 'monospace', lineHeight: 1.5 }}>
                  ⚡ Veo aplica automáticamente: <span style={{ color: C.accent }}>Character says: "texto" · No subtitles.</span>
                </span>
                <span style={{ fontSize: 8, color: C.dim, fontFamily: 'monospace', lineHeight: 1.5 }}>
                  Para mejor lip-sync: una línea por clip · plano Medio o CU · máx. 6 segundos de texto
                </span>
              </div>
              {dialogue.trim() && (
                <button
                  onClick={() => { setDialogue(''); notifyChange({ dialogue: '' }); }}
                  style={{
                    alignSelf: 'flex-end', background: 'transparent', border: 'none',
                    color: C.dim, fontSize: 9, cursor: 'pointer', fontFamily: 'monospace',
                  }}
                >limpiar</button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── PERSONAJES (MULTI) ────────────────────────────────── */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>PERSONAJES</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {loadingAssets && (
            <span style={{ fontSize: 8, color: C.accent, fontFamily: 'monospace' }}>⟳ cargando assets...</span>
          )}
          {characters.some(c => c.fromAsset) && (
            <span style={{ fontSize: 8, color: '#9B59B6', fontFamily: 'monospace', background: 'rgba(155,89,182,0.12)', padding: '1px 6px', borderRadius: 8 }}>
              🎨 ASSET MANAGER
            </span>
          )}
          <span style={{ ...styles.sectionBadge, color: totalCharImages > 0 ? C.accent : C.dim }}>
            {characters.length} personaje(s) · {totalCharImages} refs
          </span>
        </div>
      </div>

      {characters.map((char, ci) => (
        <div key={char.id} style={{
          background: '#1A1A1A', border: `1px solid ${C.border}`, borderRadius: 4,
          padding: '8px 10px', marginBottom: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            {char.fromAsset && (
              <span style={{ fontSize: 7, color: '#9B59B6', fontFamily: 'monospace', background: 'rgba(155,89,182,0.15)', padding: '1px 5px', borderRadius: 6, flexShrink: 0 }}>
                🎨
              </span>
            )}
            <input
              value={char.name}
              onChange={e => {
                const updated = [...characters];
                updated[ci] = { ...char, name: e.target.value };
                setCharacters(updated);
                notifyChange({ characters: updated });
              }}
              style={{
                flex: 1, background: 'transparent', color: C.text, border: 'none',
                fontSize: 10, fontWeight: 700, fontFamily: 'monospace', outline: 'none',
              }}
            />
            <select
              value={char.role}
              onChange={e => {
                const updated = [...characters];
                updated[ci] = { ...char, role: e.target.value };
                setCharacters(updated);
                notifyChange({ characters: updated });
              }}
              style={{
                background: '#2A2A2A', color: char.role === 'principal' ? C.success : char.role === 'secundario' ? C.accent : C.muted,
                border: `1px solid ${C.border}`, borderRadius: 3, padding: '2px 6px',
                fontSize: 9, fontFamily: 'monospace', cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="principal">PRINCIPAL</option>
              <option value="secundario">SECUNDARIO</option>
              <option value="extra">EXTRA / IA</option>
            </select>
            {characters.length > 1 && (
              <button
                onClick={() => {
                  const updated = characters.filter((_, i) => i !== ci);
                  setCharacters(updated);
                  notifyChange({ characters: updated });
                }}
                style={{
                  background: 'transparent', border: 'none', color: C.error,
                  cursor: 'pointer', fontSize: 12, padding: '0 4px',
                }}
              >✕</button>
            )}
          </div>
          {char.role !== 'extra' && (
            <div style={{ display: 'flex', gap: 6 }}>
              {['front', 'three_quarter', 'profile'].map(view => (
                <TurnaroundSlot
                  key={view}
                  label={view === 'front' ? 'FRONT' : view === 'three_quarter' ? '3/4' : 'PROFILE'}
                  imageUrl={char.images?.[view]}
                  uploading={!!uploading[`char_${ci}_${view}`]}
                  onFile={async f => {
                    if (!validateFile(f)) return;
                    setUploading(prev => ({ ...prev, [`char_${ci}_${view}`]: true }));
                    try {
                      const url = await characterStorage.uploadView(userId, projectId, f, `${char.id}_${view}`);
                      const updated = [...characters];
                      updated[ci] = { ...char, images: { ...char.images, [view]: url } };
                      setCharacters(updated);
                      notifyChange({ characters: updated });
                    } catch (err) { setError(err.message); }
                    finally { setUploading(prev => ({ ...prev, [`char_${ci}_${view}`]: false })); }
                  }}
                  onClear={() => {
                    const updated = [...characters];
                    updated[ci] = { ...char, images: { ...char.images, [view]: null } };
                    setCharacters(updated);
                    notifyChange({ characters: updated });
                  }}
                />
              ))}
            </div>
          )}
          {char.role === 'extra' && (
            <div style={{ fontSize: 9, color: C.muted, fontFamily: 'monospace', padding: '4px 0' }}>
              La IA generará este personaje automáticamente basándose en el contexto de la escena
            </div>
          )}
        </div>
      ))}

      <button
        onClick={() => {
          const newChar = { id: `char_${Date.now()}`, name: `Personaje ${characters.length + 1}`, role: 'secundario', images: {} };
          const updated = [...characters, newChar];
          setCharacters(updated);
          notifyChange({ characters: updated });
        }}
        style={{
          background: '#1A1A1A', border: `1px dashed ${C.border}`, borderRadius: 4,
          color: C.muted, padding: '6px 0', fontSize: 9, fontFamily: 'monospace',
          cursor: 'pointer', letterSpacing: '0.08em', width: '100%',
        }}
      >
        + AGREGAR PERSONAJE
      </button>

      {/* ── TURNAROUND LEGACY (oculto si hay personajes con imágenes) ── */}
      {totalCharImages === 0 && (
        <>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionLabel}>REFERENCIA DEL PERSONAJE (LEGACY)</span>
            <span style={{ ...styles.sectionBadge, color: turnaroundCount > 0 ? C.accent : C.dim }}>
              {turnaroundCount}/3 images
            </span>
          </div>

          <div style={styles.turnaroundRow}>
            <TurnaroundSlot
              label="FRONT"
              imageUrl={turnaround.front}
              uploading={!!uploading.turn_front}
              onFile={f => uploadTurnaround(f, 'front')}
              onClear={() => { const u = { ...turnaround, front: null }; setTurnaround(u); notifyChange({ turnaround: u }); }}
            />
            <TurnaroundSlot
              label="3/4"
              imageUrl={turnaround.three_quarter}
              uploading={!!uploading.turn_three_quarter}
              onFile={f => uploadTurnaround(f, 'three_quarter')}
              onClear={() => { const u = { ...turnaround, three_quarter: null }; setTurnaround(u); notifyChange({ turnaround: u }); }}
            />
            <TurnaroundSlot
              label="PROFILE"
              imageUrl={turnaround.profile}
              uploading={!!uploading.turn_profile}
              onFile={f => uploadTurnaround(f, 'profile')}
              onClear={() => { const u = { ...turnaround, profile: null }; setTurnaround(u); notifyChange({ turnaround: u }); }}
            />
          </div>
        </>
      )}

      {/* ── MOTION REFERENCE (solo SeedDance) ───────────────── */}
      {mediaProvider === 'seeddance' && (
        <>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionLabel}>REFERENCIA DE MOVIMIENTO</span>
            <span style={{ ...styles.sectionBadge, color: motionRef ? C.success : C.dim }}>
              {motionRef ? '✓ CARGADO' : 'OPCIONAL · VIDEO MP4'}
            </span>
          </div>

          <div
            onClick={() => motionInputRef.current?.click()}
            style={{
              ...styles.motionZone,
              borderColor: motionRef ? C.success : C.border,
              cursor: 'pointer',
            }}
          >
            {uploading.motion ? (
              <span style={{ color: C.accent, fontSize: 12, fontFamily: 'monospace' }}>⟳ UPLOADING...</span>
            ) : motionRef ? (
              <div style={styles.motionLoaded}>
                <span style={{ color: C.success, fontSize: 14 }}>▶</span>
                <span style={{ fontSize: 10, color: C.success, fontFamily: 'monospace' }}>REF. MOVIMIENTO CARGADA</span>
                <button
                  onClick={e => { e.stopPropagation(); setMotionRef(null); notifyChange({ motionRef: null }); }}
                  style={{ background: 'transparent', border: 'none', color: C.error, cursor: 'pointer', fontSize: 11 }}
                >✕</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span style={{ fontSize: 9, color: '#444', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                  DROP VIDEO TO REPLICATE CAMERA MOVEMENT
                </span>
              </div>
            )}
          </div>

          <input
            ref={motionInputRef}
            type="file"
            accept="video/mp4,video/mov,video/webm"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadMotionRef(f); e.target.value = ''; }}
          />
        </>
      )}

      {/* ── PROMPT MANUAL (con IA integrada) ─────────────────── */}
      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>PROMPT MANUAL</span>
        <button
          onClick={() => setShowPrompt(p => !p)}
          style={{
            background: showPrompt ? 'rgba(255,184,0,0.15)' : 'transparent',
            border: `1px solid ${showPrompt ? C.warning : C.border}`,
            borderRadius: 4, color: showPrompt ? C.warning : C.muted,
            padding: '2px 10px', fontSize: 9, fontWeight: 700,
            letterSpacing: '0.08em', cursor: 'pointer', fontFamily: 'monospace',
          }}
        >
          {showPrompt ? '● ACTIVO' : '○ OPCIONAL'}
        </button>
      </div>

      {showPrompt && (
        <ManualPromptSection
          mediaProvider={mediaProvider}
          subjectData={subjectData}
          sceneData={sceneData}
          projectId={projectId}
          customPrompt={customPrompt}
          onPromptChange={(text) => { setCustomPrompt(text); notifyChange({ customPrompt: text }); }}
          onClear={() => { setCustomPrompt(''); notifyChange({ customPrompt: '' }); }}
        />
      )}

      {/* ── ERROR ────────────────────────────────────────────── */}
      {error && (
        <div style={styles.errorBox}>
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'transparent', border: 'none', color: C.error, cursor: 'pointer' }}>✕</button>
        </div>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '14px',
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: C.muted,
    letterSpacing: '0.12em',
    fontFamily: 'monospace',
  },
  sectionBadge: {
    fontSize: 9,
    fontFamily: 'monospace',
    letterSpacing: '0.06em',
  },
  framesRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  arrow: {
    color: C.dim,
    fontSize: 16,
    flexShrink: 0,
  },
  turnaroundRow: {
    display: 'flex',
    gap: 8,
  },
  motionZone: {
    height: 44,
    background: '#1A1A1A',
    border: '1px dashed',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'border-color 0.15s',
  },
  motionLoaded: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  errorBox: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(255,71,87,0.1)',
    border: `1px solid ${C.error}`,
    borderRadius: 4,
    padding: '6px 10px',
    fontSize: 10,
    color: C.error,
    fontFamily: 'monospace',
  },
};