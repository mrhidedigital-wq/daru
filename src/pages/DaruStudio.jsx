// src/pages/DaruStudio.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate }  from 'react-router-dom';
import { useAuth }                 from '../contexts/AuthContext';
import { projectsDB, shotsDB, tokenUsageDB } from '../lib/supabase/database';
import { buildAndExecuteDAG }      from '../lib/dag/DAGExecutor';
import { ImageRenderNode }         from '../lib/dag/nodes/ImageRenderNode';
import ShotList                    from '../components/studio/ShotList';
import ShotEditor                  from '../components/studio/ShotEditor';
import FramePreview                from '../components/studio/FramePreview';
import FrameUploader               from '../components/studio/FrameUploader';
import StudioTopBar                from '../components/studio/StudioTopBar';
import QuickStartModal, { QUICK_PRESETS } from '../components/studio/QuickStartModal';
import { PROVIDER_COSTS, estimateCost } from '../lib/dag/nodes/VideoRenderNode';
import { validateStudioShot, validateStudioShots } from '../utils/validateShotList';
import PromptBox    from '../components/studio/PromptBox';
import NodeStatus   from '../components/studio/NodeStatus';
import LoadingScreen from '../components/studio/LoadingScreen';

// ─── Paleta ──────────────────────────────────────────────────
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

