// AssetManagerSubjects.jsx
// Pestaña SUJETOS del AssetManager.
// Gestiona el turnaround de cada sujeto: 3 vistas (frontal · 3/4 · perfil).
// Cada vista se genera con Gemini usando las anteriores como referencia.
//
// Exports: SubjectsTab
// Usado por: AssetManager.jsx

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase/client';
import {
  C,
  SUBJECT_TYPES,
  VIEW_LABELS,
  generateImageWithGemini,
  uploadBase64ToSupabase,
  uploadFileToSupabase,
  buildSubjectViewPrompt,
} from '../services/assetUtils';

// ── Componentes compartidos importados desde el orquestador ──
// ContractBanner se pasa como prop para evitar dependencia circular

// ============================================================
// SUBJECTS TAB
// ============================================================
export function SubjectsTab({ subjects, setSubjects, projectId, userId, ContractBanner }) {

  async function addSubject() {
    const newSub = {
      project_id:  projectId,
      name:        `Sujeto ${subjects.length + 1}`,
      type:        'person',
      description: '',
      view_front_url:         null,
      view_three_quarter_url: null,
      view_side_url:          null,
    };
    const { data, error } = await supabase.from('subject_assets').insert(newSub).select().single();
    if (error) { alert(error.message); return; }
    setSubjects(prev => [...prev, data]);
  }

  async function deleteSubject(id) {
    if (!window.confirm('¿Eliminar este sujeto?')) return;
    await supabase.from('subject_assets').delete().eq('id', id);
    setSubjects(prev => prev.filter(s => s.id !== id));
  }

  async function updateSubject(id, patch) {
    const { data, error } = await supabase
      .from('subject_assets').update(patch).eq('id', id).select().single();
    if (error) { console.error(error); return; }
    setSubjects(prev => prev.map(s => s.id === id ? data : s));
  }

  return (
    <div>
      <ContractBanner
        icon="🔒"
        text="Los sujetos son SAGRADOS. El DAG usa SIEMPRE estas imágenes — nunca inventa. Si no hay imagen, genera con IA y la guarda."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16, marginTop: 16 }}>
        {subjects.map(sub => (
          <SubjectCard
            key={sub.id}
            subject={sub}
            projectId={projectId}
            userId={userId}
            onUpdate={patch => updateSubject(sub.id, patch)}
            onDelete={() => deleteSubject(sub.id)}
          />
        ))}

        <button onClick={addSubject} style={{
          background: C.panel, border: `2px dashed ${C.border}`,
          borderRadius: 8, padding: '40px 24px',
          cursor: 'pointer', color: C.muted, fontSize: 11,
          letterSpacing: '0.1em', fontFamily: 'monospace',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
        >
          <span style={{ fontSize: 28 }}>＋</span>
          <span>NUEVO SUJETO</span>
        </button>
      </div>
    </div>
  );
}

