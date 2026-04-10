import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_FASHION_ASSIST_INPUT } from '../lib/editor/fashionAssistSchema';

import { executeEdit } from '../lib/editor/dag/EditorDAGExecutor';
import FashionAssistService from '../lib/editor/FashionAssistService';
import {
  editSessionsDB,
  editOperationsDB,
  editElementsDB,
  editorStorage,
} from '../lib/editor/editorDatabase';
import EditorTopBar      from '../components/editor/EditorTopBar';
import ElementsPanel     from '../components/editor/ElementsPanel';
import FashionAssistPanel from '../components/editor/FashionAssistPanel';

// ─── Paleta (consistente con DaruStudio) ────────────────────
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

// ════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════

export default function DaruEditor() {
  const { sessionId: urlSessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // ── Estado principal ──
  const [session, setSession]             = useState(null);
  const [originalMedia, setOriginalMedia] = useState(null);
  const [currentMedia, setCurrentMedia]   = useState(null);
  const [elements, setElements]           = useState([]);
  const [operations, setOperations]       = useState([]);

  // ── Edición ──
  const [instruction, setInstruction] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress]       = useState(null);
  const [nodeUpdates, setNodeUpdates] = useState([]);
  const [lastError, setLastError]     = useState(null);

  // ── Máscara ──
  const [maskMode, setMaskMode]   = useState(null); // null|'brush'|'eraser'
  const [maskData, setMaskData]   = useState(null);
  const [brushSize, setBrushSize] = useState(30);
  const [isDrawing, setIsDrawing] = useState(false);

  // ── UI ──
  const [showHistory, setShowHistory] = useState(false);
  const [compareMode, setCompareMode] = useState('side'); // 'side'|'overlay'
  const [editMode,    setEditMode]    = useState('faithful'); // 'faithful'|'creative'
  const [aspectRatio, setAspectRatio] = useState('16:9');

  // ── Fashion Assist ──
  const [isEnhancing, setIsEnhancing]           = useState(false);

  // ── Refs ──
  const maskCanvasRef  = useRef(null);
  const maskCtxRef     = useRef(null);
  const mediaImgRef    = useRef(null);
  const fileInputRef   = useRef(null);
  const fashionAutoExec = useRef(false);
  const fashionServiceRef = useRef(new FashionAssistService());

const [fashionAssistInput, setFashionAssistInput] = useState(DEFAULT_FASHION_ASSIST_INPUT);
  const updateFashionField = useCallback((key, value) => {
  setFashionAssistInput((prev) => ({
    ...prev,
    [key]: value,
  }));
}, []);

const updateFashionConstraint = useCallback((key, value) => {
  setFashionAssistInput((prev) => ({
    ...prev,
    constraints: {
      ...prev.constraints,
      [key]: value,
    },
  }));
}, []);

const syncElementsToFashionRefs = useCallback(() => {
  setFashionAssistInput((prev) => {
    const mapped = elements.map((el, index) => {
      let role = 'detail_texture';

      if (index === 0) role = 'hero_front';
      else if (index === 1) role = 'hero_side';
      else if (index === 2) role = 'detail_structure';
      else if (index === 3) role = 'detail_logo';

      return {
        id: `element_${el.index}`,
        url: el.imageUrl,
        name: el.name || `Element ${index + 1}`,
        role,
        priority: index + 1,
        notes: el.description || '',
      };
    });

    return {
      ...prev,
      subjectImage: currentMedia || prev.subjectImage,
      productRefs: mapped,
    };
  });
}, [elements, currentMedia]);

  // ════════════════════════════════════════════════════════════
  // CARGAR SESIÓN EXISTENTE
  // ════════════════════════════════════════════════════════════

  // Auto-execute when fashion assist sets instruction
  useEffect(() => {
    if (fashionAutoExec.current && instruction.trim() && session && !isProcessing) {
      fashionAutoExec.current = false;
      handleExecuteEdit();
    }
  }, [instruction]); // eslint-disable-line

  useEffect(() => {
    if (urlSessionId && user) loadSession(urlSessionId);
  }, [urlSessionId, user]); // eslint-disable-line

  const loadSession = async (id) => {
    try {
      const s = await editSessionsDB.getById(id);
      setSession(s);
      setOriginalMedia({ url: s.original_url, type: s.media_type, name: s.name });
      setCurrentMedia(s.current_url || s.original_url);
      if (s.edit_operations) setOperations(s.edit_operations);
      if (s.edit_elements)   setElements(s.edit_elements.map((e, i) => ({
        imageUrl: e.image_url, name: e.name, description: e.description, index: e.element_index,
      })));
    } catch (err) {
      setLastError('Could not load session');
    }
  };

  // ════════════════════════════════════════════════════════════
  // UPLOAD MEDIA ORIGINAL
  // ════════════════════════════════════════════════════════════

  const handleMediaUpload = useCallback(async (file) => {
    if (!user) return;
    setLastError(null);
    const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
    const localUrl  = URL.createObjectURL(file);
    setOriginalMedia({ url: localUrl, type: mediaType, name: file.name });
    setCurrentMedia(localUrl);
    setOperations([]);
    setElements([]);
    setMaskData(null);
    setMaskMode(null);

    try {
      const uploadedUrl = await editorStorage.upload(user.id, 'new', file, file.name);
      const newSession  = await editSessionsDB.create(user.id, {
        name: file.name, media_type: mediaType, original_url: uploadedUrl,
        metadata: { originalName: file.name, size: file.size },
      });
      setSession(newSession);
      setOriginalMedia({ url: uploadedUrl, type: mediaType, name: file.name });
      setCurrentMedia(uploadedUrl);
      navigate(`/editor/${newSession.id}`, { replace: true });
    } catch (err) {
      setLastError('Upload failed: ' + err.message);
    }
  }, [user, navigate]);

  // ════════════════════════════════════════════════════════════
  // UPLOAD ELEMENTO DE REFERENCIA
  // ════════════════════════════════════════════════════════════

  const handleElementUpload = useCallback(async (file) => {
    if (!session) return;
    const idx      = elements.length + 1;
    const localUrl = URL.createObjectURL(file);
    const newEl    = { imageUrl: localUrl, name: file.name, description: '', index: idx };

    setElements(prev => [...prev, newEl]);

    try {
      const uploadedUrl = await editorStorage.upload(user.id, session.id, file, file.name);
      newEl.imageUrl = uploadedUrl;
      await editElementsDB.upsert(session.id, idx, {
        name: file.name, image_url: uploadedUrl,
      });
      setElements(prev => prev.map(e => e.index === idx ? { ...e, imageUrl: uploadedUrl } : e));
    } catch (err) {
      console.error('Element upload failed:', err);
    }
  }, [session, elements, user]);

  const removeElement = useCallback(async (idx) => {
    setElements(prev => prev.filter(e => e.index !== idx));
    if (session) {
      editElementsDB.delete(session.id, idx).catch(() => {});
    }
  }, [session]);

  // ════════════════════════════════════════════════════════════
  // EJECUTAR EDICIÓN
  // ════════════════════════════════════════════════════════════

  const handleExecuteEdit = useCallback(async () => {
    if (!instruction.trim() || !currentMedia || !session || isProcessing) return;
    setIsProcessing(true);
    setLastError(null);
    setNodeUpdates([]);
    setProgress({ status: 'starting', percent: 0, message: 'Starting...' });

    const versionNumber = operations.length + 1;

    try {
      const operation = await editOperationsDB.create(session.id, {
        version_number: versionNumber,
        instruction:    instruction.trim(),
        operation_type: 'pending',
        original_url:   currentMedia,
        status:         'processing',
      });

      const result = await executeEdit({
        mediaUrl:    currentMedia,
        mediaType:   originalMedia?.type || 'image',
        instruction: instruction.trim(),
        editMode,
        aspectRatio,
        elements:    elements.map(e => ({
          imageUrl: e.imageUrl, name: e.name, description: e.description,
        })),
        userMask:    maskData,
        userId:      user.id,
        sessionId:   session.id,
        onProgress:  (p) => setProgress(p),
        onNodeUpdate:(u) => setNodeUpdates(prev => [...prev, u]),
      });

      if (result.status === 'clarification_needed') {
        setIsProcessing(false);
        setProgress(null);
        setLastError(`⚠️ ${result.question}`);
        return;
      }
      if (result.status === 'error') throw new Error(result.error);

      let resultUrl = result.resultUrl;
      if (resultUrl?.startsWith('data:')) {
        const b64  = resultUrl.split(',')[1];
        const mime = resultUrl.split(';')[0].split(':')[1];
        resultUrl  = await editorStorage.uploadBase64(user.id, session.id, b64, mime);
      }

      await editOperationsDB.updateResult(operation.id, {
        result_url: resultUrl, validation: result.validation,
        score: result.score, cost_usd: result.cost,
        provider: result.provider, status: 'completed',
      });
      await editSessionsDB.updateCurrentVersion(session.id, resultUrl, versionNumber);

      setCurrentMedia(resultUrl);
      setOperations(prev => [...prev, {
        ...operation, result_url: resultUrl, status: 'completed',
        score: result.score, cost_usd: result.cost, provider: result.provider,
      }]);
      setInstruction('');
      setMaskData(null);
      setMaskMode(null);
      setProgress({ status: 'completed', percent: 100, message: 'Edit complete!' });

    } catch (err) {
      setLastError(err.message);
      setProgress({ status: 'error', percent: 0, message: err.message });
    } finally {
      setIsProcessing(false);
    }
  }, [instruction, currentMedia, session, isProcessing, operations, elements, maskData, originalMedia, user, editMode, aspectRatio]);

  // ════════════════════════════════════════════════════════════
  // ROLLBACK
  // ════════════════════════════════════════════════════════════

  const handleRollback = useCallback(async (versionIndex) => {
    if (!session || !operations[versionIndex]) return;
    const targetUrl = operations[versionIndex].original_url;
    for (let i = versionIndex; i < operations.length; i++) {
      if (operations[i].id) editOperationsDB.rollback(operations[i].id).catch(() => {});
    }
    setCurrentMedia(targetUrl);
    setOperations(prev => prev.slice(0, versionIndex));
    await editSessionsDB.updateCurrentVersion(session.id, targetUrl, versionIndex);
  }, [session, operations]);

  // ════════════════════════════════════════════════════════════
  // MASK CANVAS
  // ════════════════════════════════════════════════════════════

  const initMaskCanvas = useCallback(() => {
    const canvas = maskCanvasRef.current;
    const img    = mediaImgRef.current;
    if (!canvas || !img) return;
    const rect = img.getBoundingClientRect();
    canvas.width  = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    maskCtxRef.current = ctx;
  }, []);

  useEffect(() => {
    if (maskMode) initMaskCanvas();
  }, [maskMode, initMaskCanvas, currentMedia]);

  const getCanvasPos = (e) => {
    const rect = maskCanvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  useEffect(() => {
  if (currentMedia) {
    syncElementsToFashionRefs();
  }
}, [elements, currentMedia, syncElementsToFashionRefs]);

  const onPointerDown = (e) => {
    if (!maskMode || !maskCtxRef.current) return;
    setIsDrawing(true);
    const { x, y } = getCanvasPos(e);
    const ctx = maskCtxRef.current;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onPointerMove = (e) => {
    if (!isDrawing || !maskCtxRef.current) return;
    const { x, y } = getCanvasPos(e);
    const ctx = maskCtxRef.current;
    if (maskMode === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = 'rgba(255, 0, 80, 0.5)';
    ctx.lineWidth   = brushSize;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const onPointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    // Generar máscara blanco/negro para la API
    exportMask();
  };

  const exportMask = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    // Crear canvas temporal con máscara b/n
    const tmp    = document.createElement('canvas');
    tmp.width    = canvas.width;
    tmp.height   = canvas.height;
    const tmpCtx = tmp.getContext('2d', { willReadFrequently: true });
    // Fondo negro
    tmpCtx.fillStyle = '#000000';
    tmpCtx.fillRect(0, 0, tmp.width, tmp.height);
    // Copiar pinceladas como blanco — usar maskCtxRef que ya tiene willReadFrequently
    const imgData = maskCtxRef.current.getImageData(0, 0, canvas.width, canvas.height);
    const pixels  = imgData.data;
    const outData = tmpCtx.getImageData(0, 0, tmp.width, tmp.height);
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 30) { // Cualquier pixel con alpha > 30 → blanco
        outData.data[i]     = 255;
        outData.data[i + 1] = 255;
        outData.data[i + 2] = 255;
        outData.data[i + 3] = 255;
      }
    }
    tmpCtx.putImageData(outData, 0, 0);
    setMaskData(tmp.toDataURL('image/png'));
  };

  const clearMask = () => {
    if (maskCtxRef.current && maskCanvasRef.current) {
      maskCtxRef.current.clearRect(0, 0, maskCanvasRef.current.width, maskCanvasRef.current.height);
    }
    setMaskData(null);
  };

  // ── Delete/Backspace borra la selección activa (máscara) ────
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (maskData) clearMask();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [maskData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ════════════════════════════════════════════════════════════
  // FASHION ASSIST — Un botón: analiza y viste automáticamente
  // ════════════════════════════════════════════════════════════

  const _imageToBase64 = async (url) => {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const b64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(',')[1]);
      r.onerror = () => rej(new Error('Failed to read image'));
      r.readAsDataURL(blob);
    });
    return { data: b64, mimeType: blob.type || 'image/jpeg' };
  };

