// AssetManagerShots.jsx
// Pestaña SHOTS del AssetManager.
// Gestiona frame inicio y frame final de cada shot del proyecto.
// Cada frame se genera combinando: Sujeto + Escena + Plano + Eje H + Eje V.
//
// Incluye:
//   - ShotsTab         → lista de ShotFrameCard
//   - ShotFrameCard    → acción + frame inicio + frame final
//   - ShotFrameSlot    → controles plano/ángulo/lente/blur + planograma + imagen
//   - Planograma       → SVG TOP (eje H) + SVG LATERAL (eje V) — ambos interactivos
//
// Exports: ShotsTab
// Usado por: AssetManager.jsx

import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabase/client';
import { createGroundingAgent } from '../services/GroundingAgent';
import {
  C,
  PLANOS, ANGULOS_H, ANGULOS_V, LENTES, DESENFOQUE,
  PLANO_DESCRIPCION, ANGULO_DESCRIPCION_H, ANGULO_DESCRIPCION_V,
  getLensDesc, getBlurDesc,
  uploadBase64ToSupabase,
  uploadFileToSupabase,
  buildStartFramePrompt,
  buildEndFramePrompt,
  pickSceneViewForAngle,
  getSceneRefsForAngle,
} from '../services/assetUtils';

// ============================================================
// SHOTS TAB
// ============================================================
export function ShotsTab({ shots, setShots, projectId, userId, subjects, scenes, format, ContractBanner }) {
  const mainSubject = subjects?.[0] || null;
  const mainScene   = scenes?.[0]   || null;
  const isVertical  = format === '9:16';

  return (
    <div>
      <ContractBanner
        icon="🎬"
        text="Los frames son SAGRADOS. El DAG interpola ENTRE estas dos imágenes. Se genera combinando: Sujeto + Escena (vista automática según ángulo) + Plano + Eje H + Eje V."
      />

      <div style={{ display: 'flex', gap: 10, marginTop: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        <AssetStatusPill
          label="SUJETO" value={mainSubject?.name}
          hasImage={!!(mainSubject?.view_front_url)}
          warn="Sin sujeto — ve a pestaña SUJETOS"
        />
        <AssetStatusPill
          label="ESCENA" value={mainScene?.name}
          hasImage={!!(mainScene?.image_url)}
          warn="Sin escena — ve a pestaña ESCENAS"
        />
        <AssetStatusPill label="FORMATO" value={format} hasImage={true} warn="—" />
      </div>

      {shots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: C.muted, fontSize: 11, letterSpacing: '0.1em' }}>
          No hay shots en este proyecto.<br />
          <a href={`/studio/${projectId}`} style={{ color: C.accent, textDecoration: 'none' }}>→ Crear shots en Studio</a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {shots.map(shot => (
            <ShotFrameCard
              key={shot.id}
              shot={shot}
              projectId={projectId}
              userId={userId}
              mainSubject={mainSubject}
              mainScene={mainScene}
              isVertical={isVertical}
              onUpdate={updated => setShots(prev => prev.map(s => s.id === shot.id ? { ...s, ...updated } : s))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Asset Status Pill ─────────────────────────────────────────
function AssetStatusPill({ label, value, hasImage, warn }) {
  const ok = value && hasImage;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: ok ? `${C.success}11` : `${C.warning}11`,
      border: `1px solid ${ok ? C.success : C.warning}44`,
      borderRadius: 20, padding: '4px 12px',
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? C.success : C.warning }} />
      <span style={{ fontSize: 9, color: ok ? C.success : C.warning, letterSpacing: '0.08em', fontFamily: 'monospace' }}>
        {label}: {ok ? value : warn}
      </span>
    </div>
  );
}

// ============================================================
// SHOT FRAME CARD
// ============================================================
function ShotFrameCard({ shot, projectId, userId, mainSubject, mainScene, isVertical, onUpdate }) {
  const [startUrl,  setStartUrl]  = useState(shot.frame_start?.image_url || null);
  const [endUrl,    setEndUrl]    = useState(shot.frame_end?.image_url   || null);
  const [genStart,  setGenStart]  = useState(false);
  const [genEnd,    setGenEnd]    = useState(false);
  const [action,    setAction]    = useState(shot.transition?.actionText || '');

  const [startShot,   setStartShot]   = useState(shot.frame_start?.camera?.shotSize || shot.frame_start?.shot  || 'plano_medio');
  const [startAngle,  setStartAngle]  = useState(shot.frame_start?.camera?.angle    || shot.frame_start?.angle || 'frontal');
  const [endShot,     setEndShot]     = useState(shot.frame_end?.camera?.shotSize   || shot.frame_end?.shot    || 'primer_plano');
  const [endAngle,    setEndAngle]    = useState(shot.frame_end?.camera?.angle      || shot.frame_end?.angle   || 'frontal');
  const [startAngleV, setStartAngleV] = useState(shot.frame_start?.camera?.angle_v || 'normal');
  const [endAngleV,   setEndAngleV]   = useState(shot.frame_end?.camera?.angle_v   || 'normal');
  const [startLens,   setStartLens]   = useState(shot.frame_start?.camera?.lens || '50mm');
  const [startBlur,   setStartBlur]   = useState(shot.frame_start?.camera?.blur || 'nitido');
  const [endLens,     setEndLens]     = useState(shot.frame_end?.camera?.lens   || '50mm');
  const [endBlur,     setEndBlur]     = useState(shot.frame_end?.camera?.blur   || 'nitido');

  const [showPlanStart, setShowPlanStart] = useState(false);
  const [showPlanEnd,   setShowPlanEnd]   = useState(false);

  // ── Ficha técnica manual — grounding directo sin análisis de imágenes ──
  const [subjectDesc, setSubjectDesc] = useState(
    shot.frame_start?.manual_grounding?.subjectDescription || ''
  );
  const [sceneDesc, setSceneDesc] = useState(
    shot.frame_start?.manual_grounding?.sceneDescription || ''
  );
  const [showManualGrounding, setShowManualGrounding] = useState(false);

  const startRef    = useRef(null);
  const endRef      = useRef(null);
  const aspectRatio = isVertical ? '9:16' : '16:9';

  async function saveAction(val) {
    const patch = { transition: { ...(shot.transition || {}), actionText: val } };
    await supabase.from('shots').update(patch).eq('id', shot.id);
    onUpdate(patch);
  }

  // ── GENERAR FRAME INICIO ──────────────────────────────────────
  async function generateStartFrame() {
    setGenStart(true);
    try {
      const prompt       = buildStartFramePrompt(mainSubject, mainScene, startShot, startAngle, startAngleV, action, startLens, startBlur);
      const sceneViewUrl = pickSceneViewForAngle(mainScene, startAngle);
      const subjectRefs = [
        mainSubject?.view_front_url,
        mainSubject?.view_three_quarter_url,
        mainSubject?.view_side_url,
      ].filter(Boolean);
      const sceneRefs = sceneViewUrl ? [sceneViewUrl] : [];

      const agent = createGroundingAgent(({ step, attempt }) => {
        console.log(`[ShotAgent:START] ${step} — intento ${attempt}`);
      });

      const startPlano = PLANO_DESCRIPCION[startShot] || { en: startShot, body: 'subject visible in frame' };
      const result = await agent.generate({
        subjectRefs, sceneRefs, prompt, aspectRatio, maxRetries: 2,
        // Ficha técnica manual: si el usuario la completó, se usa en lugar del análisis automático
        manualGrounding: (subjectDesc.trim() || sceneDesc.trim()) ? {
          subjectDescription: subjectDesc.trim(),
          sceneDescription:   sceneDesc.trim(),
        } : null,
        cinematicParams: {
          shotSize:     startShot,
          shotSizeDesc: startPlano.en,
          shotSizeBody: startPlano.body,
          angleH:       startAngle,
          angleHDesc:   ANGULO_DESCRIPCION_H[startAngle] || startAngle,
          angleV:       startAngleV,
          angleVDesc:   ANGULO_DESCRIPCION_V[startAngleV] || startAngleV,
          lensDesc:     getLensDesc(startLens),
          blurDesc:     getBlurDesc(startBlur),
        },
      });

      if (result.warnings?.length) {
        console.warn('[ShotAgent:START] Warnings:', result.warnings);
      }

      const path = `${userId}/${projectId}/shots/${shot.id}_start_${Date.now()}.jpg`;
      const url  = await uploadBase64ToSupabase(result.imageBase64, 'shot-results', path);

      const newFrame = {
        ...(shot.frame_start || {}),
        image_url: url,
        shot:      startShot,
        camera: {
          ...(shot.frame_start?.camera || {}),
          shotSize: startShot,
          angle:    startAngle,
          angle_v:  startAngleV,
          lens:     startLens,
          blur:     startBlur,
        },
      };
      const patch = { frame_start: newFrame };
      await supabase.from('shots').update(patch).eq('id', shot.id);
      onUpdate(patch);
      setStartUrl(url);
    } catch (e) {
      alert(`Error frame inicio: ${e.message}`);
    } finally {
      setGenStart(false);
    }
  }

  // ── GENERAR FRAME FINAL ───────────────────────────────────────
  async function generateEndFrame() {
    if (!startUrl) {
      alert('Genera el frame inicio primero');
      return;
    }
    setGenEnd(true);
    try {
      const sameCamera =
        startShot   === endShot   &&
        startAngle  === endAngle  &&
        startAngleV === endAngleV &&
        startLens   === endLens   &&
        startBlur   === endBlur;

      const subjectRefs = [
        mainSubject?.view_front_url,
        mainSubject?.view_three_quarter_url,
        mainSubject?.view_side_url,
      ].filter(Boolean);

      const sceneRefs = getSceneRefsForAngle(mainScene, endAngle);

      const prompt = buildEndFramePrompt(
        mainSubject, mainScene, action,
        endShot, endAngle, endAngleV, endLens, endBlur,
        { preserveBackgroundExactly: sameCamera }
      );

      // sceneRefs ya tiene la vista correcta para el ángulo final.
      // startUrl NO va en refs — evita que Gemini copie el plano del frame inicio.
      // El agente recibe sujeto y escena por separado para etiquetar su rol exacto.

      const agent = createGroundingAgent(({ step, attempt }) => {
        console.log(`[ShotAgent:END] ${step} — intento ${attempt}`);
      });

      const endPlano = PLANO_DESCRIPCION[endShot] || { en: endShot, body: 'subject visible in frame' };
      const result = await agent.generate({
        subjectRefs, sceneRefs, prompt, aspectRatio, maxRetries: 2,
        manualGrounding: (subjectDesc.trim() || sceneDesc.trim()) ? {
          subjectDescription: subjectDesc.trim(),
          sceneDescription:   sceneDesc.trim(),
        } : null,
        cinematicParams: {
          shotSize:     endShot,
          shotSizeDesc: endPlano.en,
          shotSizeBody: endPlano.body,
          angleH:       endAngle,
          angleHDesc:   ANGULO_DESCRIPCION_H[endAngle] || endAngle,
          angleV:       endAngleV,
          angleVDesc:   ANGULO_DESCRIPCION_V[endAngleV] || endAngleV,
          lensDesc:     getLensDesc(endLens),
          blurDesc:     getBlurDesc(endBlur),
        },
      });

      if (result.warnings?.length) {
        console.warn('[ShotAgent:END] Warnings:', result.warnings);
      }

      const path = `${userId}/${projectId}/shots/${shot.id}_end_${Date.now()}.jpg`;
      const url  = await uploadBase64ToSupabase(result.imageBase64, 'shot-results', path);

      const newFrame = {
        ...(shot.frame_end || {}),
        image_url: url,
        shot:      endShot,
        camera: {
          ...(shot.frame_end?.camera || {}),
          shotSize: endShot,
          angle:    endAngle,
          angle_v:  endAngleV,
          lens:     endLens,
          blur:     endBlur,
        },
      };
      const patch = { frame_end: newFrame };
      await supabase.from('shots').update(patch).eq('id', shot.id);
      onUpdate(patch);
      setEndUrl(url);
    } catch (e) {
      alert(`Error frame final: ${e.message}`);
    } finally {
      setGenEnd(false);
    }
  }

  async function handleFile(frameType, file) {
    if (!file) return;
    const isStart = frameType === 'start';
    const setGen  = isStart ? setGenStart : setGenEnd;
    setGen(true);
    try {
      const path        = `${userId}/${projectId}/shots/${shot.id}_${frameType}_${Date.now()}.${file.name.split('.').pop()}`;
      const url         = await uploadFileToSupabase(file, 'shot-results', path);
      const frameObj    = isStart ? shot.frame_start : shot.frame_end;
      const newFrameObj = { ...frameObj, image_url: url };
      const patch       = isStart ? { frame_start: newFrameObj } : { frame_end: newFrameObj };
      await supabase.from('shots').update(patch).eq('id', shot.id);
      onUpdate(patch);
      isStart ? setStartUrl(url) : setEndUrl(url);
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setGen(false);
    }
  }

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 9, color: C.dim, fontWeight: 700 }}>
          SHOT {String(shot.shot_number).padStart(3, '0')}
        </span>
        <span style={{ fontSize: 11, color: C.text, flex: 1 }}>
          {shot.name || `Shot ${shot.shot_number}`}
        </span>
        <span style={{ fontSize: 9, color: C.muted }}>{shot.duration_seconds}s</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: startUrl && endUrl ? C.success : startUrl || endUrl ? C.warning : C.dim,
          }} />
          <span style={{ fontSize: 9, color: startUrl && endUrl ? C.success : C.muted, letterSpacing: '0.08em' }}>
            {startUrl && endUrl ? 'FRAMES OK' : startUrl || endUrl ? 'INCOMPLETO' : 'SIN FRAMES'}
          </span>
        </div>
      </div>

      {/* ── Acción ── */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, background: '#1A1A1A' }}>
        <div style={{ fontSize: 9, color: C.warning, letterSpacing: '0.1em', fontWeight: 700, marginBottom: 6 }}>
          ACCIÓN — ¿QUÉ PASA ENTRE LOS DOS FRAMES?
        </div>
        <input
          value={action}
          onChange={e => setAction(e.target.value)}
          onBlur={e => saveAction(e.target.value)}
          placeholder='"empieza a caminar hacia la cámara" · "levanta la botella y sonríe" · "se detiene y mira al horizonte"'
          style={{
            width: '100%', boxSizing: 'border-box',
            background: C.card, border: `1px solid ${action.trim() ? C.warning : C.border}`,
            color: C.text, fontSize: 10, fontFamily: 'monospace',
            borderRadius: 4, padding: '7px 10px', outline: 'none',
          }}
        />
        {!action.trim() && (
          <div style={{ fontSize: 8, color: C.dim, marginTop: 4, letterSpacing: '0.06em' }}>
            ⚠ Sin acción el frame final no sabrá qué está haciendo el sujeto
          </div>
        )}
      </div>

      {/* ── Ficha Técnica Manual (Grounding) ── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, background: '#111' }}>
        <button
          onClick={() => setShowManualGrounding(p => !p)}
          style={{
            width: '100%', padding: '8px 14px',
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9, color: C.purple, letterSpacing: '0.1em', fontWeight: 700 }}>
              📋 FICHA TÉCNICA
            </span>
            <span style={{
              fontSize: 7, color: C.dim, letterSpacing: '0.06em',
              background: C.border, padding: '2px 6px', borderRadius: 8,
            }}>
              {subjectDesc.trim() || sceneDesc.trim() ? '● ACTIVA' : '○ AUTO'}
            </span>
          </div>
          <span style={{ fontSize: 9, color: C.dim }}>
            {showManualGrounding ? '▲' : '▼'}
          </span>
        </button>

        {showManualGrounding && (
          <div style={{ padding: '0 14px 12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>

            <div style={{ fontSize: 8, color: C.dim, letterSpacing: '0.06em', lineHeight: 1.5 }}>
              Pega los datos de tu ficha técnica. El agente los usará directamente
              en lugar de analizar las imágenes — resultado más preciso y sin alucinaciones.
            </div>

            <div>
              <div style={{ fontSize: 7, color: C.purple, letterSpacing: '0.1em', fontWeight: 700, marginBottom: 4 }}>
                SUJETO — vestuario, físico, accesorios
              </div>
              <textarea
                value={subjectDesc}
                onChange={e => setSubjectDesc(e.target.value)}
                placeholder={'Ej: mamá colombiana, camisa azul claro botones, pantalón beige/khaki, bolso crema al hombro, aretes pequeños, collar fino, pelo liso suelto, maquillaje natural'}
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: C.card, border: `1px solid ${subjectDesc.trim() ? C.purple : C.border}`,
                  color: C.text, fontSize: 9, fontFamily: 'monospace',
                  borderRadius: 4, padding: '6px 9px', resize: 'vertical', outline: 'none',
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: 7, color: C.purple, letterSpacing: '0.1em', fontWeight: 700, marginBottom: 4 }}>
                ESCENA — locación, iluminación, set dressing
              </div>
              <textarea
                value={sceneDesc}
                onChange={e => setSceneDesc(e.target.value)}
                placeholder={'Ej: recibidor hogar urbano colombiano, puerta madera/mostaza, perchero con chaqueta mostaza + casco teal + bolso blanco, consola madera, luz cálida entrando por puerta, paredes beige, cuadros arte botánico'}
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: C.card, border: `1px solid ${sceneDesc.trim() ? C.purple : C.border}`,
                  color: C.text, fontSize: 9, fontFamily: 'monospace',
                  borderRadius: 4, padding: '6px 9px', resize: 'vertical', outline: 'none',
                }}
              />
            </div>

            {(subjectDesc.trim() || sceneDesc.trim()) && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: `${C.purple}11`, border: `1px solid ${C.purple}44`,
                borderRadius: 4, padding: '6px 10px',
              }}>
                <span style={{ fontSize: 8, color: C.purple, letterSpacing: '0.06em' }}>
                  ✓ Ficha activa — el agente usará estos datos directamente (sin analizar imágenes)
                </span>
                <button
                  onClick={() => { setSubjectDesc(''); setSceneDesc(''); }}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: C.dim, fontSize: 9 }}
                >
                  limpiar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Frames inicio → final ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr' }}>

        <ShotFrameSlot
          label="FRAME INICIO" sublabel="Sujeto + Escena + Plano inicial"
          shotSize={startShot}     onShotChange={setStartShot}
          angle={startAngle}       onAngleChange={setStartAngle}
          angleV={startAngleV}     onAngleVChange={setStartAngleV}
          lens={startLens}         onLensChange={setStartLens}
          blur={startBlur}         onBlurChange={setStartBlur}
          showPlan={showPlanStart} onTogglePlan={() => setShowPlanStart(p => !p)}
          imageUrl={startUrl} generating={genStart} isVertical={isVertical}
          onGenerate={generateStartFrame}
          onFile={f => handleFile('start', f)}
          onClear={() => {
            setStartUrl(null);
            const patch = { frame_start: { ...shot.frame_start, image_url: null } };
            supabase.from('shots').update(patch).eq('id', shot.id);
            onUpdate(patch);
          }}
          fileRef={startRef}
        />

        {/* Flecha central */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 12px', gap: 6 }}>
          <div style={{ color: C.dim, fontSize: 20 }}>→</div>
          {action.trim() && (
            <div style={{ fontSize: 8, color: C.warning, letterSpacing: '0.04em', maxWidth: 80, textAlign: 'center', lineHeight: 1.4, fontStyle: 'italic' }}>
              {action.length > 50 ? action.slice(0, 50) + '…' : action}
            </div>
          )}
        </div>

        <ShotFrameSlot
          label="FRAME FINAL" sublabel={startUrl ? 'Derivado del inicio + acción' : '⚠ Genera el inicio primero'}
          shotSize={endShot}      onShotChange={setEndShot}
          angle={endAngle}        onAngleChange={setEndAngle}
          angleV={endAngleV}      onAngleVChange={setEndAngleV}
          lens={endLens}          onLensChange={setEndLens}
          blur={endBlur}          onBlurChange={setEndBlur}
          showPlan={showPlanEnd}  onTogglePlan={() => setShowPlanEnd(p => !p)}
          imageUrl={endUrl} generating={genEnd} isVertical={isVertical} warnNoStart={!startUrl}
          onGenerate={generateEndFrame}
          onFile={f => handleFile('end', f)}
          onClear={() => {
            setEndUrl(null);
            const patch = { frame_end: { ...shot.frame_end, image_url: null } };
            supabase.from('shots').update(patch).eq('id', shot.id);
            onUpdate(patch);
          }}
          fileRef={endRef}
        />
      </div>
    </div>
  );
}