// ============================================================
// SUBJECT CARD — turnaround 3 vistas
// ============================================================
function SubjectCard({ subject, projectId, userId, onUpdate, onDelete }) {
  const [name,        setName]        = useState(subject.name        || '');
  const [type,        setType]        = useState(subject.type        || 'person');
  const [description, setDescription] = useState(subject.description || '');
  const [images,      setImages]      = useState({
    front:         subject.view_front_url         || null,
    three_quarter: subject.view_three_quarter_url || null,
    side:          subject.view_side_url          || null,
  });
  const [generating, setGenerating] = useState({});

  // Ref para leer URLs actuales en funciones async sin stale closure
  const imagesRef = useRef(images);
  useEffect(() => { imagesRef.current = images; }, [images]);

  const typeInfo = SUBJECT_TYPES.find(t => t.id === type) || SUBJECT_TYPES[0];
  const viewKeys = ['front', 'three_quarter', 'side'];
  const viewMap  = { front: typeInfo.views[0], three_quarter: typeInfo.views[1], side: typeInfo.views[2] };

  async function saveText() {
    await onUpdate({ name, type, description });
  }

  async function saveView(viewKey, base64Url) {
    const path = `${userId}/${projectId}/subjects/${subject.id}_${viewKey}_${Date.now()}.jpg`;
    const publicUrl = await uploadBase64ToSupabase(base64Url, 'subject-assets', path);
    const dbCol = viewKey === 'front' ? 'view_front_url'
                : viewKey === 'three_quarter' ? 'view_three_quarter_url'
                : 'view_side_url';
    await onUpdate({ [dbCol]: publicUrl });
    setImages(p => {
      const next = { ...p, [viewKey]: publicUrl };
      imagesRef.current = next;
      return next;
    });
    return publicUrl;
  }

  async function generateView(viewKey) {
    if (!description.trim()) { alert('Primero escribe la descripción del sujeto'); return; }
    setGenerating(p => ({ ...p, [viewKey]: true }));
    try {
      const viewId = viewMap[viewKey];
      const prompt = buildSubjectViewPrompt({ type, description }, viewId, viewKey);
      const curr   = imagesRef.current;
      const refs   = [];
      if (viewKey === 'three_quarter' && curr.front) refs.push(curr.front);
      if (viewKey === 'side') {
        if (curr.front)         refs.push(curr.front);
        if (curr.three_quarter) refs.push(curr.three_quarter);
      }
      const base64 = await generateImageWithGemini(prompt, refs);
      await saveView(viewKey, base64);
    } catch (e) {
      alert(`Error generando imagen: ${e.message}`);
    } finally {
      setGenerating(p => ({ ...p, [viewKey]: false }));
    }
  }

  async function generateAllViews() {
    if (!description.trim()) { alert('Primero escribe la descripción del sujeto'); return; }

    // 1. FRONTAL (base)
    setGenerating(p => ({ ...p, front: true }));
    let frontUrl = null;
    try {
      const base64 = await generateImageWithGemini(
        buildSubjectViewPrompt({ type, description }, viewMap['front'], 'front'), []
      );
      frontUrl = await saveView('front', base64);
    } catch (e) {
      alert(`Error vista frontal: ${e.message}`);
      setGenerating(p => ({ ...p, front: false }));
      return;
    } finally {
      setGenerating(p => ({ ...p, front: false }));
    }

    // 2. TRES CUARTOS (ref: frontal)
    setGenerating(p => ({ ...p, three_quarter: true }));
    let threeQuarterUrl = null;
    try {
      const base64 = await generateImageWithGemini(
        buildSubjectViewPrompt({ type, description }, viewMap['three_quarter'], 'three_quarter'),
        [frontUrl]
      );
      threeQuarterUrl = await saveView('three_quarter', base64);
    } catch (e) {
      alert(`Error vista 3/4: ${e.message}`);
    } finally {
      setGenerating(p => ({ ...p, three_quarter: false }));
    }

    // 3. PERFIL (refs: frontal + 3/4)
    setGenerating(p => ({ ...p, side: true }));
    try {
      const base64 = await generateImageWithGemini(
        buildSubjectViewPrompt({ type, description }, viewMap['side'], 'side'),
        [frontUrl, threeQuarterUrl].filter(Boolean)
      );
      await saveView('side', base64);
    } catch (e) {
      alert(`Error vista perfil: ${e.message}`);
    } finally {
      setGenerating(p => ({ ...p, side: false }));
    }
  }

  async function handleFileUpload(viewKey, file) {
    if (!file) return;
    setGenerating(p => ({ ...p, [viewKey]: true }));
    try {
      const path = `${userId}/${projectId}/subjects/${subject.id}_${viewKey}.${file.name.split('.').pop()}`;
      const publicUrl = await uploadFileToSupabase(file, 'subject-assets', path);
      const dbCol = viewKey === 'front' ? 'view_front_url'
                  : viewKey === 'three_quarter' ? 'view_three_quarter_url'
                  : 'view_side_url';
      await onUpdate({ [dbCol]: publicUrl });
      setImages(p => ({ ...p, [viewKey]: publicUrl }));
    } catch (e) {
      alert(`Error subiendo imagen: ${e.message}`);
    } finally {
      setGenerating(p => ({ ...p, [viewKey]: false }));
    }
  }

  const allGenerated = viewKeys.every(vk => images[vk]);

  return (
    <div style={{
      background: C.panel, border: `1px solid ${C.border}`,
      borderRadius: 8, overflow: 'hidden',
      boxShadow: allGenerated ? `0 0 0 1px ${C.success}33` : 'none',
    }}>
      {/* ── Card header ── */}
      <div style={{
        padding: '12px 14px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <select
          value={type}
          onChange={e => { setType(e.target.value); onUpdate({ type: e.target.value }); }}
          style={{
            background: C.card, border: `1px solid ${C.border}`, color: C.text,
            fontSize: 18, padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
            fontFamily: 'monospace', appearance: 'none',
          }}
        >
          {SUBJECT_TYPES.map(t => (
            <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
          ))}
        </select>

        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={saveText}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            color: C.text, fontSize: 12, fontWeight: 700,
            fontFamily: 'monospace', outline: 'none', letterSpacing: '0.06em',
          }}
          placeholder="Nombre del sujeto..."
        />

        <div style={{
          fontSize: 9, padding: '3px 8px', borderRadius: 10, letterSpacing: '0.08em',
          background: allGenerated ? `${C.success}22` : `${C.warning}22`,
          color: allGenerated ? C.success : C.warning,
          border: `1px solid ${allGenerated ? C.success : C.warning}44`,
        }}>
          {allGenerated ? '✓ COMPLETO' : `${viewKeys.filter(vk => images[vk]).length}/3 VISTAS`}
        </div>

        <button onClick={onDelete} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: C.dim, fontSize: 14, padding: '2px 6px',
        }}>✕</button>
      </div>

      {/* ── Descripción ── */}
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 9, color: C.muted, letterSpacing: '0.1em', marginBottom: 6 }}>
          DESCRIPCIÓN DEL SUJETO
        </div>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          onBlur={saveText}
          placeholder={
            type === 'person'  ? 'Ej: Mujer, colombiana, piel morena, cabello negro rizado, 1.65m, complexión media, ojos café, 28 años...' :
            type === 'vehicle' ? 'Ej: Ferrari 488 Pista, rojo maranello, llantas negras, ligera suciedad en guardabarros...' :
            type === 'moto'    ? 'Ej: Ducati Panigale V4, negro mate, escape titanio, kit racing...' :
            type === 'animal'  ? 'Ej: Labrador dorado, adulto, collar azul marino, pelaje brillante...' :
            type === 'object'  ? 'Ej: Botella Coca-Cola 500ml, vidrio, tapa roja, condensación...' :
            'Describe el lugar con detalle...'
          }
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: C.card, border: `1px solid ${C.border}`,
            color: C.text, fontSize: 11, fontFamily: 'monospace',
            borderRadius: 4, padding: '8px 10px', resize: 'vertical', outline: 'none',
            lineHeight: 1.5,
          }}
        />

        <button
          onClick={generateAllViews}
          disabled={!description.trim() || Object.values(generating).some(Boolean)}
          style={{
            marginTop: 8, background: C.accent, border: 'none', borderRadius: 4,
            color: '#000', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            padding: '7px 14px', cursor: description.trim() ? 'pointer' : 'not-allowed',
            opacity: description.trim() ? 1 : 0.4, fontFamily: 'monospace',
            width: '100%',
          }}
        >
          ⚡ GENERAR LAS 3 VISTAS CON IA
        </button>
      </div>

      {/* ── 3 view slots ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: C.border }}>
        {viewKeys.map(vk => (
          <ViewSlot
            key={vk}
            label={VIEW_LABELS[viewMap[vk]] || vk.toUpperCase()}
            imageUrl={images[vk]}
            generating={!!generating[vk]}
            onGenerate={() => generateView(vk)}
            onFile={f => handleFileUpload(vk, f)}
            onClear={() => {
              setImages(p => ({ ...p, [vk]: null }));
              const dbCol = vk === 'front' ? 'view_front_url'
                          : vk === 'three_quarter' ? 'view_three_quarter_url'
                          : 'view_side_url';
              onUpdate({ [dbCol]: null });
            }}
            canGenerate={!!description.trim()}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// VIEW SLOT — imagen individual con subida / generación
// ============================================================
function ViewSlot({ label, imageUrl, generating, onGenerate, onFile, onClear, canGenerate }) {
  const fileRef = useRef(null);

  return (
    <div style={{ background: C.card, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', aspectRatio: '3/4', minHeight: 160 }}>
        {imageUrl ? (
          <>
            <img src={imageUrl} alt={label} key={imageUrl} style={{
              width: '100%', height: '100%', objectFit: 'cover', display: 'block',
            }} />
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 6, opacity: 0, transition: 'opacity 0.2s',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0'}
            >
              <div style={{ fontSize: 8, color: '#aaa', letterSpacing: '0.1em' }}>HOVER OPTIONS</div>
            </div>
          </>
        ) : generating ? (
          <GeneratingOverlay label={label} />
        ) : (
          <EmptySlot
            label={label}
            canGenerate={canGenerate}
            onGenerate={onGenerate}
            onFile={() => fileRef.current?.click()}
          />
        )}

        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
          padding: '8px 6px 4px',
          fontSize: 8, letterSpacing: '0.12em', color: '#ccc', textAlign: 'center',
        }}>
          {label}
        </div>
      </div>

      {/* Botones siempre visibles */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 3,
        padding: '6px 6px 8px',
        background: C.card, borderTop: `1px solid ${C.border}`,
      }}>
        <button
          onClick={onGenerate}
          disabled={!canGenerate || generating}
          style={{
            background: imageUrl ? '#1A2A3A' : C.accent,
            border: `1px solid ${imageUrl ? C.accent + '55' : 'transparent'}`,
            borderRadius: 3, color: imageUrl ? C.accent : '#000',
            fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
            padding: '4px 0', cursor: canGenerate && !generating ? 'pointer' : 'not-allowed',
            opacity: canGenerate && !generating ? 1 : 0.4,
            fontFamily: 'monospace', width: '100%',
          }}
        >
          {generating ? '...' : imageUrl ? '⚡ REGENERAR' : '⚡ GENERAR'}
        </button>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={generating}
          style={{
            background: '#222', border: `1px solid ${C.border}`,
            borderRadius: 3, color: C.muted,
            fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
            padding: '4px 0', cursor: 'pointer',
            fontFamily: 'monospace', width: '100%',
          }}
        >
          📁 SUBIR
        </button>

        {imageUrl && (
          <button
            onClick={onClear}
            style={{
              background: '#2A1A1A', border: `1px solid ${C.error}44`,
              borderRadius: 3, color: C.error,
              fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
              padding: '4px 0', cursor: 'pointer',
              fontFamily: 'monospace', width: '100%',
            }}
          >
            ✕ LIMPIAR
          </button>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); }} />
    </div>
  );
}