const handleFashionDress = useCallback(async () => {
  if (!currentMedia || elements.length === 0 || !session || !user || isProcessing) return;

  setIsEnhancing(true);
  setLastError(null);

  try {
    const versionNumber = operations.length + 1;

    const operation = await editOperationsDB.create(session.id, {
      version_number: versionNumber,
      instruction: 'Fashion Assist',
      operation_type: 'fashion_assist',
      original_url: currentMedia,
      status: 'processing',
    });

    const productRefs = (fashionAssistInput.productRefs || [])
      .filter((ref) => ref && ref.url)
      .slice(0, 6);

    const result = await fashionServiceRef.current.run({
      ...fashionAssistInput,
      subjectImage: currentMedia,
      productRefs,
      constraints: {
        ...fashionAssistInput.constraints,
        noRedesign:
          fashionAssistInput.fidelityMode === 'creative'
            ? false
            : fashionAssistInput.constraints.noRedesign,
      },
    });

    let resultUrl = result.imageUrl;

    if (resultUrl && resultUrl.startsWith('data:')) {
      const b64 = resultUrl.split(',')[1];
      const mime = resultUrl.split(';')[0].split(':')[1];
      resultUrl = await editorStorage.uploadBase64(user.id, session.id, b64, mime);
    }

    await editOperationsDB.updateResult(operation.id, {
      result_url: resultUrl,
      validation: {
        type: 'fashion_assist',
        selectedRefs: result.selectedRefs,
        prompt: result.prompt,
        taskType: fashionAssistInput.taskType,
        subjectType: fashionAssistInput.subjectType,
        pose: fashionAssistInput.pose,
        bodyArea: fashionAssistInput.bodyArea,
        fidelityMode: fashionAssistInput.fidelityMode,
      },
      score: 0.9,
      cost_usd: 0,
      provider: 'gemini-fashion-assist',
      status: 'completed',
    });

    await editSessionsDB.updateCurrentVersion(session.id, resultUrl, versionNumber);

    setCurrentMedia(resultUrl);
    setOperations((prev) => [
      ...prev,
      {
        ...operation,
        result_url: resultUrl,
        status: 'completed',
        score: 0.9,
        cost_usd: 0,
        provider: 'gemini-fashion-assist',
      },
    ]);

    setInstruction(result.prompt || '');
    setProgress({
      status: 'completed',
      percent: 100,
      message: 'Fashion Assist complete!',
    });
  } catch (err) {
    setLastError('Fashion Assist error: ' + err.message);
    setProgress({ status: 'error', percent: 0, message: err.message });
  } finally {
    setIsEnhancing(false);
  }
}, [currentMedia, elements.length, session, user, isProcessing, operations.length, fashionAssistInput]);


  // ════════════════════════════════════════════════════════════
  // MEJORAR PROMPT — Para el textarea de INSTRUCTION general
  // ════════════════════════════════════════════════════════════

  const handleEnhanceInstruction = useCallback(async () => {
    if (!instruction.trim() || !currentMedia) return;
    setIsEnhancing(true);
    setLastError(null);

    try {
      const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:4000';

      const img = await _imageToBase64(currentMedia);

      // Construir parts: imagen principal + elementos si hay
      const parts = [
        { inlineData: { mimeType: img.mimeType, data: img.data } },
      ];

      for (const el of elements) {
        try {
          const elImg = await _imageToBase64(el.imageUrl);
          parts.push({ inlineData: { mimeType: elImg.mimeType, data: elImg.data } });
        } catch (_) { /* skip */ }
      }

      const elemNote = elements.length > 0
        ? `\nHay ${elements.length} elemento(s) de referencia adjuntos (Element 1${elements.length > 1 ? ', Element 2, etc.' : ''}). Si el usuario los menciona, refiérete a ellos como "Element N" en el prompt.`
        : '';

      parts.push({ text: `Eres un agente experto en edición de imágenes y prompts.

IMAGEN ACTUAL: La primera imagen es la que el usuario quiere editar.${elemNote}

INSTRUCCIÓN DEL USUARIO: "${instruction}"

TU TAREA:
Mejora y detalla el prompt del usuario para que una IA de edición de imágenes lo ejecute con precisión. Añade:
- Detalles específicos sobre qué área de la imagen modificar
- Instrucciones sobre preservación (qué NO cambiar)
- Detalles técnicos (iluminación, color, textura, bordes)
- Si hay elementos de referencia, instrucciones de cómo integrarlos sin modificarlos

Responde SOLO con el prompt mejorado. Sin explicaciones, sin markdown.` });

      const endpoint = `${serverUrl}/api/gemini/proxy/gemini-2.5-flash`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1000,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Gemini error ${response.status}`);
      }

      const data = await response.json();
      const resParts = data.candidates?.[0]?.content?.parts || [];
      const promptText = resParts.map(p => p.text || '').join('').trim();

      if (!promptText) throw new Error('No se recibió respuesta de Gemini');

      setInstruction(promptText);

    } catch (err) {
      setLastError('Enhance error: ' + err.message);
    } finally {
      setIsEnhancing(false);
    }
  }, [instruction, currentMedia, elements]);

  // ════════════════════════════════════════════════════════════
  // DROP ZONE — Subir media arrastrando
  // ════════════════════════════════════════════════════════════

  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      handleMediaUpload(file);
    }
  };

  // ════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════

 return (
  <div style={S.root}>
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*,video/*"
      hidden
      onChange={(e) => {
        if (e.target.files[0]) handleMediaUpload(e.target.files[0]);
        e.target.value = '';
      }}
    />

      {/* ── TOP BAR ── */}
      <EditorTopBar session={session} originalMedia={originalMedia} operations={operations} />

      {/* ── MAIN LAYOUT ── */}
      <div style={S.main}>

        {/* ── LEFT: ELEMENTS LIBRARY ── */}
        <ElementsPanel
          elements={elements}
          operations={operations}
          currentMedia={currentMedia}
          originalMedia={originalMedia}
          session={session}
          maskMode={maskMode}
          maskData={maskData}
          brushSize={brushSize}
          showHistory={showHistory}
          isProcessing={isProcessing}
          onOpenMedia={() => fileInputRef.current?.click()}
          onAddElement={handleElementUpload}
          onRemoveElement={removeElement}
          onSetMaskMode={setMaskMode}
          onSetBrushSize={setBrushSize}
          onClearMask={clearMask}
          onToggleHistory={() => setShowHistory(!showHistory)}
          onRollback={handleRollback}
        />

        {/* ── CENTER: CANVAS ── */}
        <div style={S.centerPanel}>
          {!originalMedia ? (
            /* ── Empty state: drop zone ── */
            <div style={{ ...S.dropZone, borderColor: dragOver ? C.accent : C.border }}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
            >
              <div style={S.dropIcon}>{dragOver ? '📥' : '🎬'}</div>
              <div style={S.dropTitle}>Drop an image or video here</div>
              <div style={S.dropSub}>or click to browse — supports JPG, PNG, WEBP, MP4, MOV</div>
              
            </div>
          ) : (
            /* ── Media preview ── */
            <div style={S.canvasArea}>
              {/* Compare mode tabs */}
              <div style={S.compareTabs}>
                <button style={{...S.compareTab, ...(compareMode === 'side' ? S.compareActive : {})}}
                  onClick={() => setCompareMode('side')}>Side by Side</button>
                <button style={{...S.compareTab, ...(compareMode === 'overlay' ? S.compareActive : {})}}
                  onClick={() => setCompareMode('overlay')}>Overlay</button>
              </div>

              <div style={S.canvasGrid(compareMode)}>
  {compareMode === 'side' && (
    <div style={S.canvasFrame}>
      <span style={S.canvasLabel}>ORIGINAL</span>
      {originalMedia.type === 'video' ? (
        <video src={originalMedia.url} controls style={S.mediaPreview} />
      ) : (
        <img src={originalMedia.url} alt="" style={S.mediaPreview} />
      )}
    </div>
  )}

  <div style={S.canvasFrame}>
    <span style={S.canvasLabel}>
      {operations.length > 0 ? `EDITED (v${operations.length})` : 'CURRENT'}
    </span>
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {originalMedia.type === 'video' ? (
        <video src={currentMedia} controls style={S.mediaPreview} ref={mediaImgRef} />
      ) : (
        <img src={currentMedia} alt="" style={S.mediaPreview} ref={mediaImgRef} />
      )}

      {maskMode && (
        <canvas
          ref={maskCanvasRef}
          style={S.maskCanvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      )}
    </div>
  </div>
</div>
            </div>
          )}

          {/* ── PROGRESS BAR ── */}
          {progress && progress.status !== 'completed' && progress.status !== 'error' && (
            <div style={S.progressBar}>
              <div style={{ ...S.progressFill, width: `${progress.percent || 0}%` }} />
              <span style={S.progressText}>{progress.message || 'Processing...'}</span>
            </div>
          )}

          {/* ── NODE STATUS PILLS ── */}
          {nodeUpdates.length > 0 && isProcessing && (
            <div style={S.nodePills}>
              {nodeUpdates.map((n, i) => (
                <span key={i} style={{
                  ...S.pill,
                  background: n.status === 'completed' ? C.success
                    : n.status === 'error' ? C.error : C.accent,
                }}>
                  {n.name} {n.status === 'completed' ? '✓' : n.status === 'error' ? '✗' : '…'}
                </span>
              ))}
            </div>
          )}

          {/* ── Error ── */}
          {lastError && (
            <div style={S.errorBox}>
              {lastError}
              <button style={S.dismissBtn} onClick={() => setLastError(null)}>✕</button>
            </div>
          )}

          {/* ── Success ── */}
          {progress?.status === 'completed' && !lastError && (
            <div style={S.successBox}>
              ✅ Edit applied successfully!
              {progress.score && ` Quality: ${Math.round(progress.score * 100)}%`}
            </div>
          )}
        </div>

        {/* ── RIGHT: INSTRUCTION PANEL ── */}
        <div style={S.rightPanel}>
          <div style={S.panelHeader}>INSTRUCTION</div>

          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={
              elements.length > 0
                ? 'e.g. "Replace the Coca-Cola with Element 1, keep the water droplets and lighting"'
                : 'e.g. "Change the sky to sunset", "Remove the person on the left", "Make it warmer"'
            }
            style={S.instructionInput}
            disabled={isProcessing || !session}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleExecuteEdit(); }
            }}
          />

          <div style={S.instructionHints}>
            <span style={S.hint}>Shift+Enter for new line</span>
            {maskData && <span style={{ ...S.hint, color: C.success }}>🎭 Mask applied</span>}
            {elements.length > 0 && (
              <span style={{ ...S.hint, color: C.accent2 }}>
                {elements.length} element{elements.length > 1 ? 's' : ''} loaded
              </span>
            )}
          </div>

          {/* ── FORMATO DE SALIDA ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 9, color: C.muted, fontFamily: 'monospace', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
              FORMATO
            </span>
            {['16:9', '9:16', '1:1', '4:3', '3:4'].map(ratio => (
              <button
                key={ratio}
                onClick={() => setAspectRatio(ratio)}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: 4, cursor: 'pointer',
                  fontSize: 8, fontWeight: 700, fontFamily: 'monospace',
                  background: aspectRatio === ratio ? C.accent : C.card,
                  color:      aspectRatio === ratio ? '#000'   : C.muted,
                  border:     `1px solid ${aspectRatio === ratio ? C.accent : C.border}`,
                  transition: 'all 0.12s',
                }}
              >
                {ratio}
              </button>
            ))}
          </div>

          {/* ── MEJORAR PROMPT CON IA ── */}
          {session && currentMedia && instruction.trim() && (
            <button
              onClick={handleEnhanceInstruction}
              disabled={isEnhancing || isProcessing}
              style={{
                width: '100%', padding: '7px 0', marginBottom: 8, borderRadius: 4, cursor: 'pointer',
                fontSize: 9, fontWeight: 600, fontFamily: 'inherit', letterSpacing: '0.08em',
                background: (isEnhancing) ? C.card : 'rgba(124,58,237,0.1)',
                color: (isEnhancing) ? C.dim : C.accent2,
                border: `1px solid ${(isEnhancing) ? C.border : C.accent2}`,
                transition: 'all 0.15s',
              }}
            >
              {isEnhancing ? '🔄 MEJORANDO...' : '✨ MEJORAR PROMPT CON IA'}
            </button>
          )}

          {/* ── MODO FIEL / CREATIVO ── */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button
              onClick={() => setEditMode('faithful')}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 4, cursor: 'pointer',
                fontSize: 9, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.08em',
                background: editMode === 'faithful' ? '#00D084' : '#1A1A1A',
                color: editMode === 'faithful' ? '#000' : '#888',
                border: `1px solid ${editMode === 'faithful' ? '#00D084' : '#404040'}`,
                transition: 'all 0.15s',
              }}
            >
              FIEL — no modifica originales
            </button>
            <button
              onClick={() => setEditMode('creative')}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 4, cursor: 'pointer',
                fontSize: 9, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.08em',
                background: editMode === 'creative' ? '#7C3AED' : '#1A1A1A',
                color: editMode === 'creative' ? '#FFF' : '#888',
                border: `1px solid ${editMode === 'creative' ? '#7C3AED' : '#404040'}`,
                transition: 'all 0.15s',
              }}
            >
              CREATIVO — libertad de IA
            </button>
          </div>

          <button
            style={{
              ...S.executeBtn,
              opacity: (!instruction.trim() || !session || isProcessing) ? 0.4 : 1,
              cursor: (!instruction.trim() || !session || isProcessing) ? 'not-allowed' : 'pointer',
            }}
            onClick={handleExecuteEdit}
            disabled={!instruction.trim() || !session || isProcessing}
          >
            {isProcessing ? '⏳ PROCESSING...' : '⚡ EXECUTE EDIT'}
          </button>

          {/* ── Quick actions ── */}
          {session && (
            <>
              <div style={{ ...S.panelHeader, marginTop: 20 }}>QUICK ACTIONS</div>
              <div style={S.quickActions}>
                {[
                  ['Remove background', '🌅'],
                  ['Make it warmer', '☀️'],
                  ['Make it cooler', '❄️'],
                  ['Increase contrast', '◐'],
                  ['Remove text/logos', '🗑️'],
                  ['Blur background', '🔵'],
                ].map(([label, icon]) => (
                  <button key={label} style={S.quickBtn}
                    onClick={() => setInstruction(label)}
                    disabled={isProcessing}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── 👗 FASHION ASSIST ── */}
          <FashionAssistPanel
            session={session}
            currentMedia={currentMedia}
            elements={elements}
            fashionAssistInput={fashionAssistInput}
            isEnhancing={isEnhancing}
            isProcessing={isProcessing}
            onUpdateField={updateFashionField}
            onUpdateConstraint={updateFashionConstraint}
            onDress={handleFashionDress}
          />

          {/* ── DAG Pipeline Info ── */}
          {nodeUpdates.length > 0 && (
            <>
              <div style={{ ...S.panelHeader, marginTop: 20 }}>PIPELINE</div>
              <div style={S.pipelineList}>
                {nodeUpdates.map((n, i) => (
                  <div key={i} style={S.pipelineItem}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: n.status === 'completed' ? C.success
                        : n.status === 'error' ? C.error : C.accent,
                    }} />
                    <span style={{ fontSize: 10, color: C.text, flex: 1 }}>{n.name}</span>
                    {n.cost > 0 && (
                      <span style={{ fontSize: 9, color: C.dim }}>${n.cost.toFixed(4)}</span>
                    )}
                    {n.time && (
                      <span style={{ fontSize: 9, color: C.dim }}>{n.time}ms</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════

const S = {
  root: {
    minHeight: '100vh', background: C.bg, color: C.text,
    fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
    display: 'flex', flexDirection: 'column',
  },

  // ── Top bar ──
  topBar: {
    height: 48, background: C.panel, borderBottom: `1px solid ${C.border}`,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 16px', flexShrink: 0,
  },
  topLeft:   { display: 'flex', alignItems: 'center', gap: 12 },
  topCenter: { display: 'flex', alignItems: 'center', gap: 8 },
  topRight:  { display: 'flex', alignItems: 'center', gap: 10 },
  backLink:  { fontSize: 10, color: C.muted, textDecoration: 'none', letterSpacing: '0.05em' },
  logo:      { fontSize: 14, fontWeight: 700, color: C.accent, letterSpacing: '0.15em' },
  logoSub:   { fontSize: 10, color: C.accent2, letterSpacing: '0.2em', fontWeight: 500 },
  sessionName: { fontSize: 11, color: C.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  badge:     { fontSize: 9, background: C.card, padding: '2px 8px', borderRadius: 3, color: C.muted, letterSpacing: '0.1em' },
  costBadge: { fontSize: 10, color: C.warning, background: 'rgba(255,184,0,0.1)', padding: '2px 8px', borderRadius: 3 },
  versionBadge: { fontSize: 9, background: C.accent, color: '#000', padding: '2px 6px', borderRadius: 3, fontWeight: 600 },

  // ── Main layout ──
  main: {
    flex: 1, display: 'flex', overflow: 'hidden',
  },

  // ── Left panel ──
  leftPanel: {
    width: 220, background: C.panel, borderRight: `1px solid ${C.border}`,
    padding: 12, overflowY: 'auto', flexShrink: 0,
  },
  panelHeader: {
    fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: '0.15em',
    marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  panelHint: { fontSize: 9, color: C.dim },

  // ── Elements ──
  elementCard: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: 6, background: C.card, borderRadius: 4, marginBottom: 6,
    border: `1px solid ${C.border}`,
  },
  elementImg:  { width: 40, height: 40, objectFit: 'cover', borderRadius: 3, flexShrink: 0 },
  elementInfo: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  elementLabel:{ fontSize: 9, color: C.accent, fontWeight: 600 },
  elementName: { fontSize: 10, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  removeBtn:   { background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 12, padding: 2 },
  addElementBtn: {
    width: '100%', padding: '8px 0', background: 'transparent',
    border: `1px dashed ${C.border}`, borderRadius: 4, color: C.muted,
    cursor: 'pointer', fontSize: 10, letterSpacing: '0.05em',
  },

  // ── Mask tools ──
  toolRow:  { display: 'flex', gap: 6, marginBottom: 8 },
  toolBtn:  {
    flex: 1, padding: '6px 0', background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 4, color: C.muted, cursor: 'pointer', fontSize: 10, textAlign: 'center',
  },
  toolActive: { border: `1px solid ${C.accent}`, color: C.accent, background: 'rgba(0,168,232,0.08)' },
  brushRow:   { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  clearMaskBtn: {
    flex: 1, padding: '4px 0', background: 'rgba(255,71,87,0.1)', border: `1px solid ${C.error}`,
    borderRadius: 4, color: C.error, cursor: 'pointer', fontSize: 9,
  },

  // ── History ──
  historyList: { display: 'flex', flexDirection: 'column', gap: 6 },
  historyItem: {
    padding: 8, background: C.card, borderRadius: 4, border: `1px solid ${C.border}`,
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  historyTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  historyVersion: { fontSize: 9, fontWeight: 600, color: C.accent },
  historyScore:   { fontSize: 9, fontWeight: 600 },
  historyInstr:   { fontSize: 10, color: C.muted, lineHeight: 1.3 },
  historyActions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  rollbackBtn: {
    background: 'none', border: `1px solid ${C.border}`, borderRadius: 3,
    color: C.muted, cursor: 'pointer', fontSize: 9, padding: '2px 6px',
  },

  // ── Center panel ──
  centerPanel: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: 16, overflow: 'auto', gap: 12,
  },

  // ── Drop zone ──
  dropZone: {
    width: '100%', maxWidth: 600, padding: '60px 40px',
    border: `2px dashed ${C.border}`, borderRadius: 12,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    cursor: 'pointer', transition: 'border-color 0.2s',
  },
  dropIcon:  { fontSize: 48 },
  dropTitle: { fontSize: 14, color: C.text, fontWeight: 500 },
  dropSub:   { fontSize: 11, color: C.muted },

  // ── Canvas area ──
  canvasArea: { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  compareTabs: { display: 'flex', gap: 4 },
  compareTab: {
    padding: '4px 12px', fontSize: 9, background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 3, color: C.muted, cursor: 'pointer', letterSpacing: '0.05em',
  },
  compareActive: { border: `1px solid ${C.accent}`, color: C.accent, background: 'rgba(0,168,232,0.08)' },
  canvasGrid: (mode) => ({
    display: 'flex', gap: mode === 'side' ? 12 : 0, justifyContent: 'center', flexWrap: 'wrap',
  }),
  canvasFrame: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  },
  canvasLabel: { fontSize: 9, color: C.muted, letterSpacing: '0.1em' },
  mediaPreview: {
    maxWidth: '100%', maxHeight: 'calc(100vh - 260px)',
    borderRadius: 4, border: `1px solid ${C.border}`, objectFit: 'contain',
  },
  maskCanvas: {
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
    cursor: 'crosshair', borderRadius: 4,
  },

  // ── Progress ──
  progressBar: {
    width: '100%', maxWidth: 500, height: 24, background: C.card,
    borderRadius: 4, overflow: 'hidden', position: 'relative',
  },
  progressFill: {
    height: '100%', background: `linear-gradient(90deg, ${C.accent}, ${C.accent2})`,
    transition: 'width 0.3s ease',
  },
  progressText: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 10, color: C.text, fontWeight: 500,
  },

  // ── Node pills ──
  nodePills: { display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  pill: {
    fontSize: 9, padding: '2px 8px', borderRadius: 10, color: '#000', fontWeight: 600,
  },

  // ── Messages ──
  errorBox: {
    width: '100%', maxWidth: 500, padding: '10px 14px', background: 'rgba(255,71,87,0.1)',
    border: `1px solid ${C.error}`, borderRadius: 4, color: C.error, fontSize: 11,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  dismissBtn: { background: 'none', border: 'none', color: C.error, cursor: 'pointer', fontSize: 14 },
  successBox: {
    width: '100%', maxWidth: 500, padding: '10px 14px', background: 'rgba(0,208,132,0.1)',
    border: `1px solid ${C.success}`, borderRadius: 4, color: C.success, fontSize: 11,
  },

  // ── Right panel ──
  rightPanel: {
    width: 280, background: C.panel, borderLeft: `1px solid ${C.border}`,
    padding: 12, overflowY: 'auto', flexShrink: 0,
    display: 'flex', flexDirection: 'column',
  },
  instructionInput: {
    width: '100%', minHeight: 100, padding: 10, background: C.card,
    border: `1px solid ${C.border}`, borderRadius: 4, color: C.text,
    fontFamily: 'inherit', fontSize: 11, resize: 'vertical', lineHeight: 1.5,
    outline: 'none', boxSizing: 'border-box',
  },
  instructionHints: {
    display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, marginBottom: 10,
  },
  hint: { fontSize: 9, color: C.dim },
  executeBtn: {
    width: '100%', padding: '10px 0', background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`,
    border: 'none', borderRadius: 4, color: '#fff', fontSize: 11,
    fontWeight: 600, letterSpacing: '0.1em', cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // ── Quick actions ──
  quickActions: { display: 'flex', flexDirection: 'column', gap: 4 },
  quickBtn: {
    width: '100%', padding: '6px 10px', background: C.card,
    border: `1px solid ${C.border}`, borderRadius: 4,
    color: C.muted, cursor: 'pointer', fontSize: 10, textAlign: 'left',
    fontFamily: 'inherit',
  },

  // ── Pipeline ──
  pipelineList: { display: 'flex', flexDirection: 'column', gap: 4 },
  pipelineItem: { display: 'flex', alignItems: 'center', gap: 6 },

  selectInput: {
  width: '100%',
  marginTop: 4,
  padding: 6,
  background: C.card,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  fontFamily: 'inherit',
  fontSize: 10,
  boxSizing: 'border-box',
},

textInputSmall: {
  width: '100%',
  marginTop: 4,
  padding: 6,
  background: C.card,
  color: C.text,
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  fontFamily: 'inherit',
  fontSize: 10,
  boxSizing: 'border-box',
},

checkboxRow: {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  fontSize: 9,
  color: C.muted,
},

overlayWrap: {
  position: 'relative',
  display: 'inline-block',
},

overlayImage: {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  borderRadius: 4,
  opacity: 0.55,
  pointerEvents: 'none',
},
};