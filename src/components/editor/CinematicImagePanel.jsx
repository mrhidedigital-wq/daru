// CinematicImagePanel.jsx
// Panel de generación de imágenes cinematográficas en dos fases:
//   Fase 1 — Generador: idea → prompt mejorado → imagen
//   Fase 2 — Herramientas: Frame Inicial + Frame Final con cambio de plano/ángulo

import React, { useState, useCallback } from 'react';

// ─── Keyframe de spinner inyectado una vez ──────────────────────
const SPIN_STYLE = '@keyframes daruSpin{to{transform:rotate(360deg)}}';
if (typeof document !== 'undefined' && !document.getElementById('daru-spin-kf')) {
  const tag = document.createElement('style');
  tag.id = 'daru-spin-kf';
  tag.textContent = SPIN_STYLE;
  document.head.appendChild(tag);
}

// ─── Paleta ────────────────────────────────────────────────────
const C = {
  bg:      '#1A1A1E',
  panel:   '#232328',
  card:    '#2C2C32',
  border:  '#3A3A42',
  accent:  '#00A8E8',
  accent2: '#7C3AED',
  success: '#00D084',
  warning: '#FFB800',
  error:   '#FF4757',
  text:    '#E0E0E0',
  muted:   '#888892',
  dim:     '#555560',
};

const FONT = "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace";

// ─── Opciones cinematográficas ──────────────────────────────────
const PLANOS = [
  { value: 'extreme wide shot (Gran Plano General)',  label: 'Gran Plano General' },
  { value: 'wide shot (Plano General)',               label: 'Plano General' },
  { value: 'full shot (Plano Entero)',                label: 'Plano Entero' },
  { value: 'american shot (Plano Americano)',         label: 'Plano Americano' },
  { value: 'medium shot (Plano Medio)',               label: 'Plano Medio' },
  { value: 'close-up (Primer Plano)',                 label: 'Primer Plano' },
  { value: 'extreme close-up (Primerísimo PP)',       label: 'Primerísimo PP' },
];

const ANGULOS = [
  { value: 'frontal angle, camera directly in front', label: 'Frontal' },
  { value: '3/4 angle, camera at 45 degrees',         label: '3/4' },
  { value: 'lateral side profile angle',              label: 'Lateral' },
  { value: 'high angle shot, camera tilted down (Picado)', label: 'Picado' },
  { value: 'low angle shot, camera tilted up (Contrapicado)', label: 'Contrapicado' },
];

const ASPECT_RATIOS = ['16:9', '9:16', '1:1'];

// ─── Sistema prompt para mejora de prompt ──────────────────────
const IMPROVE_SYSTEM = `You are an expert cinematographic image prompt engineer. Transform the user's description into a detailed, professional image generation prompt in English. Include: lighting setup, camera lens (35mm, 85mm, etc), color palette, mood, texture details, photorealistic style. Maximum 150 words. Return only the improved prompt, nothing else.`;