// ── Overlay de generación con animación de puntos ──────────────
function GeneratingOverlay({ label }) {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const iv = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    return () => clearInterval(iv);
  }, []);
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 8,
      background: 'linear-gradient(135deg, #0a1628, #0d2040)',
    }}>
      <div style={{ fontSize: 20 }}>⚡</div>
      <div style={{ fontSize: 8, color: C.accent, letterSpacing: '0.1em' }}>GENERANDO{dots}</div>
      <div style={{ fontSize: 7, color: C.dim }}>{label}</div>
    </div>
  );
}

// ── Slot vacío con botones de acción ──────────────────────────
function EmptySlot({ label, canGenerate, onGenerate, onFile }) {
  const btnBase = {
    border: 'none', borderRadius: 3, fontSize: 8, fontWeight: 700,
    padding: '4px 0', width: '100%', fontFamily: 'monospace', cursor: 'pointer',
  };
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 6,
    }}>
      <div style={{ fontSize: 24, opacity: 0.2 }}>□</div>
      <div style={{ fontSize: 8, color: C.dim, letterSpacing: '0.1em' }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '85%' }}>
        <button onClick={onGenerate} disabled={!canGenerate} style={{
          ...btnBase, background: '#00A8E8', color: '#000',
          opacity: canGenerate ? 1 : 0.3,
        }}>⚡ IA</button>
        <button onClick={onFile} style={{
          ...btnBase, background: '#333', color: '#aaa',
        }}>📁 SUBIR</button>
      </div>
    </div>
  );
}