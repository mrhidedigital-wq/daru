import React, { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  C, PLANO_DESCRIPCION, ANGULO_DESCRIPCION_H, ANGULO_DESCRIPCION_V, LENTES,
  generateImageWithGemini, generateImageWithConversation,
} from '../services/assetUtils';

import SBTopBar       from '../components/storyboard/SBTopBar';
import SBFrame        from '../components/storyboard/SBFrame';
import SBAnalysisPanel from '../components/storyboard/SBAnalysisPanel';
import SBSubjectEditor from '../components/storyboard/SBSubjectEditor';
import SBReframePanel  from '../components/storyboard/SBReframePanel';
import SBPropsPanel    from '../components/storyboard/SBPropsPanel';

// ── helpers ────────────────────────────────────────────────────

const fileToBase64 = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

const parseJSON = (text) => {
  const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  return JSON.parse(cleaned);
};

const detectStyleMode = (estilo) => {
  if (!estilo) return 'illustration';
  const e = estilo.toLowerCase();
  if (e.includes('fotograf') || e === 'foto') return 'photo';
  if (e.includes('animaci') || e === 'anime' || e === '3d_render') return 'animation';
  return 'illustration';
};

const emptyFrame = (resolution = '16:9') => ({
  id: crypto.randomUUID(),
  referenceImage: null,
  generatedImage: null,
  analysis: null,
  status: 'empty',
  errorMsg: null,
  styleMode: null,
  subjects: [],
  shotType: 'plano_medio',
  angleH: 'frontal',
  angleV: 'normal',
  lens: '50mm',
  props: [],
  reframeTarget: null,
  conversationHistory: [],
  resolution,
});

// ── analysis prompt ────────────────────────────────────────────

const ANALYSIS_PROMPT = `Eres un asistente de dirección de fotografía y arte. Analiza esta imagen de referencia con precisión y honestidad.

Responde ÚNICAMENTE en formato JSON con esta estructura exacta:

{
  "estilo": "fotografía" | "animación" | "ilustración" | "pintura" | "3d_render",
  "estilo_descripcion": "descripción breve del estilo visual",
  "puede_replicar": true | false,
  "limitaciones": ["lista de cosas que NO puede replicar exactamente, si las hay"],
  "tipo_plano": "gran_plano_general" | "plano_general" | "plano_entero" | "plano_americano" | "plano_medio" | "primer_plano" | "primerisimo_primer_plano",
  "angulo_h": "frontal" | "tres_cuartos_der" | "tres_cuartos_izq" | "lateral_der" | "lateral_izq",
  "angulo_v": "normal" | "picado" | "contrapicado" | "cenital" | "nadir" | "holandes",
  "iluminacion": "descripción de la iluminación detectada",
  "paleta": "descripción de la paleta de colores dominante",
  "composicion": "descripción de la composición y layout",
  "fondo": "descripción del fondo/escenario",
  "personajes": [
    {
      "id": "p1",
      "label": "nombre descriptivo y posición, ej: mujer de la izquierda",
      "posicion": "left" | "center" | "right" | "background",
      "descripcion": "descripción detallada: género, edad aproximada, vestuario, rasgos visibles, postura",
      "cara_visible": true | false
    }
  ],
  "notas_adicionales": "cualquier observación importante sobre la imagen"
}

Si la imagen NO es suficientemente clara para analizar, devuelve:
{
  "error": true,
  "mensaje": "Explicación en español de por qué no puedes analizar la imagen"
}

Sé honesto. Si hay algo que no puedes replicar con precisión, dilo en "limitaciones".`;

// ── prompt builders ────────────────────────────────────────────