// ============================================================
// SHOT FRAME SLOT
// ============================================================
function ShotFrameSlot({ label, sublabel, shotSize, onShotChange, angle, onAngleChange, angleV, onAngleVChange, lens, onLensChange, blur, onBlurChange, showPlan, onTogglePlan, imageUrl, generating, isVertical, warnNoStart, onGenerate, onFile, onClear, fileRef }) {
  const sel = {
    background: '#1A1A1A', border: `1px solid ${C.border}`, color: C.text,
    fontSize: 9, fontFamily: 'monospace', borderRadius: 3,
    padding: '3px 6px', cursor: 'pointer', outline: 'none', width: '100%',
  };
  const aspectRatio = isVertical ? '9 / 16' : '16 / 9';
  const frameLabel  = PLANOS.find(p => p.value === shotSize)?.label || shotSize;

  function handleDownload() {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `frame_${label.replace(/\s/g, '_').toLowerCase()}_${shotSize}.jpg`;
    a.click();
  }

  return (
    <div style={{ padding: 14 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: C.accent, letterSpacing: '0.1em', fontWeight: 700 }}>{label}</div>
        {sublabel && <div style={{ fontSize: 8, color: warnNoStart ? C.warning : C.dim, marginTop: 2 }}>{sublabel}</div>}
      </div>

      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 7, color: C.dim, letterSpacing: '0.08em', marginBottom: 2 }}>PLANO</div>
        <select value={shotSize} onChange={e => onShotChange(e.target.value)} style={sel}>
          {PLANOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 7, color: C.dim, letterSpacing: '0.08em', marginBottom: 2 }}>EJE HORIZONTAL</div>
          <select value={angle} onChange={e => onAngleChange(e.target.value)} style={sel}>
            {ANGULOS_H.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 7, color: C.dim, letterSpacing: '0.08em', marginBottom: 2 }}>EJE VERTICAL</div>
          <select value={angleV} onChange={e => onAngleVChange(e.target.value)} style={sel}>
            {ANGULOS_V.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <select value={lens} onChange={e => onLensChange(e.target.value)} style={{ ...sel, flex: 1 }}>
          {LENTES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <select value={blur} onChange={e => onBlurChange(e.target.value)} style={{ ...sel, flex: 1 }}>
          {DESENFOQUE.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      </div>

      <button onClick={onTogglePlan} style={{
        width: '100%', marginBottom: 8,
        background: showPlan ? `${C.accent}22` : '#1A1A1A',
        border: `1px solid ${showPlan ? C.accent : C.border}`,
        borderRadius: 3, color: showPlan ? C.accent : C.muted,
        fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
        padding: '4px 0', cursor: 'pointer', fontFamily: 'monospace',
      }}>
        📐 {showPlan ? 'OCULTAR' : 'VER'} PLANOGRAMA
      </button>

      {showPlan && (
        <div style={{ marginBottom: 8 }}>
          <Planograma angle={angle} onAngleChange={onAngleChange} angleV={angleV} onAngleVChange={onAngleVChange} lens={lens} />
        </div>
      )}

      <div style={{ width: '100%', aspectRatio, background: C.card, borderRadius: 4, overflow: 'hidden', position: 'relative', border: `1px solid ${warnNoStart ? C.warning + '44' : C.border}` }}>
        {imageUrl ? (
          <>
            <img key={imageUrl} src={imageUrl} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <div
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s', padding: 8 }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0'}
            >
              <button onClick={onGenerate}                       style={btnStyle(C.accent)}>⚡ REGEN</button>
              <button onClick={handleDownload}                   style={btnStyle(C.success)}>⬇ GUARDAR</button>
              <button onClick={() => fileRef.current?.click()}   style={btnStyle('#555')}>📁 SUBIR</button>
              <button onClick={onClear}                          style={btnStyle(C.error)}>✕ QUITAR</button>
            </div>
          </>
        ) : generating ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'linear-gradient(135deg, #0a1628, #0d2040)' }}>
            <div style={{ fontSize: 11, color: C.accent, letterSpacing: '0.12em' }}>GENERANDO...</div>
            <div style={{ fontSize: 9, color: C.dim }}>{frameLabel}</div>
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 9, color: C.dim }}>{isVertical ? '1080 × 1920' : '1920 × 1080'}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={onGenerate} style={{ background: C.accent, border: 'none', borderRadius: 3, color: '#000', fontSize: 9, fontWeight: 700, padding: '5px 12px', cursor: 'pointer', fontFamily: 'monospace' }}>⚡ GENERAR IA</button>
              <button onClick={() => fileRef.current?.click()} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 3, color: C.muted, fontSize: 9, padding: '5px 10px', cursor: 'pointer', fontFamily: 'monospace' }}>📁 SUBIR</button>
            </div>
          </div>
        )}
      </div>

      {imageUrl && (
        <button onClick={handleDownload} style={{ marginTop: 6, width: '100%', background: `${C.success}18`, border: `1px solid ${C.success}44`, borderRadius: 3, color: C.success, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '5px 0', cursor: 'pointer', fontFamily: 'monospace' }}>
          ⬇ GUARDAR IMAGEN
        </button>
      )}

      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.[0]) onFile(e.target.files[0]); }} />
    </div>
  );
}