// ─── Helper: convertir URL/blob/dataURL a base64 inline ────────
async function toInlineData(url) {
  if (!url) return null;
  try {
    if (url.startsWith('data:')) {
      const [header, data] = url.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
      return { mimeType, data };
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const mimeType = blob.type || 'image/jpeg';
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ mimeType, data: reader.result.split(',')[1] });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ─── Helper: disparar descarga de imagen ──────────────────────
function downloadImage(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

// ════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════
export default function CinematicImagePanel() {
  const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:4000';

  // ── Fase 1: generación ──
  const [userIdea,        setUserIdea]        = useState('');
  const [improvedPrompt,  setImprovedPrompt]  = useState('');
  const [aspectRatio,     setAspectRatio]     = useState('16:9');
  const [generatedImage,  setGeneratedImage]  = useState(null); // base64 dataURL
  const [isImproving,     setIsImproving]     = useState(false);
  const [isGenerating,    setIsGenerating]    = useState(false);
  const [genError,        setGenError]        = useState(null);

  // ── Fase 2: frame inicial ──
  const [planoInicial,  setPlanoInicial]  = useState(PLANOS[4].value);   // Plano Medio
  const [anguloInicial, setAnguloInicial] = useState(ANGULOS[0].value);  // Frontal
  const [accionInicial, setAccionInicial] = useState('');

  // ── Fase 2: frame final ──
  const [activarFinal,  setActivarFinal]  = useState(false);
  const [planoFinal,    setPlanoFinal]    = useState(PLANOS[2].value);   // Plano Entero
  const [anguloFinal,   setAnguloFinal]   = useState(ANGULOS[1].value);  // 3/4
  const [finalImage,    setFinalImage]    = useState(null);
  const [isGenFinal,    setIsGenFinal]    = useState(false);
  const [finalError,    setFinalError]    = useState(null);

  // ════════════════════════════════════════════════════════════
  // MEJORAR PROMPT
  // ════════════════════════════════════════════════════════════
  const handleImprovePrompt = useCallback(async () => {
    if (!userIdea.trim()) return;
    setIsImproving(true);
    setGenError(null);

    try {
      const res = await fetch(`${serverUrl}/api/gemini/proxy/gemini-2.5-flash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${IMPROVE_SYSTEM}\n\nUser description: ${userIdea}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 300,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Error ${res.status}`);
      }

      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = parts.map((p) => p.text || '').join('').trim();
      if (!text) throw new Error('Gemini no devolvió texto');
      setImprovedPrompt(text);
    } catch (err) {
      setGenError('Mejorar prompt: ' + err.message);
    } finally {
      setIsImproving(false);
    }
  }, [userIdea, serverUrl]);

  // ════════════════════════════════════════════════════════════
  // GENERAR IMAGEN
  // ════════════════════════════════════════════════════════════
  const handleGenerateImage = useCallback(async () => {
    const prompt = improvedPrompt.trim() || userIdea.trim();
    if (!prompt) return;
    setIsGenerating(true);
    setGenError(null);
    setGeneratedImage(null);
    setFinalImage(null);
    setActivarFinal(false);

    try {
      // Incluir aspect ratio en el prompt ya que el modelo puede no soportar imageConfig
      const arNote = aspectRatio === '16:9'
        ? 'Landscape 16:9 widescreen format.'
        : aspectRatio === '9:16'
        ? 'Portrait 9:16 vertical format.'
        : 'Square 1:1 format.';

      const fullPrompt = `${prompt} ${arNote}`;

      const res = await fetch(
        `${serverUrl}/api/gemini/proxy/gemini-2.0-flash-preview-image-generation`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: {
              responseModalities: ['IMAGE', 'TEXT'],
            },
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Error ${res.status}`);
      }

      const data = await res.json();
      const resParts = data.candidates?.[0]?.content?.parts || [];
      const imgPart = resParts.find(
        (p) => p.inlineData?.mimeType?.startsWith('image/')
      );
      if (!imgPart) {
        const textParts = resParts.map((p) => p.text || '').join('').trim();
        throw new Error(
          textParts
            ? `Gemini no generó imagen: ${textParts.slice(0, 200)}`
            : 'Gemini no devolvió imagen'
        );
      }

      setGeneratedImage(
        `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`
      );
    } catch (err) {
      setGenError('Generar imagen: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  }, [improvedPrompt, userIdea, aspectRatio, serverUrl]);

  // ════════════════════════════════════════════════════════════
  // GENERAR FRAME FINAL (multi-turn conversation)
  // ════════════════════════════════════════════════════════════
  const handleGenerateFinalFrame = useCallback(async () => {
    if (!generatedImage) return;
    setIsGenFinal(true);
    setFinalError(null);

    try {
      const inline = await toInlineData(generatedImage);
      if (!inline) throw new Error('No se pudo leer la imagen inicial');

      const originalPrompt = improvedPrompt.trim() || userIdea.trim();
      const editPrompt = `Take this exact scene and character, change ONLY the shot type to ${planoFinal} with ${anguloFinal}. Keep identical: lighting, character appearance, clothing, location, color palette. Same moment, different framing.`;

      const res = await fetch(
        `${serverUrl}/api/gemini/proxy/gemini-2.0-flash-preview-image-generation`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              // Turno 1 usuario: lo que generó el frame inicial
              {
                role: 'user',
                parts: [{ text: originalPrompt }],
              },
              // Turno 1 modelo: la imagen inicial (simula que el modelo la generó)
              {
                role: 'model',
                parts: [
                  {
                    inlineData: {
                      mimeType: inline.mimeType,
                      data: inline.data,
                    },
                  },
                ],
              },
              // Turno 2 usuario: pide el cambio de plano/ángulo
              {
                role: 'user',
                parts: [{ text: editPrompt }],
              },
            ],
            generationConfig: {
              responseModalities: ['IMAGE', 'TEXT'],
            },
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Error ${res.status}`);
      }

      const data = await res.json();
      const resParts = data.candidates?.[0]?.content?.parts || [];
      const imgPart = resParts.find(
        (p) => p.inlineData?.mimeType?.startsWith('image/')
      );
      if (!imgPart) {
        const textParts = resParts.map((p) => p.text || '').join('').trim();
        throw new Error(
          textParts
            ? `Gemini no generó imagen: ${textParts.slice(0, 200)}`
            : 'Gemini no devolvió imagen para el Frame Final'
        );
      }

      setFinalImage(
        `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`
      );
    } catch (err) {
      setFinalError('Frame Final: ' + err.message);
    } finally {
      setIsGenFinal(false);
    }
  }, [generatedImage, improvedPrompt, userIdea, planoFinal, anguloFinal, serverUrl]);

  // ════════════════════════════════════════════════════════════
  // DESCARGAS
  // ════════════════════════════════════════════════════════════
  const handleDownloadStart = useCallback(() => {
    if (!generatedImage) return;
    const ts = Date.now();
    downloadImage(generatedImage, `daru-frame-start-${ts}.png`);
  }, [generatedImage]);

  const handleDownloadEnd = useCallback(() => {
    if (!finalImage) return;
    const ts = Date.now();
    downloadImage(finalImage, `daru-frame-end-${ts}.png`);
  }, [finalImage]);

  const handleDownloadBoth = useCallback(() => {
    const ts = Date.now();
    if (generatedImage) downloadImage(generatedImage, `daru-frame-start-${ts}.png`);
    if (finalImage) downloadImage(finalImage, `daru-frame-end-${ts}.png`);
  }, [generatedImage, finalImage]);

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════
  const canGenerate = (improvedPrompt.trim() || userIdea.trim()) && !isGenerating;

  return (
    <div style={S.root}>
      {/* ── HEADER ── */}
      <div style={S.sectionHeader}>
        <span style={S.sectionDot} />
        GENERADOR CINEMATOGRÁFICO
      </div>

      {/* ════════════════════════════════════════════════════
          FASE 1 — GENERADOR
      ════════════════════════════════════════════════════ */}

      {/* Idea del usuario */}
      <label style={S.label}>TU IDEA</label>
      <textarea
        value={userIdea}
        onChange={(e) => setUserIdea(e.target.value)}
        placeholder="Describe tu escena en español… ej: Un detective con gabardina camina por una calle mojada de noche en la ciudad"
        style={S.textarea}
        rows={3}
      />

      {/* Botón mejorar prompt */}
      <button
        onClick={handleImprovePrompt}
        disabled={!userIdea.trim() || isImproving}
        style={{
          ...S.btn,
          ...((!userIdea.trim() || isImproving) ? S.btnDisabled : S.btnSecondary),
          marginBottom: 10,
        }}
      >
        {isImproving ? '🔄 MEJORANDO...' : '✨ MEJORAR PROMPT'}
      </button>

      {/* Prompt mejorado (editable) */}
      {(improvedPrompt || isImproving) && (
        <>
          <label style={S.label}>PROMPT MEJORADO{isImproving ? ' ...' : ' (editable)'}</label>
          <textarea
            value={improvedPrompt}
            onChange={(e) => setImprovedPrompt(e.target.value)}
            placeholder="El prompt mejorado aparecerá aquí…"
            style={{ ...S.textarea, color: C.accent, borderColor: `${C.accent}44` }}
            rows={4}
          />
        </>
      )}

      {/* Aspect ratio */}
      <div style={S.arRow}>
        <span style={S.label}>FORMATO</span>
        <div style={S.arBtns}>
          {ASPECT_RATIOS.map((ar) => (
            <button
              key={ar}
              onClick={() => setAspectRatio(ar)}
              style={{
                ...S.arBtn,
                ...(aspectRatio === ar ? S.arBtnActive : {}),
              }}
            >
              {ar}
            </button>
          ))}
        </div>
      </div>

      {/* Botón generar imagen */}
      <button
        onClick={handleGenerateImage}
        disabled={!canGenerate}
        style={{
          ...S.btn,
          ...S.btnPrimary,
          ...(!canGenerate ? S.btnDisabled : {}),
          marginBottom: 4,
        }}
      >
        {isGenerating ? (
          <span>
            <span style={S.spinner}>◌</span> GENERANDO IMAGEN…
          </span>
        ) : (
          '⬛ GENERAR IMAGEN'
        )}
      </button>

      {/* Error de generación */}
      {genError && (
        <div style={S.errorBox}>
          <span style={{ flex: 1 }}>{genError}</span>
          <button style={S.dismissBtn} onClick={() => setGenError(null)}>✕</button>
        </div>
      )}

      {/* Loading skeleton mientras genera */}
      {isGenerating && (
        <div style={S.skeleton}>
          <div style={S.skeletonInner}>
            <div style={S.skeletonText}>⟳ Llamando a Gemini imagen…</div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          FASE 2 — HERRAMIENTAS CINEMATOGRÁFICAS
      ════════════════════════════════════════════════════ */}
      {generatedImage && !isGenerating && (
        <>
          <div style={{ borderTop: `1px solid ${C.border}`, margin: '18px 0 14px' }} />

          {/* ── FRAME INICIAL ── */}
          <div style={S.sectionHeader}>
            <span style={{ ...S.sectionDot, background: C.success }} />
            FRAME INICIAL
          </div>

          {/* Imagen con badge */}
          <div style={S.frameWrap}>
            <img src={generatedImage} alt="Frame Inicial" style={S.frameImg} />
            <span style={{ ...S.frameBadge, background: C.success }}>FRAME INICIAL</span>
          </div>

          {/* Tipo de plano inicial */}
          <label style={S.label}>TIPO DE PLANO</label>
          <select
            value={planoInicial}
            onChange={(e) => setPlanoInicial(e.target.value)}
            style={S.select}
          >
            {PLANOS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>

          {/* Ángulo inicial */}
          <label style={S.label}>ÁNGULO</label>
          <select
            value={anguloInicial}
            onChange={(e) => setAnguloInicial(e.target.value)}
            style={S.select}
          >
            {ANGULOS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>

          {/* Acción */}
          <label style={S.label}>ACCIÓN</label>
          <textarea
            value={accionInicial}
            onChange={(e) => setAccionInicial(e.target.value)}
            placeholder="¿Qué ocurre en este frame? Ej: El personaje mira hacia la ventana"
            style={S.textarea}
            rows={2}
          />

          {/* Descargar frame inicial */}
          <button onClick={handleDownloadStart} style={{ ...S.btn, ...S.btnDownload, marginBottom: 14 }}>
            ⬇ DESCARGAR FRAME INICIAL
          </button>

          {/* ── FRAME FINAL ── */}
          <div style={S.sectionHeader}>
            <span style={{ ...S.sectionDot, background: activarFinal ? C.accent2 : C.dim }} />
            FRAME FINAL
            <label style={S.toggleWrap}>
              <input
                type="checkbox"
                checked={activarFinal}
                onChange={(e) => {
                  setActivarFinal(e.target.checked);
                  if (!e.target.checked) { setFinalImage(null); setFinalError(null); }
                }}
                style={{ display: 'none' }}
              />
              <span
                style={{
                  ...S.toggle,
                  background: activarFinal ? C.accent2 : C.card,
                  borderColor: activarFinal ? C.accent2 : C.border,
                }}
              >
                <span
                  style={{
                    ...S.toggleKnob,
                    transform: activarFinal ? 'translateX(14px)' : 'translateX(0)',
                  }}
                />
              </span>
              <span style={{ fontSize: 9, color: activarFinal ? C.accent2 : C.muted, marginLeft: 6 }}>
                {activarFinal ? 'ACTIVADO' : 'ACTIVAR FRAME FINAL'}
              </span>
            </label>
          </div>

          {activarFinal && (
            <>
              {/* Tipo de plano final */}
              <label style={S.label}>TIPO DE PLANO FINAL</label>
              <select
                value={planoFinal}
                onChange={(e) => setPlanoFinal(e.target.value)}
                style={S.select}
              >
                {PLANOS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>

              {/* Ángulo final */}
              <label style={S.label}>ÁNGULO FINAL</label>
              <select
                value={anguloFinal}
                onChange={(e) => setAnguloFinal(e.target.value)}
                style={S.select}
              >
                {ANGULOS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>

              {/* Botón generar frame final */}
              <button
                onClick={handleGenerateFinalFrame}
                disabled={isGenFinal}
                style={{
                  ...S.btn,
                  background: isGenFinal
                    ? C.card
                    : 'linear-gradient(135deg, #7C3AED, #5B21B6)',
                  color: isGenFinal ? C.dim : '#fff',
                  border: `1px solid ${isGenFinal ? C.border : C.accent2}`,
                  marginBottom: 10,
                }}
              >
                {isGenFinal ? (
                  <span><span style={S.spinner}>◌</span> GENERANDO FRAME FINAL…</span>
                ) : (
                  '🎬 GENERAR FRAME FINAL'
                )}
              </button>

              {/* Error frame final */}
              {finalError && (
                <div style={S.errorBox}>
                  <span style={{ flex: 1 }}>{finalError}</span>
                  <button style={S.dismissBtn} onClick={() => setFinalError(null)}>✕</button>
                </div>
              )}

              {/* Loading skeleton */}
              {isGenFinal && (
                <div style={S.skeleton}>
                  <div style={S.skeletonInner}>
                    <div style={S.skeletonText}>⟳ Editando plano/ángulo con Gemini…</div>
                  </div>
                </div>
              )}

              {/* Imagen frame final */}
              {finalImage && !isGenFinal && (
                <>
                  <div style={S.frameWrap}>
                    <img src={finalImage} alt="Frame Final" style={S.frameImg} />
                    <span style={{ ...S.frameBadge, background: C.accent2 }}>FRAME FINAL</span>
                  </div>
                  <button
                    onClick={handleDownloadEnd}
                    style={{ ...S.btn, ...S.btnDownload, marginBottom: 14 }}
                  >
                    ⬇ DESCARGAR FRAME FINAL
                  </button>
                </>
              )}
            </>
          )}

          {/* ── DESCARGAR AMBOS ── */}
          {generatedImage && finalImage && (
            <button
              onClick={handleDownloadBoth}
              style={{
                ...S.btn,
                background: 'linear-gradient(135deg, #00A8E8, #7C3AED)',
                color: '#fff',
                border: 'none',
                fontWeight: 700,
                letterSpacing: '0.1em',
                marginTop: 4,
              }}
            >
              ⬇ DESCARGAR AMBOS FRAMES
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════════
const S = {
  root: {
    padding: '14px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontFamily: FONT,
  },

  sectionHeader: {
    fontSize: 9,
    fontWeight: 700,
    color: C.muted,
    letterSpacing: '0.15em',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginTop: 2,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: C.accent,
    flexShrink: 0,
  },

  label: {
    fontSize: 8,
    fontWeight: 600,
    color: C.dim,
    letterSpacing: '0.12em',
    marginBottom: 3,
  },

  textarea: {
    width: '100%',
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    color: C.text,
    fontSize: 11,
    fontFamily: FONT,
    padding: '8px 10px',
    resize: 'vertical',
    outline: 'none',
    lineHeight: 1.5,
    boxSizing: 'border-box',
  },

  // ── Botones base ──
  btn: {
    width: '100%',
    padding: '8px 0',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 9,
    fontWeight: 700,
    fontFamily: FONT,
    letterSpacing: '0.1em',
    transition: 'all 0.15s',
    border: 'none',
    textAlign: 'center',
  },
  btnPrimary: {
    background: C.accent,
    color: '#000',
    border: `1px solid ${C.accent}`,
  },
  btnSecondary: {
    background: 'rgba(124,58,237,0.1)',
    color: C.accent2,
    border: `1px solid ${C.accent2}`,
  },
  btnDownload: {
    background: 'rgba(0,168,232,0.1)',
    color: C.accent,
    border: `1px solid ${C.accent}44`,
  },
  btnDisabled: {
    opacity: 0.38,
    cursor: 'not-allowed',
  },

  // ── Aspect ratio ──
  arRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  arBtns: {
    display: 'flex',
    gap: 4,
    flex: 1,
  },
  arBtn: {
    flex: 1,
    padding: '5px 0',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 8,
    fontWeight: 700,
    fontFamily: FONT,
    background: C.card,
    color: C.muted,
    border: `1px solid ${C.border}`,
    transition: 'all 0.12s',
  },
  arBtnActive: {
    background: C.accent,
    color: '#000',
    border: `1px solid ${C.accent}`,
  },

  // ── Frame imagen ──
  frameWrap: {
    position: 'relative',
    width: '100%',
    borderRadius: 6,
    overflow: 'hidden',
    border: `1px solid ${C.border}`,
    marginBottom: 8,
  },
  frameImg: {
    width: '100%',
    display: 'block',
    objectFit: 'contain',
  },
  frameBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    fontSize: 8,
    fontWeight: 700,
    fontFamily: FONT,
    letterSpacing: '0.12em',
    color: '#fff',
    padding: '2px 7px',
    borderRadius: 3,
    background: C.success,
  },

  // ── Select ──
  select: {
    width: '100%',
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 4,
    color: C.text,
    fontSize: 10,
    fontFamily: FONT,
    padding: '6px 8px',
    outline: 'none',
    cursor: 'pointer',
    marginBottom: 6,
  },

  // ── Toggle ──
  toggleWrap: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  toggle: {
    width: 30,
    height: 16,
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    position: 'relative',
    transition: 'all 0.2s',
    flexShrink: 0,
  },
  toggleKnob: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#fff',
    transition: 'transform 0.2s',
  },

  // ── Error ──
  errorBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    padding: '8px 10px',
    background: 'rgba(255,71,87,0.1)',
    border: `1px solid rgba(255,71,87,0.3)`,
    borderRadius: 4,
    color: '#FF4757',
    fontSize: 10,
    fontFamily: FONT,
    lineHeight: 1.4,
  },
  dismissBtn: {
    background: 'none',
    border: 'none',
    color: C.dim,
    cursor: 'pointer',
    fontSize: 11,
    padding: 0,
    flexShrink: 0,
  },

  // ── Loading skeleton ──
  skeleton: {
    width: '100%',
    aspectRatio: '16/9',
    background: C.card,
    borderRadius: 6,
    border: `1px solid ${C.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  skeletonInner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  skeletonText: {
    fontSize: 10,
    color: C.muted,
    fontFamily: FONT,
    letterSpacing: '0.05em',
  },

  // ── Spinner (usa keyframe daruSpin inyectado al montar) ──
  spinner: {
    display: 'inline-block',
    animation: 'daruSpin 0.9s linear infinite',
    marginRight: 4,
  },
};