const buildFramePrompt = (frame) => {
  const { analysis, subjects, shotType, angleH, angleV, lens, props, styleMode } = frame;
  const planoDesc = PLANO_DESCRIPCION[shotType];
  const lensInfo = LENTES.find(l => l.value === lens);

  const styleInstruction = styleMode === 'animation'
    ? 'Maintain the exact animation/illustration style of the reference image. Do not make it photorealistic.'
    : styleMode === 'photo'
    ? 'Maintain photorealistic photography style matching the reference.'
    : `Maintain the exact visual style: ${analysis?.estilo_descripcion || 'as shown in reference'}`;

  const subjectInstructions = (subjects || []).map(sub => {
    if (sub.customDescription) return `Character (${sub.label}): Replace with — ${sub.customDescription}`;
    let inst = `Character (${sub.label}): `;
    if (sub.faceImage) inst += 'Replace only the face with the provided reference face image. ';
    if (!sub.keepCostume && sub.costumeImage) {
      inst += 'Replace the costume with the provided costume reference. ';
    } else {
      inst += `Keep the original costume exactly as in reference: ${sub.description || ''}. `;
    }
    return inst;
  }).join('\n');

  const propsInstruction = (props || []).length > 0
    ? `Add the following props naturally to the scene: ${props.join(', ')}.`
    : '';

  return `
${styleInstruction}

SHOT TYPE: ${planoDesc?.en || shotType} — ${planoDesc?.body || ''}
HORIZONTAL ANGLE: ${ANGULO_DESCRIPCION_H[angleH] || angleH}
VERTICAL ANGLE: ${ANGULO_DESCRIPCION_V[angleV] || angleV}
LENS: ${lensInfo?.desc || lens}

SCENE BACKGROUND: ${analysis?.fondo || 'maintain background from reference'}
LIGHTING: ${analysis?.iluminacion || 'maintain original lighting'}

CHARACTER INSTRUCTIONS:
${subjectInstructions || 'Maintain all characters exactly as in reference.'}

${propsInstruction}

IMPORTANT:
- Do NOT change anything not mentioned above
- Maintain exact composition and scene layout from reference
- ${styleInstruction}
  `.trim();
};

const buildTurnaroundPrompt = (subject, viewKey) => {
  const viewDescriptions = {
    frontal:     "front view, facing camera directly, full frontal",
    lateral_izq: "left side profile, camera at 90° to subject's left, subject facing right",
    lateral_der: "right side profile, camera at 90° to subject's right, subject facing left",
    perfil:      "pure side profile view",
    espalda:     "back view, subject facing away from camera",
  };
  return `
Generate a character turnaround view.
Character description: ${subject.description || ''}
${subject.customDescription ? `Custom description: ${subject.customDescription}` : ''}

View to generate: ${viewDescriptions[viewKey] || viewKey}

IMPORTANT:
- Keep EXACT same character design, clothing, colors, and style
- Plain/neutral background
- Full body visible
- Maintain the exact same visual style (animation/photo/illustration)
- This is a character sheet view, not a scene
  `.trim();
};

// ── error messages ─────────────────────────────────────────────

const friendlyError = (err) => {
  const msg = err?.message || '';
  if (msg.includes('Gemini no devolvió imagen')) return 'Gemini no pudo generar la imagen. Intenta con una referencia diferente.';
  if (msg.includes('No se pudo leer la imagen')) return 'No se pudo leer la imagen. Verifica el formato.';
  return 'Ocurrió un error al procesar. Por favor intenta de nuevo.';
};

// ── component ──────────────────────────────────────────────────

