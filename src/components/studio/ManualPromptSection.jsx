import React, { useState, useEffect } from 'react';
import {
  VIDEO_PROVIDERS,
  LLM_OPTIONS,
  getCampos,
  CINEMATIC_PRESETS,
  TALKING_HEAD_PRESETS,
  buildDesglosarSystem,
  callLLM,
  extractJSON,
} from './frameUploaderConfig';
import { safeGet, safeSet } from '../../lib/storage/safeStorage';

const CINEMATIC_FIELD_HINTS = {
  encuadre: {
    veo:       '◈ Incluye: plano + ángulo + movimiento + ARRI Alexa 35 Cooke S4/i focal T apertura',
    kling:     '◆ Describe: plano + comportamiento de cámara en lenguaje natural',
    seeddance: '◉ Incluye: plano + ángulo (sin specs técnicas)',
  },
  iluminacion: {
    veo:       '◈ Incluye: fuente motivada + dirección + temperatura K + mood',
    kling:     '◆ Describe: fuente motivada + mood en lenguaje natural',
    seeddance: '◉ Ambiente lumínico general',
  },
};

const C = {
  accent:  '#00A8E8',
  success: '#00D084',
  warning: '#FFB800',
  error:   '#FF4757',
  text:    '#DDDDDD',
  muted:   '#888888',
  dim:     '#555555',
  border:  '#404040',
};

/**
 * Props:
 *   mediaProvider  — 'veo' | 'kling' | 'seeddance'
 *   subjectData    — array de subjects del AssetManager
 *   sceneData      — array de scenes del AssetManager
 *   projectId      — para el link al AssetManager
 *   customPrompt   — prompt actual del shot
 *   onPromptChange — (text: string) => void
 *   onClear        — () => void
 */