// ─── Provider formats ─────────────────────────────────────────
const PROVIDER_FORMATS = {
  veo: {
    resolutions: ['720p', '1080p', '4k'],
    aspectRatios: ['16:9', '9:16'],
    defaultResolution: '1080p',
    defaultAspectRatio: '16:9',
    resolutionWarnings: {
      '4k': 'Alta latencia y costo. Solo Veo 3.1 full.',
    },
  },
  kling: {
    resolutions: ['720p', '1080p', '4k'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    defaultResolution: '1080p',
    defaultAspectRatio: '16:9',
    resolutionWarnings: {
      '4k': 'Más créditos. Usar para output final, no drafts.',
    },
  },
  seeddance: {
    resolutions: ['480p', '720p', '1080p'],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    defaultResolution: '720p',
    defaultAspectRatio: '16:9',
    resolutionWarnings: {
      '480p': 'Solo para preview/draft. Muy bajo costo.',
    },
  },
};

const RESOLUTION_LABELS = {
  '480p':  '854×480',
  '720p':  '1280×720',
  '1080p': '1920×1080',
  '4k':    '3840×2160',
};

const RATIO_PLATFORMS = {
  '16:9':  'YouTube · Cinema · TV',
  '9:16':  'TikTok · Reels · Shorts',
  '1:1':   'Instagram · Feed',
  '4:3':   'Clásico · Retro',
  '21:9':  'Ultrawide · Cinemascope',
  '3:4':   'Portrait · Pinterest',
};

// ─── Default new shot ─────────────────────────────────────────
function newShotTemplate(index) {
  return {
    shot_number:      index + 1,
    name:             `Shot ${String(index + 1).padStart(3, '0')}`,
    duration_seconds: 4,
    frame_start: {
      shot:  'plano_medio',
      angle: 'frontal',
      lighting: { scheme: 'three_point', mood: 'natural' },
    },
    frame_end: {
      shot:  'primer_plano',
      angle: 'frontal',
    },
    transition: {
      cameraMove: 'dolly_in',
      intensity:  0.2,
      timing:     'ease-out',
    },
    status: 'pending',
  };
}


export default function DaruStudio() {
  const { projectId }   = useParams();
  const { user }        = useAuth();
  const navigate        = useNavigate();

  // State
  const [project,        setProject]        = useState(null);
  const [shots,          setShots]          = useState([]);
  const [selectedShot,   setSelectedShot]   = useState(null);
  const [editingShot,    setEditingShot]    = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [generating,     setGenerating]     = useState(false);
  const [dagProgress,    setDagProgress]    = useState(null);
  const [nodeStatuses,   setNodeStatuses]   = useState([]);
  const [error,          setError]          = useState(null);
  const [warnings,       setWarnings]       = useState([]);
  const [llmProvider,    setLlmProvider]    = useState('gemini');
  const [mediaProvider,  setMediaProvider]  = useState('kling');
  const [shotFrames,     setShotFrames]     = useState({});
  const [renderingVideo,    setRenderingVideo]    = useState(false);
  const [renderConfirmed,   setRenderConfirmed]   = useState(false);
  const [videoUrl,          setVideoUrl]          = useState(null);
  const [quickStartModal,   setQuickStartModal]   = useState(null);   // null | presetKey
  const [modalShots,        setModalShots]        = useState([]);     // shots editables del modal
  const [quickStartLoading, setQuickStartLoading] = useState(false);
  const [previewImage,      setPreviewImage]      = useState(null);       // URL de imagen preview
  const [previewLoading,    setPreviewLoading]    = useState(false);
  const [projectCost,       setProjectCost]       = useState(null);       // { totals, byProvider }
  const [dragIdx,           setDragIdx]           = useState(null);       // drag & drop index
  const [exporting,         setExporting]         = useState(false);
  const [exportUrl,         setExportUrl]         = useState(null);
  const [renderResolution,  setRenderResolution]  = useState('1080p');
  const [renderAspectRatio, setRenderAspectRatio] = useState('16:9');

  // ── Abrir modal Quick Start ──────────────────────────────────
  const abrirModalPreset = (presetKey) => {
    const preset = QUICK_PRESETS[presetKey];
    if (!preset) return;
    // Clonar shots para que sean editables en el modal
    setModalShots(preset.shots.map(s => ({ ...s })));
    setQuickStartModal(presetKey);
  };

  const cerrarModal = () => {
    setQuickStartModal(null);
    setModalShots([]);
  };

  const cambiarDuracionModal = (idx, nuevaDuracion) => {
    setModalShots(prev => prev.map((s, i) =>
      i === idx ? { ...s, duration_seconds: Number(nuevaDuracion) } : s
    ));
  };

  // ── Load project ────────────────────────────────────────────
  useEffect(() => {
    if (!projectId) { setLoading(false); return; }
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadProject = async () => {
    try {
      setLoading(true);
      const proj = await projectsDB.getById(projectId);
      setProject(proj);
      setShots(proj.shots || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Shot CRUD ───────────────────────────────────────────────
  const handleAddShot = async () => {
const maxShotNumber = shots.reduce((max, s) => Math.max(max, s.shot_number || 0), 0);
const template = newShotTemplate(maxShotNumber);
    if (projectId) {
      try {
        const created = await shotsDB.create(projectId, template);
        setShots(prev => [...prev, created]);
        setSelectedShot(created);
      } catch (err) {
        setError(err.message);
      }
    } else {
      const local = { ...template, id: `local_${Date.now()}` };
      setShots(prev => [...prev, local]);
      setSelectedShot(local);
    }
  };

  const handleSaveShot = async (updatedData) => {
    if (!editingShot) return;
    try {
      if (projectId && !editingShot.id?.startsWith('local_')) {
        const saved = await shotsDB.update(editingShot.id, updatedData);
        setShots(prev => prev.map(s => s.id === saved.id ? saved : s));
        if (selectedShot?.id === saved.id) setSelectedShot(saved);
      } else {
        const updated = { ...editingShot, ...updatedData };
        setShots(prev => prev.map(s => s.id === editingShot.id ? updated : s));
        if (selectedShot?.id === editingShot.id) setSelectedShot(updated);
      }
      setEditingShot(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteShot = async (shot) => {
    if (!window.confirm(`¿Eliminar "${shot.name}"? Esta acción no se puede deshacer.`)) return;
    try {
      if (!shot.id?.startsWith('local_')) {
        await shotsDB.delete(shot.id);
      }
      setShots(prev => prev.filter(s => s.id !== shot.id));
      if (selectedShot?.id === shot.id) setSelectedShot(null);
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Cost Tracker ────────────────────────────────────────────
  const loadProjectCost = useCallback(async () => {
    if (!user?.id) return;
    try {
      const totals = await tokenUsageDB.getTotalsByUser(user.id);
      const totalCost = Object.values(totals).reduce((sum, t) => sum + (t.cost_usd || 0), 0);
      setProjectCost({ totals, totalCost: totalCost.toFixed(4) });
    } catch { /* silently fail — cost display is optional */ }
  }, [user]);

  // Cargar costos al montar y después de cada generación
  useEffect(() => { loadProjectCost(); }, [loadProjectCost]);

  // Resetear resolution y aspectRatio al cambiar de proveedor
  useEffect(() => {
    const fmt = PROVIDER_FORMATS[mediaProvider];
    if (!fmt) return;
    setRenderResolution(fmt.defaultResolution);
    setRenderAspectRatio(fmt.defaultAspectRatio);
  }, [mediaProvider]);

  // ── DAG Generate ────────────────────────────────────────────
  const handleGenerateShot = useCallback(async (shot) => {
    if (!shot) return;

    // ── Validar shot antes de ejecutar DAG ──────────────────
    const validation = validateStudioShot(shot);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    if (validation.advertencias.length > 0) {
      setWarnings(validation.advertencias);
      // Advertencias no bloquean — se muestran y continúa
    } else {
      setWarnings([]);
    }

    setGenerating(true);
    setDagProgress({ done: 0, total: 0, percent: 0, currentNode: null });
    setNodeStatuses([]);
    setError(null);

    try {
      await shotsDB.updateStatus(shot.id, 'processing');
      setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: 'processing' } : s));

      // Leer modo del plano del shot actual
      const shotFrameData = shotFrames[shot.id] || {};

      const result = await buildAndExecuteDAG(shot, {
        userId:        user?.id,
        projectId,
        llmProvider,
        mediaProvider,                        // BUG 1 FIX: proveedor de video correcto
        shotMode:      shotFrameData.shotMode    || 'cinematic',
        speechRate:    shotFrameData.speechRate  || 'normal',
        cameraAngle:   shotFrameData.cameraAngle || 'frontal',
        onProgress:   (p) => setDagProgress(p),
        onNodeUpdate: (n) => setNodeStatuses(prev => {
          const idx = prev.findIndex(x => x.id === n.id || x.type === n.type);
          if (idx >= 0) { const next = [...prev]; next[idx] = n; return next; }
          return [...prev, n];
        }),
      });

      // Actualizar shot con prompts generados
      const updated = await shotsDB.update(shot.id, {
        status: 'completed',
        frame_start: { ...shot.frame_start, generatedPrompt: result.prompts.start },
        frame_end:   { ...shot.frame_end,   generatedPrompt: result.prompts.end   },
      });

      setShots(prev => prev.map(s => s.id === updated.id ? updated : s));
      if (selectedShot?.id === updated.id) setSelectedShot(updated);
      loadProjectCost(); // Refresh cost tracker

      // Mostrar advertencias de anti-alucinación del PromptBuilder
      if (result.validationWarnings?.length > 0) {
        setWarnings(prev => [
          ...prev,
          ...result.validationWarnings.map(w => {
            // Hacer los warnings legibles para el usuario
            const readable = w
              .replace('FRAMING_MISSING', '🎬 Encuadre perdido')
              .replace('COLOR_HALLUCINATION', '🎨 Color inventado')
              .replace('PROPER_NOUN_HALLUCINATION', '📛 Nombre inventado')
              .replace('EMOTION_HALLUCINATION', '😶 Emoción inventada')
              .replace('PROMPT_TOO_LONG', '📏 Prompt muy largo')
              .replace('PROMPT_TOO_SHORT', '📏 Prompt muy corto')
              .replace('LENS_MISSING', '🔍 Lente perdido')
              .replace('LIGHTING_MISSING', '💡 Iluminación perdida')
              .replace('CAMERA_MOVE_MISSING', '🎥 Movimiento perdido')
              .replace('START_END_IDENTICAL', '⚠ START = END idénticos')
              .replace('FRAMING_CHANGE_MISSING', '⚠ Cambio de encuadre no reflejado')
              .replace('IMPOSSIBLE_MOVE', '🚫 Movimiento imposible')
              .replace('CHARACTER_OUT_OF_RANGE', '👤 Personaje fuera de rango')
              .replace(/\[START\]\s*/, '(START) ')
              .replace(/\[END\]\s*/, '(END) ');
            return readable;
          }),
        ]);
      }

    } catch (err) {
      setError(err.message);
      await shotsDB.setError(shot.id, err.message).catch(() => {});
      setShots(prev => prev.map(s => s.id === shot.id ? { ...s, status: 'error' } : s));
    } finally {
      setGenerating(false);
    }
  }, [user, projectId, llmProvider, mediaProvider, selectedShot, loadProjectCost, shotFrames]);

  // ── Quick Start — confirmar y crear ────────────────────────
  const confirmarQuickStart = async () => {
    if (!projectId || modalShots.length === 0) return;
    setQuickStartLoading(true);
    setError(null);
    cerrarModal();
    try {
      // 1) Borrar shots existentes para evitar duplicate key en shot_number
      for (const shotExistente of shots) {
        if (!shotExistente.id?.startsWith('local_')) {
          try { await shotsDB.delete(shotExistente.id); } catch {}
        }
      }
      // 2) Crear los nuevos shots con los números correctos
      const created = [];
      for (let i = 0; i < modalShots.length; i++) {
        const template = { ...modalShots[i], shot_number: i + 1 };
        const shot = await shotsDB.create(projectId, template);
        created.push(shot);
      }
      setShots(created);
      setSelectedShot(created[0]);
    } catch (err) {
      setError(err.message);
    } finally {
      setQuickStartLoading(false);
    }
  };

  // ── Scene Extension ─────────────────────────────────────────
  // El último frame del Shot N se pasa automáticamente como
  // Frame START del Shot N+1 para continuidad perfecta.
  const getSceneExtendedFrames = useCallback((shot) => {
    const currentFrames = shotFrames[shot.id] || {};
    if (currentFrames.startUrl) return currentFrames; // ya tiene frame propio

    // Buscar el shot anterior
    const idx = shots.findIndex(s => s.id === shot.id);
    if (idx <= 0) return currentFrames;

    const prevShot = shots[idx - 1];
    const prevFrames = shotFrames[prevShot.id] || {};

    // Si el shot anterior tiene endUrl (imagen estática), usarla como startUrl de este shot.
    // NUNCA usar result_video_url como startUrl — Veo espera imagen, no MP4.
    if (prevFrames.endUrl) {
      return { ...currentFrames, startUrl: prevFrames.endUrl };
    }

    return currentFrames;
  }, [shots, shotFrames]);

  // ── Image Preview (ahorra ~$17.94/sesión) ───────────────────
  const handlePreviewImage = useCallback(async (shot) => {
    if (!shot) return;
    const prompt = shotFrames[shot.id]?.customPrompt?.trim();
    if (!prompt) {
      setError('Escribe un prompt en PROMPT MANUAL antes del preview.');
      return;
    }

    setPreviewLoading(true);
    setPreviewImage(null);
    setError(null);

    try {
      const node = new ImageRenderNode({
        parameters: { aspectRatio: project?.format || '16:9' },
      });
      const result = await node.renderPreview(prompt);
      setPreviewImage(result.imageUrl);
    } catch (err) {
      setError(`Preview failed: ${err.message}`);
    } finally {
      setPreviewLoading(false);
    }
  }, [project, shotFrames]);

  // ── Drag & Drop reorder ─────────────────────────────────────
  const handleDragStart = (index) => setDragIdx(index);
  const handleDragOver  = (e) => e.preventDefault();
  const handleDrop = async (targetIdx) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); return; }

    const reordered = [...shots];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    // Actualizar shot_number en state inmediatamente
    const updated = reordered.map((s, i) => ({ ...s, shot_number: i + 1 }));
    setShots(updated);
    setDragIdx(null);

    // Persistir el nuevo orden en Supabase
    for (const s of updated) {
      await shotsDB.update(s.id, { shot_number: s.shot_number }).catch(() => {});
    }
  };

  // ── Export Final (concatenar todos los videos) ───────────────
  const handleExport = async () => {
    const completedShots = shots.filter(s => s.result_video_url);
    if (completedShots.length === 0) {
      setError('No hay shots con video generado para exportar.');
      return;
    }

    setExporting(true);
    setExportUrl(null);
    setError(null);

    try {
      const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:4000';
      const res = await fetch(`${serverUrl}/api/export`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectId, userId: user?.id }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Export failed: ${res.status}`);
      }

      const data = await res.json();
      setExportUrl(data.url);
    } catch (err) {
      setError(`Export error: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleGenerateAll = async () => {
    // ── Validar todos los shots pendientes antes de batch ────
    const pendingShots = shots.filter(s => s.status !== 'completed');
    if (pendingShots.length > 0) {
      const validation = validateStudioShots(pendingShots);
      if (!validation.ok) {
        setError(validation.error);
        return;
      }
      if (validation.advertencias.length > 0) {
        setWarnings(validation.advertencias);
      } else {
        setWarnings([]);
      }
    }

    for (const shot of shots) {
      if (shot.status !== 'completed') {
        await handleGenerateShot(shot);
      }
    }
  };


  // ── Frame upload callback ────────────────────────────────────
  const handleFramesChange = (frames) => {
    if (!selectedShot) return;
    setShotFrames(prev => ({
      ...prev,
      [selectedShot.id]: {
        ...(prev[selectedShot.id] || {}),
        ...frames,
      },
    }));
    setVideoUrl(null);
  };

  // ── Generate video ───────────────────────────────────────────
  // Pipeline unificado: el render corre DENTRO del DAG.
  // Ventajas vs instanciar VideoRenderNode manualmente:
  //   - La URL del video persiste en Supabase via shotsDB.setVideoResult()
  //   - El costo del render se registra junto a los costos de prompts
  //   - Si falla, shotsDB.setError() marca el shot correctamente
  //   - onProgress emite el nodo "Video Render" igual que los demás nodos
  const handleGenerateVideo = async () => {
  if (!selectedShot) return;
  const frames = getSceneExtendedFrames(selectedShot);

  console.log('SERVER URL', process.env.REACT_APP_SERVER_URL);
  console.log('SHOT ID', selectedShot.id);
  console.log('RAW SHOT FRAMES', shotFrames[selectedShot.id]);
  console.log('FRAMES USED FOR RENDER', frames);
  console.log('START URL', frames.startUrl);
  console.log('END URL', frames.endUrl);


    const hasCustomPrompt = !!(shotFrames[selectedShot.id]?.customPrompt?.trim());
    const hasStartUrl     = !!(shotFrames[selectedShot.id]?.startUrl);
    const hasAction       = !!(shotFrames[selectedShot.id]?.action?.trim());

    if (!hasCustomPrompt && !hasStartUrl) {
      setError('Sube un frame inicial y describe la acción para generar el video.');
      return;
    }

    // ── Gate anti-alucinación: solo aplica en modo BUILD PROMPTS ──
    // Con PROMPT MANUAL o auto-prompt no hay BUILD PROMPTS → no hay warnings que revisar.
    if (!hasCustomPrompt && warnings.length > 0 && !renderConfirmed) {
      setError(`⚠ Hay ${warnings.length} advertencia(s) de validación activas. Revísalas arriba. Haz click en GENERATE VIDEO de nuevo para continuar de todas formas.`);
      setRenderConfirmed(true); // Segundo click sí ejecuta
      return;
    }
    setRenderConfirmed(false);

    setRenderingVideo(true);
    setVideoUrl(null);
    setError(null);

    try {
      await shotsDB.updateStatus(selectedShot.id, 'processing');

      // Prompt: customPrompt si existe; si no, acción como prompt automático.
      const customPrompt = (shotFrames[selectedShot.id] || {}).customPrompt || '';
      const autoPrompt   = hasAction ? shotFrames[selectedShot.id].action.trim() : '';
      const promptOverride = customPrompt.trim() || autoPrompt || null;

      // Leer modo del plano desde shotFrames (viene de FrameUploader via notifyChange)
      const currentFrames   = shotFrames[selectedShot.id] || {};
      const shotMode        = currentFrames.shotMode    || 'cinematic';
      const speechRate      = currentFrames.speechRate  || 'normal';
      const cameraAngle     = currentFrames.cameraAngle || 'frontal';

      const result = await buildAndExecuteDAG(selectedShot, {
        userId:        user?.id,
        projectId,
        llmProvider,
        mediaProvider,
        aspectRatio:   project?.format || '16:9',
        frames,                          // activa el VideoRenderNode en el DAG
        customPrompt:  promptOverride,   // si existe: DAG bypassed, prompt directo
        shotMode,                        // 'cinematic' | 'talking_head'
        speechRate,                      // 'veloz' | 'rapido' | 'normal' | 'lento' | 'con_pausas'
        cameraAngle,                     // 'frontal' | 'apoyo'
        onProgress:    (p) => setDagProgress(p),
        onNodeUpdate:  (n) => setNodeStatuses(prev => {
          const idx = prev.findIndex(x => x.id === n.id || x.type === n.type);
          if (idx >= 0) { const next = [...prev]; next[idx] = n; return next; }
          return [...prev, n];
        }),
      });

      if (!result.videoUrl) throw new Error('El render no devolvió una URL de video');

      // Persistir URL en Supabase
      const updated = await shotsDB.setVideoResult(
        selectedShot.id,
        result.videoUrl,
        result.videoUrl   // preview = mismo video hasta que haya thumbnail
      );

      setVideoUrl(result.videoUrl);
      setShots(prev => prev.map(s =>
        s.id === selectedShot.id ? { ...s, ...updated } : s
      ));
      if (selectedShot?.id === updated.id) setSelectedShot(updated);
      loadProjectCost(); // Refresh cost tracker

    } catch (err) {
      setError(err.message);
      await shotsDB.setError(selectedShot.id, err.message).catch(() => {});
      setShots(prev => prev.map(s =>
        s.id === selectedShot.id ? { ...s, status: 'error' } : s
      ));
    } finally {
      setRenderingVideo(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────
  if (loading) return <LoadingScreen />;

  return (
    <div style={styles.root}>

      {/* ── TOP BAR ──────────────────────────────────────────── */}
      <StudioTopBar
        project={project}
        dagProgress={dagProgress}
        generating={generating}
        llmProvider={llmProvider}
        onLlmProviderChange={setLlmProvider}
        shots={shots}
        quickStartLoading={quickStartLoading}
        projectCost={projectCost}
        exporting={exporting}
        onNavigateBack={() => navigate('/')}
        onGenerateAll={handleGenerateAll}
        onExport={handleExport}
        onOpenPreset={abrirModalPreset}
      />

      {/* ── MAIN LAYOUT ──────────────────────────────────────── */}
      <div style={styles.main}>

        {/* LEFT — Shot List */}
        <div style={styles.leftPanel}>
          <ShotList
            shots={shots}
            selectedShotId={selectedShot?.id}
            onSelectShot={setSelectedShot}
            onEditShot={setEditingShot}
            onDeleteShot={handleDeleteShot}
            onGenerateShot={handleGenerateShot}
            onAddShot={handleAddShot}
            isGeneratingAll={generating}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        </div>

        {/* RIGHT — Preview + DAG Status */}
        <div style={styles.rightPanel}>

          {/* Preview header */}
          <div style={styles.previewHeader}>
            <span style={styles.previewTitle}>
              {selectedShot ? selectedShot.name : 'SELECT A SHOT'}
            </span>
            {selectedShot && (
              <button
                style={styles.btnEdit}
                onClick={() => setEditingShot(selectedShot)}
              >
                EDIT
              </button>
            )}
          </div>

          {selectedShot ? (
            <>
              {/* Frame previews */}
              <div style={styles.previewFrames}>
                <FramePreview
                  label="FRAME START"
                  status={selectedShot.status}
                  shotParams={{
                    shotSize:   selectedShot.frame_start?.shot,
                    angle:      selectedShot.frame_start?.angle,
                  }}
                />
                <div style={styles.previewArrow}>→</div>
                <FramePreview
                  label="FRAME END"
                  status={selectedShot.status}
                  shotParams={{
                    shotSize:   selectedShot.frame_end?.shot,
                    angle:      selectedShot.frame_end?.angle,
                    cameraMove: selectedShot.transition?.cameraMove,
                  }}
                />
              </div>

              {/* Generated prompts */}
              {(selectedShot.frame_start?.generatedPrompt || selectedShot.frame_end?.generatedPrompt) && (
                <div style={styles.promptsSection}>
                  <div style={styles.sectionLabel}>GENERATED PROMPTS</div>
                  {selectedShot.frame_start?.generatedPrompt && (
                    <PromptBox label="START" text={selectedShot.frame_start.generatedPrompt} />
                  )}
                  {selectedShot.frame_end?.generatedPrompt && (
                    <PromptBox label="END" text={selectedShot.frame_end.generatedPrompt} />
                  )}
                </div>
              )}

              {/* DAG Node status */}
              {nodeStatuses.length > 0 && (
                <div style={styles.dagSection}>
                  <div style={styles.sectionLabel}>DAG NODES</div>
                  <div style={styles.nodeGrid}>
                    {nodeStatuses.map((node, i) => (
                      <NodeStatus key={node.id || i} node={node} />
                    ))}
                  </div>
                </div>
              )}

              {/* ── FRAME UPLOADER ───────────────────────────── */}
              <FrameUploader
                shot={selectedShot}
                userId={user?.id}
                projectId={projectId}
                mediaProvider={mediaProvider}
                onFramesChange={handleFramesChange}
              />

              {/* ── VIDEO PLAYER ─────────────────────────────────── */}
              {(videoUrl || selectedShot?.result_video_url) && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#888', letterSpacing: '0.12em', fontFamily: 'monospace', marginBottom: 6 }}>
                    VIDEO OUTPUT
                  </div>
                  <video
                    controls
                    autoPlay
                    loop
                    src={videoUrl || selectedShot.result_video_url}
                    style={{ width: '100%', borderRadius: 4, background: '#111', border: '1px solid #404040', maxHeight: 180, aspectRatio: renderAspectRatio.replace(':', ' / '), objectFit: 'contain' }}
                  />
                </div>
              )}

              {/* ── IMAGE PREVIEW ──────────────────────────────────── */}
              {(previewImage || previewLoading) && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#888', letterSpacing: '0.12em', fontFamily: 'monospace' }}>
                      IMAGE PREVIEW · ~$0.03
                    </span>
                    <button
                      onClick={() => setPreviewImage(null)}
                      style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
                    >✕</button>
                  </div>
                  {previewLoading ? (
                    <div style={{ height: 120, background: '#1A1A1A', border: '1px dashed #404040', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ color: C.accent, fontSize: 11, fontFamily: 'monospace' }}>⟳ Generating preview...</span>
                    </div>
                  ) : (
                    <img
                      src={previewImage}
                      alt="Preview"
                      style={{ width: '100%', borderRadius: 4, border: '1px solid #404040', maxHeight: 200, objectFit: 'contain', background: '#111', aspectRatio: renderAspectRatio.replace(':', ' / ') }}
                    />
                  )}
                </div>
              )}

              {/* ── SCENE EXTENSION INDICATOR ──────────────────────── */}
              {selectedShot && shots.findIndex(s => s.id === selectedShot.id) > 0 && !shotFrames[selectedShot.id]?.startUrl && (
                <div style={{ fontSize: 9, color: C.accent, fontFamily: 'monospace', background: 'rgba(0,168,232,0.08)', border: `1px solid rgba(0,168,232,0.2)`, borderRadius: 4, padding: '6px 10px' }}>
                  ↪ SCENE EXTENSION: el último frame del shot anterior se usará automáticamente como frame de inicio
                </div>
              )}

              {/* ── RESOLUTION SELECTOR ──────────────────────────── */}
              {(() => {
                const fmt = PROVIDER_FORMATS[mediaProvider];
                const resWarn = fmt.resolutionWarnings?.[renderResolution];
                const veoRatioWarn = mediaProvider === 'veo' && renderAspectRatio === '9:16' && (renderResolution === '1080p' || renderResolution === '4k');
                const activeWarn = veoRatioWarn
                  ? `9:16 solo soporta hasta 720p en Veo.`
                  : resWarn || null;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ fontSize: 8, color: C.muted, fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Resolución</div>
                    <select
                      value={renderResolution}
                      onChange={e => setRenderResolution(e.target.value)}
                      style={{ background: '#2A2A2A', border: '1px solid #404040', borderRadius: 4, color: '#DDDDDD', padding: '6px 10px', fontSize: 10, fontFamily: 'monospace', outline: 'none' }}
                    >
                      {fmt.resolutions.map(r => (
                        <option key={r} value={r}>{r} — {RESOLUTION_LABELS[r]}</option>
                      ))}
                    </select>
                    {activeWarn && (
                      <div style={{ fontSize: 8, color: C.warning, fontFamily: 'monospace', lineHeight: 1.4 }}>⚠ {activeWarn}</div>
                    )}
                  </div>
                );
              })()}

              {/* ── ASPECT RATIO SELECTOR ────────────────────────── */}
              {(() => {
                const fmt = PROVIDER_FORMATS[mediaProvider];
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ fontSize: 8, color: C.muted, fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Aspect Ratio</div>
                    <select
                      value={renderAspectRatio}
                      onChange={e => setRenderAspectRatio(e.target.value)}
                      style={{ background: '#2A2A2A', border: '1px solid #404040', borderRadius: 4, color: '#DDDDDD', padding: '6px 10px', fontSize: 10, fontFamily: 'monospace', outline: 'none' }}
                    >
                      {fmt.aspectRatios.map(r => (
                        <option key={r} value={r}>{r}{RATIO_PLATFORMS[r] ? ` — ${RATIO_PLATFORMS[r]}` : ''}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              {/* ── ASPECT RATIO PREVIEW BOX ─────────────────────── */}
              {(() => {
                const [w, h] = renderAspectRatio.split(':').map(Number);
                const cssRatio = `${w} / ${h}`;
                const resPx = RESOLUTION_LABELS[renderResolution] || '';
                const platform = RATIO_PLATFORMS[renderAspectRatio] || '';
                const isPortrait = h > w;
                return (
                  <div style={{ display: 'flex', justifyContent: isPortrait ? 'center' : 'stretch' }}>
                    <div style={{
                      width: isPortrait ? 60 : '100%',
                      aspectRatio: cssRatio,
                      background: '#1A1A1A',
                      border: '1px solid #404040',
                      borderRadius: 4,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      padding: '8px 4px',
                    }}>
                      <span style={{ fontSize: isPortrait ? 8 : 14, fontWeight: 700, color: C.accent, fontFamily: 'monospace', letterSpacing: '0.05em' }}>{renderAspectRatio}</span>
                      <span style={{ fontSize: isPortrait ? 6 : 9, color: C.muted, fontFamily: 'monospace' }}>{resPx}</span>
                      {platform && (
                        <span style={{ fontSize: isPortrait ? 5 : 8, color: C.dim, fontFamily: 'monospace', textAlign: 'center', lineHeight: 1.3 }}>{platform}</span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ── MEDIA PROVIDER SELECTOR + COSTO ─────────────── */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={mediaProvider}
                  onChange={e => setMediaProvider(e.target.value)}
                  style={{ flex: 1, background: '#2A2A2A', border: '1px solid #404040', borderRadius: 4, color: '#DDDDDD', padding: '6px 10px', fontSize: 10, fontFamily: 'monospace', outline: 'none' }}
                >
                  <option value="veo">Veo 3.1 — ${estimateCost('veo', selectedShot?.duration_seconds || 5)}</option>
                  <option value="kling">Kling 3.0 — ${estimateCost('kling', selectedShot?.duration_seconds || 5)}</option>
                  <option value="seeddance">SeedDance 2.0 — ${estimateCost('seeddance', selectedShot?.duration_seconds || 5)}</option>
                </select>
                <div style={{ fontSize: 8, color: '#555', fontFamily: 'monospace', lineHeight: 1.3, maxWidth: 100 }}>
                  {PROVIDER_COSTS[mediaProvider]?.note}
                </div>
              </div>

              {/* ── ACTION BUTTONS ───────────────────────────────── */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ padding: '10px', background: '#333', border: '1px solid #FFB800', borderRadius: 4, color: '#FFB800', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', cursor: previewLoading || !shotFrames[selectedShot?.id]?.customPrompt?.trim() ? 'not-allowed' : 'pointer', fontFamily: 'monospace', opacity: previewLoading || !shotFrames[selectedShot?.id]?.customPrompt?.trim() ? 0.5 : 1 }}
                  disabled={previewLoading || !shotFrames[selectedShot?.id]?.customPrompt?.trim()}
                  onClick={() => handlePreviewImage(selectedShot)}
                  title="Genera imagen preview (~$0.03) antes de gastar en video"
                >
                  {previewLoading ? '⟳' : '🖼 PREVIEW'}
                </button>
                <button
                  style={{ flex: 1, padding: '10px', background: renderingVideo ? '#333' : '#00A8E8', border: 'none', borderRadius: 4, color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', cursor: (renderingVideo || (!shotFrames[selectedShot?.id]?.startUrl && !shotFrames[selectedShot?.id]?.customPrompt?.trim())) ? 'not-allowed' : 'pointer', fontFamily: 'monospace', opacity: (renderingVideo || (!shotFrames[selectedShot?.id]?.startUrl && !shotFrames[selectedShot?.id]?.customPrompt?.trim())) ? 0.5 : 1 }}
                  disabled={renderingVideo || (!shotFrames[selectedShot?.id]?.startUrl && !shotFrames[selectedShot?.id]?.customPrompt?.trim())}
                  onClick={handleGenerateVideo}
                >
                  {renderingVideo ? '⟳ RENDERING...' : '▶ GENERATE VIDEO'}
                </button>
              </div>
            </>
          ) : (
            <div style={styles.noSelection}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <p style={{ color: '#444', fontSize: 12, margin: 0 }}>Select a shot to preview</p>
            </div>
          )}
        </div>
      </div>

      {/* ── ERROR BAR ─────────────────────────────────────────── */}
      {error && (
        <div style={styles.errorBar}>
          <span>⚠ {error}</span>
          <button style={styles.errorClose} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* ── WARNINGS BAR ──────────────────────────────────────── */}
      {warnings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, background: 'rgba(255,184,0,0.10)', borderTop: '1px solid rgba(255,184,0,0.3)', padding: '6px 16px', fontSize: 11, fontFamily: 'monospace', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#FFB800', fontWeight: 700, fontSize: 10, letterSpacing: '0.05em' }}>⚠ ADVERTENCIAS DE VALIDACIÓN</span>
            <button onClick={() => setWarnings([])} style={{ background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
          {warnings.map((w, i) => (
            <span key={i} style={{ color: '#CCB060', fontSize: 10 }}>• {w}</span>
          ))}
        </div>
      )}

      {/* ── EXPORT DOWNLOAD BAR ───────────────────────────────── */}
      {exportUrl && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,208,132,0.12)', borderTop: '1px solid rgba(0,208,132,0.3)', padding: '8px 16px', fontSize: 11, fontFamily: 'monospace', flexShrink: 0 }}>
          <span style={{ color: '#00D084' }}>✓ Export listo</span>
          <a href={exportUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#00A8E8', fontWeight: 700, textDecoration: 'none' }}>
            ⬇ DESCARGAR MP4
          </a>
          <button onClick={() => setExportUrl(null)} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      )}

      {/* ── SHOT EDITOR MODAL ─────────────────────────────────── */}
      {editingShot && (
        <ShotEditor
          shot={editingShot}
          onSave={handleSaveShot}
          onClose={() => setEditingShot(null)}
        />
      )}

      {/* ── MODAL QUICK START ─────────────────────────────────── */}
      <QuickStartModal
        presetKey={quickStartModal}
        existingShotsCount={shots.length}
        modalShots={modalShots}
        loading={quickStartLoading}
        onClose={cerrarModal}
        onConfirm={confirmarQuickStart}
        onChangeDuration={cambiarDuracionModal}
      />
    </div>
  );
}

// PromptBox, NodeStatus, LoadingScreen — moved to src/components/studio/

// ─── Styles ───────────────────────────────────────────────────
const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: C.bg,
    color: C.text,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    overflow: 'hidden',
  },
  main: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  leftPanel: {
    width: 360,
    flexShrink: 0,
    background: C.panel,
    borderRight: `1px solid ${C.border}`,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  rightPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: 16,
    overflowY: 'auto',
    gap: 14,
  },
  previewHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottom: `1px solid ${C.border}`,
  },
  previewTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: C.muted,
    fontFamily: 'monospace',
  },
  btnEdit: {
    background: 'transparent',
    border: `1px solid ${C.accent}`,
    borderRadius: 4,
    color: C.accent,
    padding: '4px 12px',
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.1em',
    cursor: 'pointer',
    fontFamily: 'monospace',
  },
  previewFrames: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  previewArrow: {
    color: C.dim,
    fontSize: 18,
    flexShrink: 0,
  },
  promptsSection: {
    display: 'flex',
    flexDirection: 'column',
  },
  dagSection: {
    display: 'flex',
    flexDirection: 'column',
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: C.dim,
    letterSpacing: '0.12em',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  nodeGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
  },
  btnGenerate: {
    border: 'none',
    borderRadius: 5,
    color: '#fff',
    padding: '12px 24px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    cursor: 'pointer',
    fontFamily: 'monospace',
    alignSelf: 'flex-start',
    transition: 'all 0.2s',
  },
  noSelection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    opacity: 0.5,
  },
  errorBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(255,71,87,0.15)',
    borderTop: `1px solid ${C.error}`,
    padding: '8px 16px',
    fontSize: 11,
    color: C.error,
    fontFamily: 'monospace',
    flexShrink: 0,
  },
  errorClose: {
    background: 'transparent',
    border: 'none',
    color: C.error,
    cursor: 'pointer',
    fontSize: 14,
  },
  btnQuick: {
    background: '#333',
    border: '1px solid #555',
    borderRadius: 4,
    color: '#DDDDDD',
    padding: '5px 10px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    cursor: 'pointer',
    fontFamily: 'monospace',
    transition: 'border-color 0.15s',
  },
};