export default function StoryboardStudio() {
  const navigate = useNavigate();
  const { projectId } = useParams();

  const [frames, setFrames] = useState([]);
  const [activeFrameId, setActiveFrameId] = useState(null);
  const [resolution, setResolution] = useState('16:9');
  const [leftTab, setLeftTab] = useState('personajes');
  const [activeSubjectId, setActiveSubjectId] = useState(null);
  const [lastApplied, setLastApplied] = useState(null);

  const activeFrame = frames.find(f => f.id === activeFrameId) || null;

  // ── state helpers ──────────────────────────────────────────

  const updateFrame = useCallback((id, updates) => {
    setFrames(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const updateSubject = useCallback((frameId, subjectId, updates) => {
    setFrames(prev => prev.map(f => {
      if (f.id !== frameId) return f;
      return {
        ...f,
        subjects: f.subjects.map(s => s.id === subjectId ? { ...s, ...updates } : s),
      };
    }));
  }, []);

  // ── frame actions ──────────────────────────────────────────

  const addFrame = () => {
    const frame = emptyFrame(resolution);
    setFrames(prev => [...prev, frame]);
    setActiveFrameId(frame.id);
    setLeftTab('personajes');
    setActiveSubjectId(null);
  };

  const deleteFrame = (id) => {
    setFrames(prev => prev.filter(f => f.id !== id));
    if (activeFrameId === id) {
      setActiveFrameId(null);
    }
  };

  const handleFileUpload = async (frameId, file) => {
    try {
      const b64 = await fileToBase64(file);
      updateFrame(frameId, { referenceImage: b64, status: 'analyzing', analysis: null, subjects: [] });
      setActiveFrameId(frameId);
      await analyzeFrame(frameId, b64);
    } catch (err) {
      updateFrame(frameId, { status: 'error', errorMsg: friendlyError(err) });
    }
  };

  // ── analysis ───────────────────────────────────────────────

  const analyzeFrame = async (frameId, imageBase64) => {
    try {
      const res = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'gemini-proxy',
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: imageBase64.split(',')[1] } },
              { text: ANALYSIS_PROMPT },
            ],
          }],
          generationConfig: { responseModalities: ['TEXT'] },
        }),
      });

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const analysis = parseJSON(rawText);

      if (analysis.error) {
        updateFrame(frameId, { status: 'analyzed', analysis });
        return;
      }

      const subjects = (analysis.personajes || []).map(p => ({
        id: crypto.randomUUID(),
        label: p.label,
        position: p.posicion,
        description: p.descripcion,
        faceImage: null,
        costumeImage: null,
        keepCostume: true,
        customDescription: '',
        turnaround: { frontal: null, lateral_izq: null, lateral_der: null, perfil: null, espalda: null },
        selectedViews: ['frontal'],
      }));

      updateFrame(frameId, {
        analysis,
        subjects,
        styleMode: detectStyleMode(analysis.estilo),
        shotType: analysis.tipo_plano || 'plano_medio',
        angleH: analysis.angulo_h || 'frontal',
        angleV: analysis.angulo_v || 'normal',
        status: 'analyzed',
      });

    } catch (err) {
      updateFrame(frameId, { status: 'error', errorMsg: 'No se pudo analizar la imagen. Intenta de nuevo.' });
    }
  };

  const retryAnalysis = async (frameId) => {
    const frame = frames.find(f => f.id === frameId);
    if (!frame?.referenceImage) return;
    updateFrame(frameId, { status: 'analyzing' });
    await analyzeFrame(frameId, frame.referenceImage);
  };

  // ── generation ─────────────────────────────────────────────

  const generateFrame = async (frameId) => {
    const frame = frames.find(f => f.id === frameId);
    if (!frame) return;

    updateFrame(frameId, { status: 'generating' });
    try {
      const prompt = buildFramePrompt(frame);
      // Incluir imágenes de cara y vestuario de todos los subjects configurados
      const subjectRefImages = (frame.subjects || []).flatMap(sub => [
        sub.faceImage || null,
        (!sub.keepCostume && sub.costumeImage) ? sub.costumeImage : null,
      ]).filter(Boolean);
      const refImages = [frame.referenceImage, ...subjectRefImages].filter(Boolean);
      const result = await generateImageWithGemini(prompt, refImages, frame.resolution || '16:9');

      updateFrame(frameId, {
        generatedImage: result,
        status: 'done',
        conversationHistory: [
          { role: 'user', parts: [{ text: prompt }] },
          { role: 'model', parts: [{ inlineData: { mimeType: 'image/jpeg', data: result.split(',')[1] } }] },
        ],
      });

      setLeftTab('personajes');
    } catch (err) {
      updateFrame(frameId, { status: 'error', errorMsg: friendlyError(err) });
    }
  };

  // ── reframe ────────────────────────────────────────────────

  const [applyingReframe, setApplyingReframe] = useState(false);

  const applyReframe = async (shotType, angleH, angleV, targetSubject) => {
    if (!activeFrame?.generatedImage) return;
    setApplyingReframe(true);
    try {
      const planoDesc = PLANO_DESCRIPCION[shotType];
      const reframePrompt = `
Reframe this image:
- New shot type: ${planoDesc?.en || shotType} — ${planoDesc?.body || ''}
- Camera angle: ${ANGULO_DESCRIPCION_H[angleH] || angleH}
- Vertical angle: ${ANGULO_DESCRIPCION_V[angleV] || angleV}
${targetSubject ? `- Focus on: ${targetSubject}` : ''}
Keep all characters, style, lighting, and scene content identical.
Only change the framing and camera position.
      `.trim();

      const result = await generateImageWithConversation(
        'Genera esta imagen',
        activeFrame.generatedImage,
        reframePrompt,
        activeFrame.resolution || '16:9'
      );

      updateFrame(activeFrameId, {
        generatedImage: result,
        shotType, angleH, angleV, reframeTarget: targetSubject,
        conversationHistory: [
          ...activeFrame.conversationHistory,
          { role: 'user', parts: [{ text: reframePrompt }] },
          { role: 'model', parts: [{ inlineData: { mimeType: 'image/jpeg', data: result.split(',')[1] } }] },
        ],
      });
    } catch (err) {
      updateFrame(activeFrameId, { status: 'error', errorMsg: friendlyError(err) });
    } finally {
      setApplyingReframe(false);
    }
  };

  // ── props ──────────────────────────────────────────────────

  const [applyingProps, setApplyingProps] = useState(false);

  const applyProps = async (newProp, targetSubject) => {
    if (!activeFrame?.generatedImage) return;
    setApplyingProps(true);
    try {
      const propsPrompt = `
Add the following prop to the image: ${newProp}
${targetSubject ? `Add it to/near: ${targetSubject}` : 'Add it naturally to the scene'}
Keep all existing characters, style, lighting, background, and composition identical.
Only add the new prop in a natural and contextually appropriate way.
      `.trim();

      const result = await generateImageWithConversation(
        'Genera esta imagen',
        activeFrame.generatedImage,
        propsPrompt,
        activeFrame.resolution || '16:9'
      );

      updateFrame(activeFrameId, {
        generatedImage: result,
        props: [...(activeFrame.props || []), newProp],
        conversationHistory: [
          ...activeFrame.conversationHistory,
          { role: 'user', parts: [{ text: propsPrompt }] },
          { role: 'model', parts: [{ inlineData: { mimeType: 'image/jpeg', data: result.split(',')[1] } }] },
        ],
      });
    } catch (err) {
      updateFrame(activeFrameId, { status: 'error', errorMsg: friendlyError(err) });
    } finally {
      setApplyingProps(false);
    }
  };

  // ── turnaround ─────────────────────────────────────────────

  const [generatingViews, setGeneratingViews] = useState({});

  const generateTurnaround = async (subjectId, viewKeys) => {
    if (!activeFrameId) return;
    const frame = frames.find(f => f.id === activeFrameId);
    const subject = frame?.subjects?.find(s => s.id === subjectId);
    if (!subject) return;

    setGeneratingViews(prev => ({ ...prev, [subjectId]: true }));
    try {
      const refImages = [
        frame.referenceImage,
        subject.faceImage,
        ...Object.values(subject.turnaround).filter(Boolean),
      ].filter(Boolean);

      for (const viewKey of viewKeys) {
        try {
          const prompt = buildTurnaroundPrompt(subject, viewKey);
          const result = await generateImageWithGemini(prompt, refImages, '1:1');
          updateSubject(activeFrameId, subjectId, {
            turnaround: { ...subject.turnaround, [viewKey]: result },
          });
          // refresh subject reference for next iteration
          const updated = frames.find(f => f.id === activeFrameId)?.subjects?.find(s => s.id === subjectId);
          if (updated) refImages.push(result);
        } catch (_) {
          // continue with other views on error
        }
      }
    } finally {
      setGeneratingViews(prev => ({ ...prev, [subjectId]: false }));
    }
  };

  // ── subject changes ────────────────────────────────────────

  const applySubjectChanges = async () => {
    if (!activeFrameId || !activeSubjectId) return;
    const frame = frames.find(f => f.id === activeFrameId);
    const subject = frame?.subjects?.find(s => s.id === activeSubjectId);
    if (!frame || !subject) return;

    updateFrame(activeFrameId, { status: 'generating' });

    try {
      const refImages = [
        frame.referenceImage,
        subject.faceImage || null,
        (!subject.keepCostume && subject.costumeImage) ? subject.costumeImage : null,
      ].filter(Boolean);

      const styleInstruction = frame.styleMode === 'animation'
        ? 'Maintain the exact animation/illustration style. Do NOT make it photorealistic.'
        : 'Maintain the exact visual style of the reference image.';

      let characterInstruction = '';
      if (subject.customDescription?.trim()) {
        characterInstruction = `REPLACE the character "${subject.label}" completely with: ${subject.customDescription}. Keep their position in the scene (${subject.position}).`;
      } else {
        const faceInstr = subject.faceImage
          ? `REPLACE only the FACE of "${subject.label}" with the face shown in the SECOND reference image. Keep body, pose, position identical.`
          : `Keep the face of "${subject.label}" exactly as in the original.`;
        const costumeInstr = (!subject.keepCostume && subject.costumeImage)
          ? `REPLACE the costume of "${subject.label}" with the clothing in the THIRD reference image. Keep body shape and pose identical.`
          : `Keep the original costume of "${subject.label}" EXACTLY: ${subject.description}`;
        characterInstruction = `CHARACTER TO MODIFY: "${subject.label}"\n${faceInstr}\n${costumeInstr}`;
      }

      const otherSubjects = frame.subjects
        .filter(s => s.id !== subject.id)
        .map(s => `Keep character "${s.label}" EXACTLY as in the original. DO NOT change them.`)
        .join('\n');

      const prompt = `
${styleInstruction}

TASK: Modify one character in this scene while keeping everything else identical.

${characterInstruction}

OTHER CHARACTERS (DO NOT TOUCH):
${otherSubjects || 'No other characters.'}

KEEP IDENTICAL: background, lighting, composition, shot type, all props, visual style.

The FIRST image is the scene reference (base composition).
${subject.faceImage ? 'The SECOND image is the NEW FACE to apply.' : ''}
${(!subject.keepCostume && subject.costumeImage) ? 'The THIRD image is the NEW COSTUME to apply.' : ''}
      `.trim();

      const result = await generateImageWithGemini(prompt, refImages, frame.resolution || '16:9');

      updateFrame(activeFrameId, {
        generatedImage: result,
        status: 'done',
        conversationHistory: [
          { role: 'user', parts: [{ text: prompt }] },
          { role: 'model', parts: [{ inlineData: { mimeType: 'image/jpeg', data: result.split(',')[1] } }] },
        ],
      });

      setLastApplied(activeFrameId);
      setTimeout(() => setLastApplied(null), 3000);
    } catch (err) {
      updateFrame(activeFrameId, { status: 'error', errorMsg: friendlyError(err) });
    }
  };

  // ── download ───────────────────────────────────────────────

  const downloadFrame = (frame) => {
    if (!frame.generatedImage) return;
    const link = document.createElement('a');
    link.href = frame.generatedImage;
    const resLabel = frame.resolution === '9:16' ? 'reel' : 'landscape';
    link.download = `storyboard-frame-${frame.id.slice(0, 8)}-${resLabel}.png`;
    link.click();
  };

  // ── subject click ──────────────────────────────────────────

  const handleSubjectClick = (subjectId) => {
    setActiveSubjectId(subjectId);
    setLeftTab('personajes');
  };

  // ── left panel ─────────────────────────────────────────────

  const renderLeftPanel = () => {
    if (!activeFrame || activeFrame.status === 'empty') {
      return (
        <div style={S.instructions}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>🎬</div>
          <div style={S.instrTitle}>STORYBOARD STUDIO</div>
          <div style={S.instrText}>
            Haz clic en <strong style={{ color: C.accent }}>+ FRAME</strong> para crear tu primer fotograma.
          </div>
          <div style={S.instrText}>
            Sube una imagen de referencia y Gemini la analizará automáticamente para que puedas modificar personajes, planos y elementos.
          </div>
        </div>
      );
    }

    if (activeFrame.status === 'analyzing') {
      return <LoadingState label="Analizando imagen…" sub="Detectando personajes, plano y estilo" />;
    }

    if (activeFrame.status === 'generating') {
      return <LoadingState label="Generando imagen…" sub="Imagen 3 está procesando tu frame" />;
    }

    if (activeFrame.status === 'analyzed') {
      if (activeFrame.analysis?.error) {
        return (
          <div style={{ padding: '0 2px' }}>
            <SBAnalysisPanel
              analysis={activeFrame.analysis}
              subjects={activeFrame.subjects}
              onSubjectClick={handleSubjectClick}
              onGenerate={() => {}}
              generating={false}
            />
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button style={S.retryBtn} onClick={() => retryAnalysis(activeFrameId)}>
                ↺ INTENTAR DE NUEVO
              </button>
              <button
                style={{ ...S.retryBtn, color: C.muted, borderColor: C.border }}
                onClick={() => updateFrame(activeFrameId, { status: 'empty', referenceImage: null, analysis: null })}
              >
                SUBIR OTRA IMAGEN
              </button>
            </div>
          </div>
        );
      }
      return (
        <SBAnalysisPanel
          analysis={activeFrame.analysis}
          subjects={activeFrame.subjects}
          onSubjectClick={handleSubjectClick}
          onGenerate={() => generateFrame(activeFrameId)}
          generating={false}
        />
      );
    }

    if (activeFrame.status === 'error') {
      return (
        <div style={S.errorPanel}>
          <div style={S.errorTitle}>⚠ Error</div>
          <div style={S.errorMsg}>{activeFrame.errorMsg}</div>
          <button style={S.retryBtn} onClick={() => retryAnalysis(activeFrameId)}>
            ↺ INTENTAR DE NUEVO
          </button>
        </div>
      );
    }

    if (activeFrame.status === 'done') {
      const activeSubject = activeFrame.subjects?.find(s => s.id === activeSubjectId);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Cambios aplicados banner */}
          {lastApplied === activeFrameId && (
            <div style={{
              background: `${C.success}15`,
              border: `1px solid ${C.success}40`,
              borderRadius: 5,
              padding: '8px 12px',
              fontSize: 10,
              color: C.success,
              fontFamily: 'monospace',
              fontWeight: 700,
              letterSpacing: '0.06em',
              marginBottom: 8,
            }}>
              ✓ CAMBIOS APLICADOS
            </div>
          )}
          {/* Tabs */}
          <div style={S.tabs}>
            {[
              { key: 'personajes', label: 'PERSONAJES' },
              { key: 'reencuadre', label: 'REENCUADRE' },
              { key: 'props',      label: 'PROPS' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => { setLeftTab(tab.key); if (tab.key !== 'personajes') setActiveSubjectId(null); }}
                style={{
                  ...S.tabBtn,
                  ...(leftTab === tab.key ? S.tabBtnActive : {}),
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {leftTab === 'personajes' && (
            <div>
              {activeSubject ? (
                <>
                  <button
                    style={S.backBtn}
                    onClick={() => setActiveSubjectId(null)}
                  >
                    ← TODOS LOS PERSONAJES
                  </button>
                  <div style={{ marginTop: 10 }}>
                    <SBSubjectEditor
                      subject={activeSubject}
                      onUpdate={(updates) => updateSubject(activeFrameId, activeSubjectId, updates)}
                      onGenerateTurnaround={(subId, views) => generateTurnaround(subId, views)}
                      onApplyChanges={applySubjectChanges}
                      generatingViews={generatingViews[activeSubjectId] || false}
                    />
                  </div>
                </>
              ) : (
                <div>
                  {activeFrame.subjects?.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={S.panelLabel}>PERSONAJES DETECTADOS</div>
                      {activeFrame.subjects.map(sub => (
                        <button
                          key={sub.id}
                          onClick={() => setActiveSubjectId(sub.id)}
                          style={S.subjectListBtn}
                          onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
                          onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
                        >
                          <div style={{ fontSize: 10, color: C.text, fontWeight: 600, fontFamily: 'monospace', textAlign: 'left' }}>
                            {sub.label.toUpperCase()}
                          </div>
                          <div style={{ fontSize: 9, color: C.muted, textAlign: 'left', marginTop: 2 }}>
                            {sub.description?.slice(0, 60)}…
                          </div>
                          <div style={{ fontSize: 8, color: C.accent, textAlign: 'right', fontFamily: 'monospace', marginTop: 4 }}>
                            EDITAR →
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={S.noSubjects}>No se detectaron personajes en esta imagen.</div>
                  )}

                  {/* Re-generate with current subject settings */}
                  <button
                    style={{ ...S.regenBtn, marginTop: 14 }}
                    onClick={() => generateFrame(activeFrameId)}
                    disabled={activeFrame.status === 'generating'}
                  >
                    ↺ REGENERAR FRAME
                  </button>
                </div>
              )}
            </div>
          )}

          {leftTab === 'reencuadre' && (
            <SBReframePanel
              frame={activeFrame}
              onApply={applyReframe}
              applying={applyingReframe}
            />
          )}

          {leftTab === 'props' && (
            <SBPropsPanel
              frame={activeFrame}
              onApply={applyProps}
              applying={applyingProps}
            />
          )}
        </div>
      );
    }

    return null;
  };

  // ── render ─────────────────────────────────────────────────

  return (
    <div style={S.root}>
      <SBTopBar
        projectName={projectId ? `Proyecto ${projectId.slice(0, 6)}` : null}
        resolution={resolution}
        onResolutionChange={setResolution}
        onNewFrame={addFrame}
        onNavigateBack={() => navigate('/')}
        frameCount={frames.length}
      />

      <div style={S.body}>
        {/* Left panel */}
        <div style={S.leftPanel}>
          <div style={S.leftScroll}>
            {renderLeftPanel()}
          </div>
        </div>

        {/* Main area */}
        <div style={S.mainArea}>
          {frames.length === 0 ? (
            <div style={S.emptyMain}>
              <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>🎬</div>
              <div style={S.emptyMainTitle}>Sin frames todavía</div>
              <div style={S.emptyMainSub}>Haz clic en + FRAME para comenzar tu storyboard</div>
              <button style={S.addFirstBtn} onClick={addFrame}>+ CREAR PRIMER FRAME</button>
            </div>
          ) : (
            <div style={S.framesGrid}>
              {frames.map((frame, index) => (
                <SBFrame
                  key={frame.id}
                  frame={frame}
                  index={index}
                  isActive={frame.id === activeFrameId}
                  onActivate={() => { setActiveFrameId(frame.id); setActiveSubjectId(null); }}
                  onFileUpload={handleFileUpload}
                  onDownload={downloadFrame}
                  onDelete={deleteFrame}
                />
              ))}
              <div
                onClick={addFrame}
                style={S.addFrameCard}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
              >
                <div style={{ fontSize: 24, color: C.dim }}>+</div>
                <div style={{ fontSize: 9, color: C.dim, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
                  NUEVO FRAME
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── small sub-components ────────────────────────────────────────

function LoadingState({ label, sub }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px', gap: 10 }}>
      <div style={{ fontSize: 28, color: C.accent, animation: 'spin 1s linear infinite' }}>⟳</div>
      <div style={{ fontSize: 11, color: C.text, fontFamily: 'monospace', fontWeight: 700 }}>{label}</div>
      {sub && <div style={{ fontSize: 9, color: C.muted, fontFamily: 'monospace', textAlign: 'center' }}>{sub}</div>}
    </div>
  );
}

// ── styles ─────────────────────────────────────────────────────

const S = {
  root: {
    minHeight: '100vh', background: C.bg, color: C.text,
    fontFamily: 'monospace', letterSpacing: '0.08em',
    display: 'flex', flexDirection: 'column',
  },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  leftPanel: {
    width: 280, flexShrink: 0, background: C.panel,
    borderRight: `1px solid ${C.border}`, display: 'flex',
    flexDirection: 'column', overflow: 'hidden',
  },
  leftScroll: { flex: 1, overflowY: 'auto', padding: '16px 14px' },
  mainArea: { flex: 1, overflowY: 'auto', padding: 20 },
  framesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16, alignItems: 'start',
  },
  emptyMain: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '100%', minHeight: 400, gap: 12,
  },
  emptyMainTitle: { fontSize: 14, color: C.dim, fontFamily: 'monospace' },
  emptyMainSub: { fontSize: 10, color: '#333', fontFamily: 'monospace', textAlign: 'center' },
  addFirstBtn: {
    background: C.accent, border: 'none', borderRadius: 5,
    color: '#fff', padding: '10px 20px', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.1em', cursor: 'pointer', fontFamily: 'monospace', marginTop: 8,
  },
  addFrameCard: {
    background: C.card, border: `1px dashed ${C.border}`, borderRadius: 8,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 8, cursor: 'pointer', minHeight: 180,
    transition: 'border-color 0.15s',
  },
  instructions: { display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' },
  instrTitle: { fontSize: 10, fontWeight: 700, color: C.accent, letterSpacing: '0.14em', fontFamily: 'monospace' },
  instrText: { fontSize: 10, color: C.muted, lineHeight: 1.6 },
  tabs: { display: 'flex', gap: 2, borderBottom: `1px solid ${C.border}`, paddingBottom: 8 },
  tabBtn: {
    flex: 1, background: 'transparent', border: `1px solid transparent`,
    borderRadius: 4, color: C.muted, padding: '5px 4px', fontSize: 8,
    fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
    fontFamily: 'monospace', transition: 'all 0.1s',
  },
  tabBtnActive: {
    background: `${C.accent}15`, borderColor: C.accent, color: C.accent,
  },
  panelLabel: { fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: '0.12em', marginBottom: 8 },
  subjectListBtn: {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
    padding: '10px 12px', cursor: 'pointer', transition: 'border-color 0.15s',
    width: '100%',
  },
  noSubjects: { fontSize: 10, color: C.dim, fontFamily: 'monospace', textAlign: 'center', padding: '16px 0' },
  backBtn: {
    background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.muted, padding: '5px 10px', fontSize: 8, cursor: 'pointer',
    fontFamily: 'monospace', letterSpacing: '0.06em',
  },
  regenBtn: {
    background: `${C.accent}15`, border: `1px solid ${C.accent}40`,
    borderRadius: 5, color: C.accent, padding: '9px', fontSize: 9,
    fontWeight: 700, letterSpacing: '0.08em', fontFamily: 'monospace',
    width: '100%', cursor: 'pointer',
  },
  errorPanel: {
    background: `${C.error}10`, border: `1px solid ${C.error}30`,
    borderRadius: 6, padding: '14px', display: 'flex', flexDirection: 'column', gap: 10,
  },
  errorTitle: { fontSize: 10, color: C.error, fontWeight: 700, fontFamily: 'monospace' },
  errorMsg: { fontSize: 10, color: C.error, lineHeight: 1.5 },
  retryBtn: {
    background: 'transparent', border: `1px solid ${C.error}`,
    borderRadius: 5, color: C.error, padding: '9px', fontSize: 9,
    fontWeight: 700, letterSpacing: '0.08em', fontFamily: 'monospace',
    width: '100%', cursor: 'pointer',
  },
};