export default function ManualPromptSection({
  mediaProvider, subjectData, sceneData, projectId,
  customPrompt, onPromptChange, onClear,
}) {
  const [llmProvider, setLlmProvider] = useState('gemini');
  const [descripcion, setDescripcion] = useState('');
  const [campos,      setCampos]      = useState({});
  const [promptFinal, setPromptFinal] = useState(customPrompt || '');
  const [step,        setStep]        = useState('input'); // 'input' | 'review' | 'done'
  const [loading,     setLoading]     = useState(false);
  const [llmError,    setLlmError]    = useState(null);

  const [shotMode, setShotModeState] = useState(() => {
    const s = safeGet('daru_shot_mode', 'cinematic');
    return (s === 'cinematic' || s === 'talking_head') ? s : 'cinematic';
  });
  const setShotMode = (v) => { safeSet('daru_shot_mode', v); setShotModeState(v); };

  const [cameraAngle, setCameraAngle] = useState('frontal');

  const [intExt,           setIntExt]           = useState('');
  const [tipoPlano,        setTipoPlano]        = useState('');
  const [camara,           setCamara]           = useState('');
  const [lenteSerie,       setLenteSerie]       = useState('');
  const [focal,            setFocal]            = useState('');
  const [movimientoCamara, setMovimientoCamara] = useState('');
  const [esquemaLuz,       setEsquemaLuz]       = useState([]);
  const [temperatura,      setTemperatura]      = useState('');

  // ── Humanidad en cinematic (performance, energía, ritmo) ──
  const [perfCinematic,    setPerfCinematic]    = useState('');
  const [energiaCinematic, setEnergiaCinematic] = useState('');
  const [ritmoCinematic,   setRitmoCinematic]   = useState('');

  const [speechRate, setSpeechRateState] = useState(() => {
    const s = safeGet('daru_speech_rate', 'normal');
    return ['veloz', 'rapido', 'normal', 'lento', 'con_pausas'].includes(s) ? s : 'normal';
  });
  const setSpeechRate = (v) => { safeSet('daru_speech_rate', v); setSpeechRateState(v); };

  const prov = VIDEO_PROVIDERS[mediaProvider] || VIDEO_PROVIDERS.veo;

  useEffect(() => {
    if (step === 'input' && customPrompt !== promptFinal) {
      setPromptFinal(customPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customPrompt]);

  // ── PASO 1: Desglosar con IA ──────────────────────────────────
  const handleDesglosar = async () => {
    if (!descripcion.trim()) { setLlmError('Describe lo que pasa en este plano primero.'); return; }
    setLlmError(null);
    setLoading(true);
    try {
      const system  = buildDesglosarSystem(mediaProvider, subjectData, sceneData, {
        shotMode, cameraAngle, speechRate,
        intExt, tipoPlano, camara, lenteSerie, focal,
        movimientoCamara, esquemaLuz, temperatura,
        perfCinematic, energiaCinematic, ritmoCinematic,
      });
      const rawText = await callLLM(llmProvider, system, descripcion.trim(), 1000);
      const parsed  = extractJSON(rawText);
      if (!parsed || !parsed.prompt_final) {
        console.warn('[ManualPrompt] Raw LLM response:', rawText?.slice(0, 500));
        throw new Error('La IA no devolvió JSON válido. Prueba con otra IA o simplifica la descripción.');
      }
      const { prompt_final, ...camposDesglosados } = parsed;
      setCampos(camposDesglosados);
      setPromptFinal(prompt_final || '');
      setStep('review');
    } catch (err) {
      setLlmError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── PASO 2: Regenerar prompt con campos editados ──────────────
  const handleRegenerarPrompt = async () => {
    setLlmError(null);
    setLoading(true);
    try {
      const activeCampos = getCampos(shotMode);
      const camposTexto = activeCampos
        .map(c => campos[c.key] ? `${c.label}: ${campos[c.key]}` : null)
        .filter(Boolean).join('\n');
      const system  = buildDesglosarSystem(mediaProvider, subjectData, sceneData, {
        shotMode, cameraAngle, speechRate,
        intExt, tipoPlano, camara, lenteSerie, focal,
        movimientoCamara, esquemaLuz, temperatura,
        perfCinematic, energiaCinematic, ritmoCinematic,
      });
      const userMsg = `Genera SOLO el prompt_final en inglés para ${prov.label} con estos campos:\n${camposTexto}\n\nDevuelve SOLO el texto del prompt, sin JSON, sin etiquetas, sin backticks.`;
      let text = await callLLM(llmProvider, system, userMsg, 400);
      text = text
        .replace(/```[a-z]*\s*/gi, '').replace(/```/g, '')
        .replace(/^["']|["']$/g, '').replace(/^prompt_final:\s*/i, '').trim();
      if (!text) throw new Error('La IA no generó un prompt. Intenta de nuevo.');
      setPromptFinal(text);
    } catch (err) {
      setLlmError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAplicar = () => {
    if (!promptFinal.trim()) return;
    onPromptChange(promptFinal.trim());
    setStep('done');
  };

  const handleReset = () => {
    setStep('input'); setCampos({}); setPromptFinal(''); setLlmError(null);
    setIntExt(''); setTipoPlano(''); setCamara(''); setLenteSerie('');
    setFocal(''); setMovimientoCamara(''); setEsquemaLuz([]); setTemperatura('');
    setPerfCinematic(''); setEnergiaCinematic(''); setRitmoCinematic('');
  };

  const insertSubject = (s, i) => {
    const imageLines = [
      s.view_front_url         ? `FRONT_REF: ${s.view_front_url}`                : null,
      s.view_three_quarter_url ? `THREE_QUARTER_REF: ${s.view_three_quarter_url}` : null,
      s.view_side_url          ? `SIDE_REF: ${s.view_side_url}`                   : null,
    ].filter(Boolean);
    const block = [
      `SUBJECT ${i + 1} — ${s.name || 'Personaje'}:`,
      s.description ? `Description: ${s.description}` : null,
      ...imageLines,
      imageLines.length > 0
        ? '[SACRED VISUAL REFERENCES — USE EXACTLY AS SHOWN. DO NOT change clothing, face, hair, or any physical feature.]'
        : '[SACRED IDENTITY — DO NOT invent clothing colors, hair color, eye color, age, or ethnicity.]',
    ].filter(Boolean).join('\n');
    const newPrompt = block + '\n\n' + promptFinal;
    setPromptFinal(newPrompt);
    onPromptChange(newPrompt);
  };

  const insertScene = (s, i) => {
    const imageLines = [
      s.image_url             ? `SCENE_FRONTAL: ${s.image_url}`             : null,
      s.image_url_lateral_der ? `SCENE_RIGHT: ${s.image_url_lateral_der}`   : null,
      s.image_url_lateral_izq ? `SCENE_LEFT: ${s.image_url_lateral_izq}`    : null,
      s.image_url_back        ? `SCENE_BACK: ${s.image_url_back}`           : null,
    ].filter(Boolean);
    const block = [
      `SCENE ${i + 1} — ${s.name || 'Escena'}:`,
      s.description ? `Setting: ${s.description}` : null,
      ...imageLines,
      '[BACKGROUND REFERENCE — reproduce this environment EXACTLY. Do not invent locations or props.]',
    ].filter(Boolean).join('\n');
    const newPrompt = block + '\n\n' + promptFinal;
    setPromptFinal(newPrompt);
    onPromptChange(newPrompt);
  };

  const forbiddenFound = (prov.forbidden || []).filter(w => promptFinal.toLowerCase().includes(w.toLowerCase()));

  return (
    <div style={S.wrapper}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={S.headerRow}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: prov.color, flexShrink: 0 }} />
          <span style={S.headerLabel}>PROMPT MANUAL</span>
          <span style={{ ...S.provBadge, color: prov.color, borderColor: prov.color + '40' }}>
            {prov.icon} {prov.label}
          </span>
        </div>
        {step !== 'input' && (
          <button onClick={handleReset} style={S.resetBtn}>↺ REINICIAR</button>
        )}
      </div>

      {/* ── PASO 1: INPUT / DONE ───────────────────────────────── */}
      {(step === 'input' || step === 'done') && (
        <div style={S.section}>

          {/* Modo del plano */}
          <div style={S.fieldGroup}>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setShotMode('cinematic')}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 4, cursor: 'pointer',
                  fontSize: 9, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.08em',
                  background: shotMode === 'cinematic' ? 'rgba(255,184,0,0.15)' : '#1A1A1A',
                  color:      shotMode === 'cinematic' ? C.warning : C.dim,
                  border:     `1px solid ${shotMode === 'cinematic' ? C.warning : C.border}`,
                  transition: 'all 0.15s',
                }}
              >🎬 PLANO CINEMATOGRÁFICO</button>
              <button
                onClick={() => setShotMode('talking_head')}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 4, cursor: 'pointer',
                  fontSize: 9, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.08em',
                  background: shotMode === 'talking_head' ? 'rgba(0,168,232,0.15)' : '#1A1A1A',
                  color:      shotMode === 'talking_head' ? C.accent : C.dim,
                  border:     `1px solid ${shotMode === 'talking_head' ? C.accent : C.border}`,
                  transition: 'all 0.15s',
                }}
              >📱 CONTENIDO INSTAGRAM / AVATAR</button>
            </div>
          </div>

          {/* Controles talking head */}
          {shotMode === 'talking_head' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'rgba(0,168,232,0.05)', border: `1px solid rgba(0,168,232,0.2)`, borderRadius: 5, padding: '10px 10px' }}>
              <div style={S.fieldGroup}>
                <span style={S.fieldLabel}>ÁNGULO DE CÁMARA</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { key: 'frontal', label: '👁 CÁMARA FRONTAL', color: C.success },
                    { key: 'apoyo',   label: '↗ CÁMARA DE APOYO', color: '#9B6DD6' },
                  ].map(({ key, label, color }) => (
                    <button key={key} onClick={() => setCameraAngle(key)} style={{
                      flex: 1, padding: '6px 0', borderRadius: 4, cursor: 'pointer',
                      fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
                      background: cameraAngle === key ? color + '26' : '#1A1A1A',
                      color:      cameraAngle === key ? color : C.dim,
                      border:     `1px solid ${cameraAngle === key ? color : C.border}`,
                    }}>{label}</button>
                  ))}
                </div>
                <div style={{ fontSize: 8, color: C.dim, fontFamily: 'monospace', lineHeight: 1.4 }}>
                  {cameraAngle === 'frontal' ? 'El personaje mira directo a cámara — lip sync activo' : 'El personaje habla naturalmente sin mirar al lente'}
                </div>
              </div>

              <div style={S.fieldGroup}>
                <span style={S.fieldLabel}>VELOCIDAD DEL HABLA</span>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  {[
                    { key: 'veloz',      label: '⚡ VELOZ',      color: '#FF4757' },
                    { key: 'rapido',     label: '🔴 RÁPIDO',     color: '#FF6B81' },
                    { key: 'normal',     label: '🟡 NORMAL',     color: C.warning },
                    { key: 'lento',      label: '🔵 LENTO',      color: C.accent  },
                    { key: 'con_pausas', label: '⚫ CON PAUSAS', color: '#888888' },
                  ].map(({ key, label, color }) => (
                    <button key={key} onClick={() => setSpeechRate(key)} style={{
                      flex: 1, minWidth: 70, padding: '5px 4px', borderRadius: 4, cursor: 'pointer',
                      fontSize: 8, fontWeight: 700, fontFamily: 'monospace',
                      background: speechRate === key ? color + '20' : '#1A1A1A',
                      color:      speechRate === key ? color : C.dim,
                      border:     `1px solid ${speechRate === key ? color : C.border}`,
                      transition: 'all 0.15s',
                    }}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Selector LLM */}
          <div style={S.fieldGroup}>
            <span style={S.fieldLabel}>IA QUE TRADUCE TU DESCRIPCIÓN</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {Object.entries(LLM_OPTIONS).map(([key, info]) => (
                <button key={key} onClick={() => setLlmProvider(key)} style={{
                  background:    llmProvider === key ? info.color + '15' : 'transparent',
                  border:        `1px solid ${llmProvider === key ? info.color : C.border}`,
                  borderRadius:  3, padding: '4px 10px', fontSize: 9, fontFamily: 'monospace',
                  fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer',
                  color:         llmProvider === key ? info.color : C.muted,
                  transition:    'all 0.15s',
                }}>{info.label}</button>
              ))}
            </div>
          </div>

          {/* Textarea descripción */}
          <div style={S.fieldGroup}>
            <span style={S.fieldLabel}>
              {shotMode === 'talking_head' ? 'QUÉ DICE O HACE EL PERSONAJE' : 'DESCRIBE LO QUE PASA EN ESTE PLANO'}
            </span>
            <div style={{ fontSize: 9, color: C.dim, fontFamily: 'monospace', lineHeight: 1.4 }}>
              {shotMode === 'talking_head'
                ? 'Escribe el texto que va a decir o la acción. La IA lo estructura para ' + prov.label + '.'
                : 'Escribe como hablas. La IA lo traduce a lenguaje cinematográfico.'}
            </div>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleDesglosar(); }}
              placeholder={shotMode === 'talking_head'
                ? (cameraAngle === 'frontal'
                    ? `Ej: "Hola mamá, te quiero mucho. Gracias por todo lo que haces por mí."\n\nO: "Nuestro producto cambia tu vida en 30 días — garantizado."`
                    : `Ej: "Hola mamá..." — el personaje habla sin mirar a cámara, tono natural y relajado.`)
                : `Ej: "La mamá llega a casa cansada, abre la puerta despacio y abraza a su hijo"\n\nO algo más técnico: "El detective entra a la habitación oscura con linterna, dolly in lento"`
              }
              rows={5}
              disabled={loading}
              style={{
                ...S.textarea,
                borderColor: descripcion.trim() ? (shotMode === 'talking_head' ? C.accent + '80' : C.warning + '80') : C.border,
                opacity: loading ? 0.6 : 1,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={S.hintSmall}>Ctrl+Enter para desglosar</span>
              <span style={{ ...S.hintSmall, color: descripcion.length > 400 ? C.warning : C.dim }}>{descripcion.length} chars</span>
            </div>
          </div>

          {/* Personajes disponibles */}
          {subjectData.length > 0 && (
            <div style={S.fieldGroup}>
              <span style={S.fieldLabel}>PERSONAJES DISPONIBLES</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {subjectData.map((s, i) => (
                  <div key={s.id} style={S.subjectChip}>
                    <span style={{ color: '#9B6DD6', fontSize: 8 }}>◉</span>
                    <span>{s.name || `Personaje ${i + 1}`}</span>
                    <span style={{ color: C.dim }}>— incluido</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Escenas disponibles */}
          {sceneData.length > 0 && (
            <div style={S.fieldGroup}>
              <span style={S.fieldLabel}>ESCENAS DISPONIBLES</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {sceneData.map((s, i) => (
                  <div key={s.id} style={S.sceneChip}>
                    <span style={{ color: C.accent, fontSize: 8 }}>◈</span>
                    <span>{s.name || `Escena ${i + 1}`}</span>
                    <span style={{ color: C.dim }}>— incluida</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Link Asset Manager */}
          {(!subjectData.length || !sceneData.length) && projectId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 8, color: C.dim, fontFamily: 'monospace' }}>
                {!subjectData.length && !sceneData.length ? 'Sin personajes ni escenas —' : !subjectData.length ? 'Sin personajes —' : 'Sin escenas —'}
              </span>
              <a href={`/studio/${projectId}/assets`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(0,168,232,0.1)', border: '1px solid rgba(0,168,232,0.3)',
                borderRadius: 4, padding: '4px 10px', fontSize: 8, fontWeight: 700,
                color: C.accent, textDecoration: 'none', fontFamily: 'monospace', letterSpacing: '0.08em',
              }}>📁 ABRIR ASSET MANAGER</a>
              <span style={{ fontSize: 7, color: C.dim, fontFamily: 'monospace' }}>para crear personajes y escenas anti-alucinación</span>
            </div>
          )}

          {/* Botón DESGLOSAR */}
          <button
            onClick={handleDesglosar}
            disabled={loading || !descripcion.trim()}
            style={{
              ...S.btnPrimary,
              background: loading ? C.dim : C.warning,
              color: loading ? C.muted : '#1A1A1A',
              cursor: loading || !descripcion.trim() ? 'not-allowed' : 'pointer',
              opacity: !descripcion.trim() ? 0.4 : 1,
            }}
          >
            {loading
              ? <span style={S.btnInner}><span style={S.spinner}>⟳</span> TRADUCIENDO...</span>
              : <span style={S.btnInner}>▶ DESGLOSAR Y TRADUCIR</span>
            }
          </button>

          {/* Prompt directo */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
            <div style={{ fontSize: 8, color: C.dim, fontFamily: 'monospace', lineHeight: 1.5, marginBottom: 6 }}>
              O escribe directamente tu prompt cinematográfico (sin IA):
            </div>
            <textarea
              value={promptFinal}
              onChange={e => { setPromptFinal(e.target.value); onPromptChange(e.target.value); }}
              placeholder={'Ej: Medium shot, camera inside room facing door, 35mm lens, warm golden hour sidelight...'}
              rows={4}
              style={{ ...S.textarea, borderColor: promptFinal.trim() ? prov.color + '60' : C.border, fontSize: 10 }}
            />

            {/* Insertar sujeto */}
            {subjectData.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {subjectData.map((s, i) => {
                  const inserted = promptFinal.includes(`SUBJECT ${i + 1}`);
                  return (
                    <button key={s.id} onClick={() => !inserted && insertSubject(s, i)} style={{
                      background: inserted ? 'rgba(0,208,132,0.12)' : 'rgba(155,89,182,0.15)',
                      border: `1px solid ${inserted ? C.success : 'rgba(155,89,182,0.5)'}`,
                      borderRadius: 4, color: inserted ? C.success : '#C39BD3',
                      padding: '3px 8px', fontSize: 8, fontWeight: 700,
                      letterSpacing: '0.06em', cursor: inserted ? 'default' : 'pointer', fontFamily: 'monospace',
                    }}>{inserted ? '✓' : '+'} {s.name || `Sujeto ${i + 1}`}</button>
                  );
                })}
              </div>
            )}

            {/* Insertar escena */}
            {sceneData.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {sceneData.map((s, i) => {
                  const inserted = promptFinal.includes(`SCENE ${i + 1}`);
                  return (
                    <button key={s.id} onClick={() => !inserted && insertScene(s, i)} style={{
                      background: inserted ? 'rgba(0,208,132,0.12)' : 'rgba(0,168,232,0.1)',
                      border: `1px solid ${inserted ? C.success : 'rgba(0,168,232,0.4)'}`,
                      borderRadius: 4, color: inserted ? C.success : '#7EC8E3',
                      padding: '3px 8px', fontSize: 8, fontWeight: 700,
                      letterSpacing: '0.06em', cursor: inserted ? 'default' : 'pointer', fontFamily: 'monospace',
                    }}>{inserted ? '✓' : '+'} {s.name || `Escena ${i + 1}`}</button>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              {promptFinal.trim() ? (
                <span style={{ fontSize: 8, color: C.warning, fontFamily: 'monospace' }}>⚠ Este prompt reemplazará BUILD PROMPTS al renderizar</span>
              ) : (
                <span style={{ fontSize: 8, color: C.dim, fontFamily: 'monospace' }}>Sin texto — se usará el prompt de BUILD PROMPTS</span>
              )}
              {promptFinal.trim() && (
                <button onClick={() => { setPromptFinal(''); onClear(); }} style={{ background: 'transparent', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 9, fontFamily: 'monospace' }}>limpiar</button>
              )}
            </div>
          </div>

          {step === 'done' && (
            <div style={S.doneBox}>
              <span style={{ color: C.success }}>✓ Prompt aplicado al shot</span>
              <button onClick={handleReset} style={S.editApplied}>Editar de nuevo</button>
            </div>
          )}
        </div>
      )}

      {/* ── PASO 2: REVIEW ─────────────────────────────────────── */}
      {step === 'review' && (
        <div style={S.section}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 4, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: C.text, letterSpacing: '0.1em', fontFamily: 'monospace' }}>REVISA Y AJUSTA LOS CAMPOS</span>
            <span style={{ fontSize: 9, color: C.muted, fontFamily: 'monospace', lineHeight: 1.4 }}>La IA los interpretó de tu descripción. Edita lo que necesites.</span>
          </div>

          {/* ── DIRECCIÓN DE ACTORES (solo cinematic) ────────────── */}
          {shotMode === 'cinematic' && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              background: 'rgba(155,109,214,0.06)',
              border: '1px solid rgba(155,109,214,0.2)',
              borderRadius: 5, padding: '10px 10px',
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#9B6DD6', fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                🎬 DIRECCIÓN DE ACTORES
              </span>
              <span style={{ fontSize: 8, color: C.muted, fontFamily: 'monospace', lineHeight: 1.4 }}>
                Define la humanidad del personaje. La IA integra esto en el prompt_final.
              </span>

              {/* PERFORMANCE */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: C.muted, fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                  🎭 PERFORMANCE / ACTUACIÓN
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {TALKING_HEAD_PRESETS.performance.map(p => {
                    const isActive = perfCinematic === p.value;
                    return (
                      <button key={p.id} onClick={() => setPerfCinematic(isActive ? '' : p.value)} style={{
                        padding: '4px 9px', borderRadius: 4, cursor: 'pointer',
                        fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                        background: isActive ? 'rgba(155,109,214,0.15)' : '#1A1A1A',
                        color:      isActive ? '#9B6DD6' : C.muted,
                        border:     `1px solid ${isActive ? '#9B6DD6' : C.border}`,
                        transition: 'all 0.15s',
                      }}>{p.label}</button>
                    );
                  })}
                </div>
                <textarea
                  value={perfCinematic}
                  onChange={e => setPerfCinematic(e.target.value)}
                  placeholder="Ej: parpadeo natural, manos quietas, micro-movimientos sutiles del torso"
                  rows={2}
                  style={{ ...S.textarea, fontSize: 10, padding: '6px 8px', borderColor: perfCinematic ? C.border : C.dim + '40' }}
                />
              </div>

              {/* ENERGÍA */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: C.muted, fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                  🔥 ENERGÍA / ACTITUD
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {TALKING_HEAD_PRESETS.energia.map(p => {
                    const isActive = energiaCinematic === p.value;
                    return (
                      <button key={p.id} onClick={() => setEnergiaCinematic(isActive ? '' : p.value)} style={{
                        padding: '4px 9px', borderRadius: 4, cursor: 'pointer',
                        fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                        background: isActive ? 'rgba(255,71,87,0.12)' : '#1A1A1A',
                        color:      isActive ? '#FF4757' : C.muted,
                        border:     `1px solid ${isActive ? '#FF4757' : C.border}`,
                        transition: 'all 0.15s',
                      }}>{p.label}</button>
                    );
                  })}
                </div>
                <textarea
                  value={energiaCinematic}
                  onChange={e => setEnergiaCinematic(e.target.value)}
                  placeholder="Ej: seguro y dominante, con autoridad, sabe exactamente lo que hace"
                  rows={2}
                  style={{ ...S.textarea, fontSize: 10, padding: '6px 8px', borderColor: energiaCinematic ? C.border : C.dim + '40' }}
                />
              </div>

              {/* RITMO */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 8, fontWeight: 700, color: C.muted, fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                  ⚡ RITMO DE ESCENA
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {TALKING_HEAD_PRESETS.ritmo.map(p => {
                    const isActive = ritmoCinematic === p.value;
                    return (
                      <button key={p.id} onClick={() => setRitmoCinematic(isActive ? '' : p.value)} style={{
                        padding: '4px 9px', borderRadius: 4, cursor: 'pointer',
                        fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                        background: isActive ? 'rgba(255,184,0,0.12)' : '#1A1A1A',
                        color:      isActive ? C.warning : C.muted,
                        border:     `1px solid ${isActive ? C.warning : C.border}`,
                        transition: 'all 0.15s',
                      }}>{p.label}</button>
                    );
                  })}
                </div>
                <textarea
                  value={ritmoCinematic}
                  onChange={e => setRitmoCinematic(e.target.value)}
                  placeholder="Ej: pausado y deliberado, cada movimiento con peso, ritmo controlado"
                  rows={2}
                  style={{ ...S.textarea, fontSize: 10, padding: '6px 8px', borderColor: ritmoCinematic ? C.border : C.dim + '40' }}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {getCampos(shotMode).filter(campo => campo.key !== 'audio' || prov.audioSupport).map(campo => {
              const presets = shotMode === 'talking_head' ? TALKING_HEAD_PRESETS[campo.key] : null;
              const currentValue = campos[campo.key] || '';
              const fieldHint = shotMode === 'cinematic' ? CINEMATIC_FIELD_HINTS[campo.key]?.[mediaProvider] : null;
              return (
                <div key={campo.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 9, fontWeight: 700, color: C.muted, fontFamily: 'monospace', letterSpacing: '0.08em' }}>
                    <span style={{ fontSize: 11 }}>{campo.icon}</span>
                    {campo.label}
                    {!currentValue && <span style={{ fontSize: 8, color: C.dim, fontStyle: 'italic', fontWeight: 400, marginLeft: 4 }}>no detectado</span>}
                  </label>
                  {fieldHint && (
                    <span style={{ ...S.hintSmall, color: C.dim }}>{fieldHint}</span>
                  )}

                  {/* INT./EXT. sobre el campo ambiente (solo cinematic) */}
                  {shotMode === 'cinematic' && campo.key === 'ambiente' && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                      {CINEMATIC_PRESETS.intExt.map(p => {
                        const isActive = intExt === p.value;
                        return (
                          <button
                            key={p.id}
                            onClick={() => setIntExt(isActive ? '' : p.value)}
                            style={{
                              padding: '5px 18px', borderRadius: 4, cursor: 'pointer',
                              fontSize: 10, fontFamily: 'monospace', fontWeight: 800,
                              letterSpacing: '0.12em',
                              background: isActive ? 'rgba(255,184,0,0.18)' : '#1A1A1A',
                              color:      isActive ? '#FFB800' : '#666',
                              border:     `1px solid ${isActive ? '#FFB800' : '#404040'}`,
                              transition: 'all 0.15s',
                            }}
                          >{p.label}</button>
                        );
                      })}
                    </div>
                  )}

                  {/* Presets de esquema de iluminación y temperatura (solo cinematic, campo iluminacion) */}
                  {shotMode === 'cinematic' && campo.key === 'iluminacion' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
                      <div>
                        <div style={{ fontSize: 8, color: '#888', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 4 }}>ESQUEMA DE ILUMINACIÓN</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {CINEMATIC_PRESETS.esquemaLuz.map(p => {
                            const isActive = esquemaLuz.includes(p.value);
                            return (
                              <button key={p.id} onClick={() => setEsquemaLuz(prev =>
                                isActive ? prev.filter(v => v !== p.value) : [...prev, p.value]
                              )} style={{
                                padding: '4px 9px', borderRadius: 4, cursor: 'pointer',
                                fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                                background: isActive ? 'rgba(255,184,0,0.15)' : '#1A1A1A',
                                color:      isActive ? '#FFB800' : '#666',
                                border:     `1px solid ${isActive ? '#FFB800' : '#404040'}`,
                                transition: 'all 0.15s',
                              }}>{p.label}</button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 8, color: '#888', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 4 }}>TEMPERATURA DE COLOR</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {CINEMATIC_PRESETS.temperatura.map(p => {
                            const isActive = temperatura === p.value;
                            return (
                              <button key={p.id} onClick={() => setTemperatura(isActive ? '' : p.value)} style={{
                                padding: '4px 9px', borderRadius: 4, cursor: 'pointer',
                                fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                                background: isActive ? 'rgba(255,184,0,0.12)' : '#1A1A1A',
                                color:      isActive ? '#FFB800' : '#666',
                                border:     `1px solid ${isActive ? '#FFB800CC' : '#404040'}`,
                                transition: 'all 0.15s',
                              }}>{p.label}</button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-paneles cinematic para encuadre (reemplaza textarea normal) */}
                  {shotMode === 'cinematic' && campo.key === 'encuadre' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                      {/* TIPO DE PLANO */}
                      <div>
                        <div style={{ fontSize: 8, color: '#888', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 4 }}>TIPO DE PLANO</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {CINEMATIC_PRESETS.plano.map(p => {
                            const isActive = tipoPlano === p.value;
                            return (
                              <button key={p.id} onClick={() => setTipoPlano(isActive ? '' : p.value)} style={{
                                padding: '4px 9px', borderRadius: 4, cursor: 'pointer',
                                fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                                background: isActive ? 'rgba(255,184,0,0.15)' : '#1A1A1A',
                                color:      isActive ? '#FFB800' : '#666',
                                border:     `1px solid ${isActive ? '#FFB800' : '#404040'}`,
                                transition: 'all 0.15s',
                              }}>{p.label}</button>
                            );
                          })}
                        </div>
                      </div>

                      {/* CÁMARA */}
                      <div>
                        <div style={{ fontSize: 8, color: '#888', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 4 }}>CÁMARA</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {CINEMATIC_PRESETS.camara.map(p => {
                            const isActive = camara === p.value;
                            return (
                              <button key={p.id} onClick={() => setCamara(isActive ? '' : p.value)} style={{
                                padding: '4px 9px', borderRadius: 4, cursor: 'pointer',
                                fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                                background: isActive ? 'rgba(0,208,132,0.15)' : '#1A1A1A',
                                color:      isActive ? '#00D084' : '#666',
                                border:     `1px solid ${isActive ? '#00D084' : '#404040'}`,
                                transition: 'all 0.15s',
                              }}>{p.label}</button>
                            );
                          })}
                        </div>
                      </div>

                      {/* SERIE DE LENTES + FOCAL */}
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <div style={{ fontSize: 8, color: '#888', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 4 }}>SERIE DE LENTES</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {CINEMATIC_PRESETS.lenteSerie.map(p => {
                              const isActive = lenteSerie === p.value;
                              return (
                                <button key={p.id} onClick={() => setLenteSerie(isActive ? '' : p.value)} style={{
                                  padding: '4px 9px', borderRadius: 4, cursor: 'pointer',
                                  fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                                  background: isActive ? 'rgba(155,109,214,0.15)' : '#1A1A1A',
                                  color:      isActive ? '#9B6DD6' : '#666',
                                  border:     `1px solid ${isActive ? '#9B6DD6' : '#404040'}`,
                                  transition: 'all 0.15s',
                                }}>{p.label}</button>
                              );
                            })}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 8, color: '#888', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 4 }}>FOCAL</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                            {CINEMATIC_PRESETS.focal.map(p => {
                              const isActive = focal === p.value;
                              return (
                                <button key={p.id} onClick={() => setFocal(isActive ? '' : p.value)} style={{
                                  padding: '4px 7px', borderRadius: 4, cursor: 'pointer',
                                  fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                                  background: isActive ? 'rgba(0,168,232,0.15)' : '#1A1A1A',
                                  color:      isActive ? '#00A8E8' : '#666',
                                  border:     `1px solid ${isActive ? '#00A8E8' : '#404040'}`,
                                  transition: 'all 0.15s',
                                }}>{p.label}</button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* MOVIMIENTO DE CÁMARA */}
                      <div>
                        <div style={{ fontSize: 8, color: '#888', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 4 }}>MOVIMIENTO DE CÁMARA</div>
                        <textarea
                          value={movimientoCamara}
                          onChange={e => setMovimientoCamara(e.target.value)}
                          placeholder="Ej: dolly in lento, handheld shake sutil, crane up desde suelo, static tripod, tracking lateral"
                          rows={2}
                          style={{
                            width: '100%', boxSizing: 'border-box', resize: 'vertical',
                            background: '#1A1A1A', color: '#DDD',
                            border: `1px solid ${movimientoCamara ? '#404040' : '#33333360'}`,
                            borderRadius: 4, padding: '6px 8px',
                            fontSize: 10, fontFamily: 'monospace', lineHeight: 1.6, outline: 'none',
                          }}
                        />
                      </div>

                    </div>
                  ) : null}

                  {/* Botones de presets — solo en talking head y si hay presets para este campo */}
                  {!(shotMode === 'cinematic' && campo.key === 'encuadre') && presets && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {presets.map(p => {
                        const isActive = currentValue === p.value;
                        return (
                          <button
                            key={p.id}
                            onClick={() => setCampos(prev => ({ ...prev, [campo.key]: isActive ? '' : p.value }))}
                            style={{
                              padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
                              fontSize: 9, fontFamily: 'monospace', fontWeight: 600,
                              background: isActive ? C.accent + '20' : '#1A1A1A',
                              color:      isActive ? C.accent : C.muted,
                              border:     `1px solid ${isActive ? C.accent : C.border}`,
                              transition: 'all 0.15s',
                            }}
                          >{p.label}</button>
                        );
                      })}
                    </div>
                  )}

                  {/* Textarea — oculto en cinematic+encuadre, visible en el resto */}
                  {!(shotMode === 'cinematic' && campo.key === 'encuadre') && (
                    <textarea
                      value={currentValue}
                      onChange={e => setCampos(prev => ({ ...prev, [campo.key]: e.target.value }))}
                      placeholder={campo.placeholder}
                      rows={2}
                      style={{ ...S.textarea, borderColor: currentValue ? C.border : C.dim + '60', color: currentValue ? C.text : C.muted, fontSize: 10, padding: '6px 8px' }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <button onClick={handleRegenerarPrompt} disabled={loading} style={{ ...S.btnSecondary, opacity: loading ? 0.5 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? '⟳ Regenerando...' : '↺ REGENERAR PROMPT CON ESTOS CAMPOS'}
          </button>

          <div style={S.promptFinalBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: C.text, letterSpacing: '0.1em', fontFamily: 'monospace' }}>PROMPT FINAL · {prov.icon} {prov.label}</span>
              <span style={{ fontSize: 8, color: C.dim, fontFamily: 'monospace' }}>{promptFinal.split(' ').filter(Boolean).length} palabras</span>
            </div>
            <div style={{ fontSize: 8, color: C.dim, fontFamily: 'monospace', lineHeight: 1.4, fontStyle: 'italic' }}>{prov.hint}</div>
            <textarea
              value={promptFinal}
              onChange={e => setPromptFinal(e.target.value)}
              rows={6}
              style={{ ...S.textarea, borderColor: promptFinal.trim() ? prov.color + '60' : C.border, fontSize: 10, lineHeight: 1.7 }}
            />
            {forbiddenFound.length > 0 && (
              <div style={{ fontSize: 8, color: C.error, fontFamily: 'monospace', lineHeight: 1.5 }}>
                ⚠ Palabras que {prov.label} puede bloquear: {forbiddenFound.join(', ')}
              </div>
            )}
          </div>

          <button
            onClick={handleAplicar}
            disabled={!promptFinal.trim() || loading}
            style={{ ...S.btnPrimary, background: promptFinal.trim() ? C.success : C.dim, color: '#1A1A1A', cursor: promptFinal.trim() ? 'pointer' : 'not-allowed', opacity: !promptFinal.trim() ? 0.4 : 1 }}
          >✓ APLICAR AL SHOT</button>

          <button onClick={handleReset} style={S.ghostBtn}>← volver a la descripción</button>
        </div>
      )}

      {/* ── ERROR ──────────────────────────────────────────────── */}
      {llmError && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,71,87,0.1)', border: `1px solid ${C.error}`, borderRadius: 4, padding: '6px 10px', fontSize: 10, color: C.error, fontFamily: 'monospace' }}>
          <span>⚠ {llmError}</span>
          <button onClick={() => setLlmError(null)} style={{ background: 'transparent', border: 'none', color: C.error, cursor: 'pointer', fontSize: 12 }}>✕</button>
        </div>
      )}
    </div>
  );
}

const S = {
  wrapper:      { display: 'flex', flexDirection: 'column', gap: 10, background: '#2A2A2A', border: `1px solid ${C.border}`, borderRadius: 6, padding: 12 },
  headerRow:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  headerLabel:  { fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: '0.12em', fontFamily: 'monospace' },
  provBadge:    { fontSize: 8, fontFamily: 'monospace', letterSpacing: '0.08em', fontWeight: 700, border: '1px solid', borderRadius: 3, padding: '2px 6px' },
  resetBtn:     { background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 3, color: C.dim, fontSize: 8, cursor: 'pointer', fontFamily: 'monospace', letterSpacing: '0.08em', padding: '2px 8px' },
  section:      { display: 'flex', flexDirection: 'column', gap: 10 },
  fieldGroup:   { display: 'flex', flexDirection: 'column', gap: 5 },
  fieldLabel:   { fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: '0.1em', fontFamily: 'monospace' },
  textarea:     { width: '100%', boxSizing: 'border-box', resize: 'vertical', background: '#1A1A1A', color: C.text, border: '1px solid', borderRadius: 4, padding: '8px 10px', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.6, outline: 'none', transition: 'border-color 0.15s' },
  hintSmall:    { fontSize: 8, color: C.dim, fontFamily: 'monospace' },
  subjectChip:  { display: 'flex', gap: 4, alignItems: 'center', background: 'rgba(155,109,214,0.1)', border: '1px solid rgba(155,109,214,0.25)', borderRadius: 3, padding: '3px 8px', fontSize: 9, color: '#C39BD3', fontFamily: 'monospace', letterSpacing: '0.04em' },
  sceneChip:    { display: 'flex', gap: 4, alignItems: 'center', background: 'rgba(0,168,232,0.1)', border: '1px solid rgba(0,168,232,0.25)', borderRadius: 3, padding: '3px 8px', fontSize: 9, color: '#7EC8E3', fontFamily: 'monospace', letterSpacing: '0.04em' },
  btnPrimary:   { width: '100%', padding: '11px', border: 'none', borderRadius: 4, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', fontFamily: 'monospace', transition: 'opacity 0.15s, background 0.15s' },
  btnInner:     { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  spinner:      { display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 14 },
  btnSecondary: { width: '100%', padding: '7px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', fontFamily: 'monospace', transition: 'opacity 0.15s', cursor: 'pointer' },
  ghostBtn:     { background: 'transparent', border: 'none', color: C.dim, fontSize: 9, cursor: 'pointer', fontFamily: 'monospace', letterSpacing: '0.06em', padding: '4px 0', alignSelf: 'flex-start' },
  promptFinalBox: { display: 'flex', flexDirection: 'column', gap: 6, background: '#1E1E1E', border: `1px solid ${C.border}`, borderRadius: 5, padding: 10 },
  doneBox:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,208,132,0.08)', border: '1px solid rgba(0,208,132,0.25)', borderRadius: 4, padding: '8px 12px', fontSize: 10, fontFamily: 'monospace' },
  editApplied:  { background: 'transparent', border: 'none', color: C.muted, fontSize: 9, cursor: 'pointer', fontFamily: 'monospace', textDecoration: 'underline' },
};