function btnStyle(color) {
  return {
    background: color, border: 'none', borderRadius: 3,
    color: color === '#555' ? '#ddd' : '#000',
    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
    padding: '5px 10px', cursor: 'pointer', fontFamily: 'monospace', width: '80%',
  };
}

// ============================================================
// PLANOGRAMA TOP — eje horizontal
// ============================================================
function PlanogramaTop({ angle, onAngleChange, lens }) {
  const SIZE = 180, CX = 90, CY = 90, RADIUS = 68;
  const lensData = LENTES.find(l => l.value === lens) || LENTES[2];
  const fovRad   = (lensData.fov * Math.PI) / 180;
  const ANGLE_TO_DEG = {
    frontal: 270, tres_cuartos_der: 315, tres_cuartos_izq: 225,
    lateral_der: 0, lateral_izq: 180,
  };
  const camDeg = ANGLE_TO_DEG[angle] ?? 270;
  const camRad = (camDeg * Math.PI) / 180;
  const camX   = CX + RADIUS * Math.cos(camRad);
  const camY   = CY + RADIUS * Math.sin(camRad);
  const coneLen = RADIUS - 10, halfFov = fovRad / 2, dirRad = camRad + Math.PI;
  const coneL = { x: camX + coneLen * Math.cos(dirRad - halfFov), y: camY + coneLen * Math.sin(dirRad - halfFov) };
  const coneR = { x: camX + coneLen * Math.cos(dirRad + halfFov), y: camY + coneLen * Math.sin(dirRad + halfFov) };
  const subjectRotDeg = { frontal: 0, tres_cuartos_der: 45, tres_cuartos_izq: -45, lateral_der: 90, lateral_izq: -90 };
  const subRotRad = ((subjectRotDeg[angle] ?? 0) * Math.PI) / 180;
  const noseDist = 16;
  const noseX = CX + noseDist * Math.sin(subRotRad);
  const noseY = CY - noseDist * Math.cos(subRotRad);

  function handleClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const deg  = ((Math.atan2(e.clientY - rect.top - CY, e.clientX - rect.left - CX) * 180 / Math.PI) + 360) % 360;
    let a = 'frontal';
    if      (deg >= 337.5 || deg < 22.5)  a = 'lateral_der';
    else if (deg >= 22.5  && deg < 67.5)  a = 'tres_cuartos_der';
    else if (deg >= 67.5  && deg < 112.5) a = 'frontal';
    else if (deg >= 112.5 && deg < 157.5) a = 'tres_cuartos_izq';
    else if (deg >= 157.5 && deg < 202.5) a = 'lateral_izq';
    else if (deg >= 202.5 && deg < 247.5) a = 'tres_cuartos_izq';
    else if (deg >= 247.5 && deg < 337.5) a = 'tres_cuartos_der';
    onAngleChange(a);
  }
  const lbl = { frontal: 'FRONTAL', tres_cuartos_der: '3/4 DER', tres_cuartos_izq: '3/4 IZQ', lateral_der: 'LAT DER', lateral_izq: 'LAT IZQ' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div style={{ fontSize: 7, color: C.muted, letterSpacing: '0.1em' }}>TOP — EJE H</div>
      <svg width={SIZE} height={SIZE} style={{ cursor: 'crosshair', borderRadius: 6, background: '#111' }} onClick={handleClick}>
        {[36, 72, 108, 144].map(v => <g key={v}><line x1={v} y1={0} x2={v} y2={SIZE} stroke="#1A1A1A" strokeWidth={1} /><line x1={0} y1={v} x2={SIZE} y2={v} stroke="#1A1A1A" strokeWidth={1} /></g>)}
        <circle cx={CX} cy={CY} r={RADIUS} fill="none" stroke="#2A2A2A" strokeWidth={1} strokeDasharray="4 3" />
        <text x={CX} y={CY - RADIUS - 5} textAnchor="middle" fill="#444" fontSize={6} fontFamily="monospace">FRENTE</text>
        <text x={CX} y={CY + RADIUS + 12} textAnchor="middle" fill="#444" fontSize={6} fontFamily="monospace">TRASERO</text>
        <text x={CX - RADIUS - 3} y={CY + 3} textAnchor="end" fill="#444" fontSize={6} fontFamily="monospace">IZQ</text>
        <text x={CX + RADIUS + 3} y={CY + 3} textAnchor="start" fill="#444" fontSize={6} fontFamily="monospace">DER</text>
        <polygon points={`${camX},${camY} ${coneL.x},${coneL.y} ${coneR.x},${coneR.y}`} fill={`${C.accent}18`} stroke={`${C.accent}55`} strokeWidth={1} />
        <circle cx={CX} cy={CY} r={9} fill="#2A2A2A" stroke={C.success} strokeWidth={1.5} />
        <text x={CX} y={CY + 3} textAnchor="middle" fill={C.success} fontSize={7} fontFamily="monospace">S</text>
        <line x1={CX} y1={CY} x2={noseX} y2={noseY} stroke={C.success} strokeWidth={2} opacity={0.7} />
        <circle cx={noseX} cy={noseY} r={2} fill={C.success} opacity={0.7} />
        <rect x={camX - 6} y={camY - 4} width={12} height={8} rx={2} fill="#1A1A1A" stroke={C.accent} strokeWidth={1.5} transform={`rotate(${camDeg + 90},${camX},${camY})`} />
        <circle cx={camX} cy={camY} r={2.5} fill={C.accent} />
        <line x1={camX} y1={camY} x2={CX} y2={CY} stroke={C.accent} strokeWidth={0.5} strokeDasharray="3 2" opacity={0.4} />
        <text x={CX} y={SIZE - 5} textAnchor="middle" fill={C.accent} fontSize={7} fontFamily="monospace" fontWeight="bold">{lbl[angle] || angle.toUpperCase()}</text>
        <text x={5} y={SIZE - 5} fill="#444" fontSize={6} fontFamily="monospace">{lensData.value}</text>
      </svg>
    </div>
  );
}

