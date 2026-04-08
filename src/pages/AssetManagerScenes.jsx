// AssetManagerScenes.jsx
// Pestaña ESCENAS del AssetManager.
// Gestiona las 2 vistas visibles de cada escenario de fondo:
//   🎯 FRONTAL (0°)   → shots frontales y 3/4
//   🔄 TRASERO (180°) → tomas traseras
//
// Las columnas DB lateral_der / lateral_izq se conservan pero no se muestran en UI.
//
// Exports: ScenesTab
// Usado por: AssetManager.jsx

import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase/client';
import { createGroundingAgent } from '../services/GroundingAgent';
import {
  C,
  uploadBase64ToSupabase,
  uploadFileToSupabase,
  generateSceneSheet,
  buildScenePrompt,
  buildSceneBackPrompt,
} from '../services/assetUtils';

// ── Vistas visibles en UI — mapeadas a columnas DB ───────────
const ALL_SCENE_VIEWS = {
  frontal: {
    dbCol:    'image_url',
    label:    '🎯 FRONTAL',
    desc:     'frontal · 3/4 der · 3/4 izq',
    angleDeg: 0,
  },
  lateral_der: {
    dbCol:    'image_url_lateral_der',
    label:    '↗ LATERAL DER',
    desc:     'perfil derecho',
    angleDeg: 90,
  },
  lateral_izq: {
    dbCol:    'image_url_lateral_izq',
    label:    '↖ LATERAL IZQ',
    desc:     'perfil izquierdo',
    angleDeg: 270,
  },
  trasero: {
    dbCol:    'image_url_back',
    label:    '🔄 TRASERO',
    desc:     'tomas traseras',
    angleDeg: 180,
  },
};

const VISIBLE_SCENE_VIEWS = ['frontal', 'trasero'];

function sceneBtnStyle(bg) {
  return {
    background:  bg,
    border:      'none',
    borderRadius: 3,
    color:       '#fff',
    fontSize:    8,
    fontWeight:  700,
    padding:     '4px 8px',
    cursor:      'pointer',
    fontFamily:  'monospace',
  };
}

// ============================================================
// SCENES TAB
// ============================================================
export function ScenesTab({ scenes, setScenes, projectId, userId, ContractBanner }) {

  async function addScene() {
    const { data, error } = await supabase.from('scene_assets').insert({
      project_id:  projectId,
      name:        `Escena ${scenes.length + 1}`,
      description: '',
      image_url:   null,
    }).select().single();
    if (error) { alert(error.message); return; }
    setScenes(prev => [...prev, data]);
  }

  async function deleteScene(id) {
    if (!window.confirm('¿Eliminar esta escena?')) return;
    await supabase.from('scene_assets').delete().eq('id', id);
    setScenes(prev => prev.filter(s => s.id !== id));
  }

  async function updateScene(id, patch) {
    const { data } = await supabase
      .from('scene_assets').update(patch).eq('id', id).select().single();
    setScenes(prev => prev.map(s => s.id === id ? data : s));
  }

  return (
    <div>
      <ContractBanner
        icon="🌆"
        text="Las escenas son SAGRADAS. El DAG usa SIEMPRE este fondo — nunca inventa una ciudad, interior o ambiente. El sistema elige automáticamente la vista correcta según el ángulo del shot."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16, marginTop: 16 }}>
        {scenes.map(scene => (
          <SceneCard
            key={scene.id}
            scene={scene}
            projectId={projectId}
            userId={userId}
            onUpdate={patch => updateScene(scene.id, patch)}
            onDelete={() => deleteScene(scene.id)}
          />
        ))}

        <button
          onClick={addScene}
          style={{
            background: C.panel, border: `2px dashed ${C.border}`,
            borderRadius: 8, padding: '40px 24px', cursor: 'pointer',
            color: C.muted, fontSize: 11, letterSpacing: '0.1em', fontFamily: 'monospace',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            minHeight: 200,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
        >
          <span style={{ fontSize: 28 }}>＋</span>
          <span>NUEVA ESCENA</span>
        </button>
      </div>
    </div>
  );
}