// ============================================================
// PLANOGRAMA LATERAL — eje vertical
// ============================================================
function PlanogramaLateral({ angleV, onAngleVChange }) {
  const SIZE = 180, CX = 90, CY = 90, RADIUS = 68;
  const ANGLEV_TO_DEG = { normal: 0, picado: -45, contrapicado: 135, cenital: -82, nadir: 82, holandes: 0 };
  const vDeg  = ANGLEV_TO_DEG[angleV] ?? 0;
  const vRad  = (vDeg * Math.PI) / 180;
  const camX  = CX + RADIUS * Math.sin(vRad);
  const camY  = CY - RADIUS * Math.cos(vRad);
  const FOV   = (47 * Math.PI) / 180;
  const coneLen = RADIUS - 10;
  const dirA  = Math.atan2(CY - camY, CX - camX);
  const coneL = { x: camX + coneLen * Math.cos(dirA - FOV / 2), y: camY + coneLen * Math.sin(dirA - FOV / 2) };
  const coneR = { x: camX + coneLen * Math.cos(dirA + FOV / 2), y: camY + coneLen * Math.sin(dirA + FOV / 2) };
  const isHolandes = angleV === 'holandes';

  function handleClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const dy = -(e.clientY - rect.top - CY);
    let a = 'normal';
    if      (dy >  55) a = 'cenital';
    else if (dy >  18) a = 'picado';
    else if (dy < -55) a = 'nadir';
    else if (dy < -18) a = 'contrapicado';
    onAngleVChange(a);
  }
  const lbl = { normal: 'NORMAL', picado: 'PICADO', contrapicado: 'CONTRAP', cenital: 'CENITAL', nadir: 'NADIR', holandes: 'HOLANDÉS' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <div style={{ fontSize: 7, color: C.muted, letterSpacing: '0.1em' }}>LATERAL — EJE V</div>
      <svg width={SIZE} height={SIZE} style={{ cursor: 'crosshair', borderRadius: 6, background: '#111' }} onClick={handleClick}>
        {[36, 72, 108, 144].map(v => <g key={v}><line x1={v} y1={0} x2={v} y2={SIZE} stroke="#1A1A1A" strokeWidth={1} /><line x1={0} y1={v} x2={SIZE} y2={v} stroke="#1A1A1A" strokeWidth={1} /></g>)}
        <line x1={0} y1={CY} x2={SIZE} y2={CY} stroke="#2A2A2A" strokeWidth={1} strokeDasharray="6 4" />
        <circle cx={CX} cy={CY} r={RADIUS} fill="none" stroke="#2A2A2A" strokeWidth={1} strokeDasharray="4 3" />
        <text x={CX} y={9} textAnchor="middle" fill="#444" fontSize={6} fontFamily="monospace">CENITAL</text>
        <text x={CX} y={SIZE - 3} textAnchor="middle" fill="#444" fontSize={6} fontFamily="monospace">NADIR</text>
        <text x={4} y={CY + 3} textAnchor="start" fill="#444" fontSize={6} fontFamily="monospace">NORMAL</text>
        <line x1={CX - 18} y1={CY + 15} x2={CX + 18} y2={CY + 15} stroke="#2A2A2A" strokeWidth={2} />
        {!isHolandes && <polygon points={`${camX},${camY} ${coneL.x},${coneL.y} ${coneR.x},${coneR.y}`} fill={`${C.accent}18`} stroke={`${C.accent}55`} strokeWidth={1} />}
        <ellipse cx={CX} cy={CY + 15} rx={6} ry={3} fill="#1A1A1A" stroke={C.success} strokeWidth={1} />
        <rect x={CX - 4} y={CY - 8} width={8} height={23} rx={2} fill="#2A2A2A" stroke={C.success} strokeWidth={1.5} />
        <circle cx={CX} cy={CY - 14} r={5} fill="#2A2A2A" stroke={C.success} strokeWidth={1.5} />
        {!isHolandes ? (
          <>
            <rect x={camX - 5} y={camY - 3} width={10} height={7} rx={2} fill="#1A1A1A" stroke={C.accent} strokeWidth={1.5} transform={`rotate(${vDeg},${camX},${camY})`} />
            <circle cx={camX} cy={camY} r={2.5} fill={C.accent} />
            <line x1={camX} y1={camY} x2={CX} y2={CY} stroke={C.accent} strokeWidth={0.5} strokeDasharray="3 2" opacity={0.4} />
          </>
        ) : (
          <>
            <rect x={CX + RADIUS - 11} y={CY - 3} width={10} height={7} rx={2} fill="#1A1A1A" stroke={C.warning} strokeWidth={1.5} transform={`rotate(18,${CX + RADIUS - 6},${CY})`} />
            <circle cx={CX + RADIUS - 6} cy={CY} r={2.5} fill={C.warning} />
          </>
        )}
        <text x={CX} y={SIZE - 5} textAnchor="middle" fill={C.accent} fontSize={7} fontFamily="monospace" fontWeight="bold">{lbl[angleV] || angleV.toUpperCase()}</text>
      </svg>
    </div>
  );
}

function Planograma({ angle, onAngleChange, angleV, onAngleVChange, lens }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
      <PlanogramaTop     angle={angle}   onAngleChange={onAngleChange}   lens={lens} />
      <PlanogramaLateral angleV={angleV} onAngleVChange={onAngleVChange} />
    </div>
  );
}