// ============================================================
// SCENE CARD
// ============================================================
function SceneCard({ scene, projectId, userId, onUpdate, onDelete }) {
  const [name,        setName]        = useState(scene.name        || '');
  const [description, setDescription] = useState(scene.description || '');
  const [images,      setImages]      = useState({
    frontal:     scene.image_url             || null,
    lateral_der: scene.image_url_lateral_der || null,
    lateral_izq: scene.image_url_lateral_izq || null,
    trasero:     scene.image_url_back        || null,
  });
  const [generating, setGenerating] = useState({});

  const fileRefs = {
    frontal: useRef(null),
    trasero: useRef(null),
  };

  async function saveText() {
    await onUpdate({ name, description });
  }

  async function saveView(viewKey, base64) {
    const view = ALL_SCENE_VIEWS[viewKey];
    const path = `${userId}/${projectId}/scenes/${scene.id}_${viewKey}_${Date.now()}.jpg`;
    const url  = await uploadBase64ToSupabase(base64, 'scene-assets', path);
    await onUpdate({ [view.dbCol]: url });
    setImages(p => ({ ...p, [viewKey]: url }));
    return url;
  }

  // ============================================================
  // GENERAR LAS 2 VISTAS — sheet 2x2, subir frontal y trasera
  // ============================================================
  async function generateAllViews() {
    if (!description.trim()) { alert('Escribe la descripción primero'); return; }
    setGenerating({ frontal: true, trasero: true });
    try {
      const frontalRef = images.frontal || null;
      const crops = await generateSceneSheet({ description }, frontalRef);
      await Promise.all(
        Object.keys(ALL_SCENE_VIEWS).map(async (viewKey) => {
          const b64 = crops[viewKey];
          if (!b64) return;
          try { await saveView(viewKey, b64); }
          catch (e) { console.error(`Error subiendo ${viewKey}:`, e.message); }
        })
      );
    } catch (e) {
      alert(`Error generando vistas: ${e.message}`);
    } finally {
      setGenerating({});
    }
  }

  // ============================================================
  // REGEN INDIVIDUAL — GroundingAgent para evitar alucinación
  // ============================================================
  async function generateView(viewKey) {
    if (!description.trim()) { alert('Escribe la descripción de la escena primero'); return; }
    setGenerating(p => ({ ...p, [viewKey]: true }));
    try {
      // Prompt según la vista que se regenera
      const sceneObj = { description };
      const prompt = viewKey === 'trasero'
        ? buildSceneBackPrompt(sceneObj)
        : buildScenePrompt(sceneObj, viewKey);

      // Referencias: si hay frontal disponible, pasarla como ancla visual
      const refs = images.frontal && viewKey !== 'frontal'
        ? [images.frontal]
        : [];

      const agent = createGroundingAgent(({ step, attempt }) => {
        console.log(`[SceneAgent:${viewKey}] ${step} — intento ${attempt}`);
      });

      const result = await agent.generate({
        refs,
        prompt,
        aspectRatio: '16:9',
        maxRetries:  2,
      });

      await saveView(viewKey, result.imageBase64);

      if (result.warnings?.length) {
        console.warn(`[SceneAgent:${viewKey}] Warnings:`, result.warnings);
      }
    } catch (e) {
      alert(`Error generando ${viewKey}: ${e.message}`);
    } finally {
      setGenerating(p => ({ ...p, [viewKey]: false }));
    }
  }

  async function handleFile(viewKey, file) {
    if (!file) return;
    setGenerating(p => ({ ...p, [viewKey]: true }));
    try {
      const view = ALL_SCENE_VIEWS[viewKey];
      const path = `${userId}/${projectId}/scenes/${scene.id}_${viewKey}_${Date.now()}.${file.name.split('.').pop()}`;
      const url  = await uploadFileToSupabase(file, 'scene-assets', path);
      await onUpdate({ [view.dbCol]: url });
      setImages(p => ({ ...p, [viewKey]: url }));
    } catch (e) {
      alert(`Error subiendo: ${e.message}`);
    } finally {
      setGenerating(p => ({ ...p, [viewKey]: false }));
    }
  }

  async function clearView(viewKey) {
    const view = ALL_SCENE_VIEWS[viewKey];
    await onUpdate({ [view.dbCol]: null });
    setImages(p => ({ ...p, [viewKey]: null }));
  }

  const filledCount   = ['frontal', 'trasero'].filter(k => images[k]).length;
  const anyGenerating = Object.values(generating).some(Boolean);

  return (
    <div style={{
      background:  C.panel,
      border:      `1px solid ${C.border}`,
      borderRadius: 8,
      overflow:    'hidden',
      boxShadow:   filledCount === 2
        ? `0 0 0 1px ${C.success}33`
        : filledCount > 0 ? `0 0 0 1px ${C.warning}33` : 'none',
    }}>

      {/* ── Header ── */}
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input
            value={name} onChange={e => setName(e.target.value)} onBlur={saveText}
            style={{
              flex: 1, background: 'transparent', border: 'none', color: C.text,
              fontSize: 11, fontWeight: 700, fontFamily: 'monospace', outline: 'none',
            }}
            placeholder="Nombre de la escena..."
          />
          <span style={{
            fontSize: 8, fontFamily: 'monospace', letterSpacing: '0.08em',
            color:      filledCount === 2 ? C.success : C.muted,
            background: filledCount === 2 ? `${C.success}18` : C.border,
            padding: '2px 8px', borderRadius: 10,
          }}>
            {filledCount}/2
          </span>
          <button onClick={onDelete} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: C.dim, fontSize: 13,
          }}>✕</button>
        </div>

        <textarea
          value={description} onChange={e => setDescription(e.target.value)} onBlur={saveText}
          placeholder="Ej: Barrio Usaquén, Bogotá, tarde nublada, luz cálida, calles adoquinadas, cafeterías coloniales..."
          rows={2}
          style={{
            width: '100%', boxSizing: 'border-box', background: C.card,
            border: `1px solid ${C.border}`, color: C.text, fontSize: 10,
            fontFamily: 'monospace', borderRadius: 4, padding: '6px 9px',
            resize: 'none', outline: 'none',
          }}
        />

        <button
          onClick={generateAllViews}
          disabled={!description.trim() || anyGenerating}
          style={{
            marginTop: 8, width: '100%',
            background: description.trim() ? C.accent : C.card,
            border: 'none', borderRadius: 4,
            color:   description.trim() ? '#000' : C.dim,
            fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            padding: '6px 0', cursor: description.trim() ? 'pointer' : 'not-allowed',
            fontFamily: 'monospace', opacity: anyGenerating ? 0.5 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {anyGenerating ? '⟳ GENERANDO...' : '⚡ GENERAR 2 VISTAS'}
        </button>
        {!anyGenerating && description.trim() && (
          <div style={{ fontSize: 7, color: C.dim, marginTop: 4, letterSpacing: '0.06em', lineHeight: 1.5 }}>
            Wireframe 3D → Gemini → frontal + trasera
          </div>
        )}
      </div>

      {/* ── 2 slots en columna ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: C.border }}>
        {VISIBLE_SCENE_VIEWS.map(viewKey => {
          const view = ALL_SCENE_VIEWS[viewKey];
          return (
            <div key={viewKey} style={{ background: C.panel }}>
              <div style={{
                padding: '5px 8px', background: C.card,
                borderBottom: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 8, color: C.accent, fontWeight: 700, letterSpacing: '0.1em' }}>
                    {view.label}
                  </div>
                  <div style={{ fontSize: 7, color: C.dim, letterSpacing: '0.06em' }}>
                    {view.desc}
                  </div>
                </div>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: images[viewKey] ? C.success : C.dim,
                }} />
              </div>

              <div style={{ position: 'relative', aspectRatio: '16/9', background: C.card }}>
                {images[viewKey] ? (
                  <>
                    <img
                      key={images[viewKey]}
                      src={images[viewKey]}
                      alt={view.label}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    <div
                      style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(0,0,0,0.75)',
                        display: 'flex', flexWrap: 'wrap', gap: 4,
                        alignItems: 'center', justifyContent: 'center',
                        opacity: 0, transition: 'opacity 0.2s', padding: 6,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                    >
                      <button onClick={() => generateView(viewKey)} style={sceneBtnStyle(C.accent)}>
                        ⚡ REGEN
                      </button>
                      <button onClick={() => fileRefs[viewKey]?.current?.click()} style={sceneBtnStyle('#555')}>
                        📁
                      </button>
                      <button onClick={() => clearView(viewKey)} style={sceneBtnStyle(C.error)}>
                        ✕
                      </button>
                    </div>
                  </>
                ) : generating[viewKey] ? (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 6, background: 'linear-gradient(135deg, #0a1628, #0d2040)',
                  }}>
                    <div style={{ fontSize: 9, color: C.accent, letterSpacing: '0.1em' }}>
                      GENERANDO...
                    </div>
                    <div style={{ fontSize: 7, color: C.dim, letterSpacing: '0.06em', textAlign: 'center', padding: '0 8px' }}>
                      wireframe → IA
                    </div>
                  </div>
                ) : (
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}>
                    <button
                      onClick={() => generateView(viewKey)}
                      disabled={!description.trim()}
                      style={{
                        background:   description.trim() ? C.accent : C.card,
                        border:       'none', borderRadius: 3,
                        color:        description.trim() ? '#000' : C.dim,
                        fontSize:     8, fontWeight: 700, padding: '4px 8px',
                        cursor:       description.trim() ? 'pointer' : 'not-allowed',
                        fontFamily:   'monospace',
                      }}
                    >
                      ⚡ IA
                    </button>
                    <button
                      onClick={() => fileRefs[viewKey]?.current?.click()}
                      style={{
                        background: C.card, border: `1px solid ${C.border}`,
                        borderRadius: 3, color: C.muted, fontSize: 8,
                        padding: '4px 8px', cursor: 'pointer', fontFamily: 'monospace',
                      }}
                    >
                      📁
                    </button>
                  </div>
                )}
              </div>

              {/* Input file — solo para slots visibles */}
              {fileRefs[viewKey] && (
                <input
                  ref={fileRefs[viewKey]}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    if (e.target.files?.[0]) handleFile(viewKey, e.target.files[0]);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}