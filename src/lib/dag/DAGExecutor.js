// src/lib/dag/DAGExecutor.js
// Orquestador principal del DAG.
// Construye el grafo, ejecuta nodos en orden topológico,
// maneja reintentos y persiste todo en Supabase.

import { NODE_TYPES } from './CinematicNode';
import { CameraSetupNode } from './nodes/CameraSetupNode';
import { LensChoiceNode } from './nodes/LensChoiceNode';
import { ShotFramingNode } from './nodes/ShotFramingNode';
import { LightingSetupNode } from './nodes/LightingSetupNode';
import { CameraMoveNode } from './nodes/CameraMoveNode';
import { PromptBuilderNode } from './nodes/PromptBuilderNode';
import { VideoRenderNode } from './nodes/VideoRenderNode';
import { VideoValidationNode } from './nodes/VideoValidationNode';
import { supabase } from '../supabase/client';


// ============================================================
// FACTORY DE NODOS
// ============================================================

function createNode(type, config) {
  switch (type) {
    case NODE_TYPES.CAMERA_SETUP:
      return new CameraSetupNode(config);
    case NODE_TYPES.LENS_CHOICE:
      return new LensChoiceNode(config);
    case NODE_TYPES.SHOT_FRAMING:
      return new ShotFramingNode(config);
    case NODE_TYPES.LIGHTING_SETUP:
      return new LightingSetupNode(config);
    case NODE_TYPES.CAMERA_MOVE:
      return new CameraMoveNode(config);
    case NODE_TYPES.PROMPT_BUILDER:
      return new PromptBuilderNode(config);
    case NODE_TYPES.VIDEO_RENDER:
      return new VideoRenderNode(config);
    case 'VIDEO_VALIDATION':
      return new VideoValidationNode(config);
    default:
      throw new Error(`Unknown node type: ${type}`);
  }
}

// ============================================================
// HELPERS SEMÁNTICOS
// ============================================================

function normalizePoolItemName(item) {
  if (!item) return '';
  return (
    item.name ||
    item.label ||
    item.title ||
    item.description ||
    item.prompt ||
    ''
  ).trim();
}

function findById(pool = [], id) {
  return (pool || []).find((item) => item?.id === id);
}

function idsToNames(ids = [], pool = []) {
  return (ids || [])
    .map((id) => findById(pool, id))
    .filter(Boolean)
    .map(normalizePoolItemName)
    .filter(Boolean);
}

function uniqueTextParts(parts = []) {
  return [...new Set((parts || []).map(p => (p || '').trim()).filter(Boolean))];
}

function buildSelectedCharactersText(frame = {}, shot = {}) {
  const frameIds =
    frame?.semantic?.characterIds ||
    shot?.transition?.actionTargets?.characterIds ||
    [];

  const pools = [
    ...(shot?.characters || []),
    ...(shot?.project?.characters || []),
  ];

  return idsToNames(frameIds, pools).join(', ');
}

function buildSelectedElementsText(frame = {}, shot = {}) {
  const frameIds =
    frame?.semantic?.elementIds ||
    shot?.transition?.actionTargets?.elementIds ||
    [];

  const pools = [
    ...(shot?.elements || []),
    ...(shot?.project?.elements || []),
  ];

  return idsToNames(frameIds, pools).join(', ');
}

function buildCharacterDescription(frame = {}, shot = {}) {
  const legacyDescription = frame?.character?.description || '';
  const selectedCharacters = buildSelectedCharactersText(frame, shot);
  const selectedElements = buildSelectedElementsText(frame, shot);

  return uniqueTextParts([
    legacyDescription,
    selectedCharacters ? `characters: ${selectedCharacters}` : '',
    selectedElements ? `relevant elements: ${selectedElements}` : '',
  ]).join('. ');
}

function buildBackgroundDescription(frame = {}, shot = {}) {
  const legacyBackground = frame?.background?.description || '';
  const placeText = shot?.scene?.placeText || '';
  const backgroundMode = shot?.scene?.backgroundMode || 'keep_start_end';

  if (backgroundMode === 'shared_place' && placeText) {
    return placeText.trim();
  }

  if (backgroundMode === 'custom' && placeText) {
    return uniqueTextParts([legacyBackground, placeText]).join('. ');
  }

  return uniqueTextParts([legacyBackground, placeText]).join('. ');
}

function buildActionText(frame = {}, shot = {}) {
  return (
    shot?.transition?.actionText ||
    frame?.character?.pose ||
    ''
  ).trim();
}

// ============================================================
// ASSET LOADER — Lee sujetos y escenas sagradas del proyecto
// CONTRATO ANTI-ALUCINACIÓN:
// El DAG NUNCA inventa un sujeto o escena.
// Lee SIEMPRE desde subject_assets y scene_assets.
// ============================================================

export async function loadProjectAssets(projectId) {
  const [{ data: subjects }, { data: scenes }] = await Promise.all([
    supabase.from('subject_assets').select('*').eq('project_id', projectId),
    supabase.from('scene_assets').select('*').eq('project_id', projectId),
  ]);
  return { subjects: subjects || [], scenes: scenes || [] };
}

function buildSubjectDescription(subject) {
  if (!subject) return '';
  const lines = [subject.description || subject.name];
  if (subject.view_front_url)         lines.push('FRONT_REF: '         + subject.view_front_url);
  if (subject.view_three_quarter_url) lines.push('THREE_QUARTER_REF: ' + subject.view_three_quarter_url);
  if (subject.view_side_url)          lines.push('SIDE_REF: '          + subject.view_side_url);
  if (subject.view_front_url || subject.view_three_quarter_url || subject.view_side_url) {
    lines.push('[SACRED VISUAL REFERENCES — USE EXACTLY AS SHOWN. DO NOT DEVIATE.]');
  }
  return lines.join('\n');
}

function buildSceneDescription(scene) {
  if (!scene) return '';
  const lines = [scene.description || scene.name];
  if (scene.image_url) {
    lines.push('BG_REF: ' + scene.image_url);
    lines.push('[SACRED BACKGROUND REFERENCE — DO NOT CHANGE THE ENVIRONMENT.]');
  }
  return lines.join('\n');
}

// ============================================================
// DAG EXECUTOR
// ============================================================

export class DAGExecutor {
  constructor(options = {}) {
    this.nodes = new Map();
    this.onProgress = options.onProgress || null;
    this.onNodeUpdate = options.onNodeUpdate || null;
    this.context = options.context || {};
    // context: { userId, projectId, shotId, llmProviderName, mediaProvider,
    //            shotMode, speechRate, cameraAngle }
  }

  // ============================================================
  // CONSTRUCCIÓN DEL GRAFO desde un shot
  // ============================================================

  buildFromShot(shot, mediaProvider = 'veo') {
    this.nodes.clear();

    const shotId = shot.id;
    const fs = shot.frame_start || {};
    const fe = shot.frame_end || {};
    const tr = shot.transition || {};

    const provider =
      mediaProvider ||
      shot.media_provider?.name ||
      shot.mediaProvider ||
      'veo';

    // ── Nodos compartidos ─────────────────────────────────────

    const cameraNode = this._addNode(NODE_TYPES.CAMERA_SETUP, {
      shotId,
      parameters: {
        camera: fs.camera?.body || 'ARRI Alexa 35',
        sensor: fs.camera?.sensor || 'Super 35',
      },
    });

    const lensNode = this._addNode(NODE_TYPES.LENS_CHOICE, {
      shotId,
      parameters: {
        lensFamily: fs.lens?.family || 'Cooke S4/i',
        focalLength: fs.lens?.focal || 50,
        aperture: fs.lens?.aperture || 'T2.8',
      },
    });

    const lightingNode = this._addNode(NODE_TYPES.LIGHTING_SETUP, {
      shotId,
      parameters: {
        scheme: fs.lighting?.scheme || 'three_point',
        keyDirection: fs.lighting?.keyDirection || '45° front left',
        fillRatio: fs.lighting?.fillRatio || '2:1',
        mood: fs.lighting?.mood || 'natural',
        intensity: fs.lighting?.key || 0.8,
      },
    });

    const cameraMoveNode = this._addNode(NODE_TYPES.CAMERA_MOVE, {
      shotId,
      parameters: {
        moveType: tr.cameraMove || 'static',
        intensity: tr.intensity || 0.2,
        duration: shot.duration_seconds || 4,
        easing: tr.timing || 'ease-out',
      },
    });

    // ── Framing START ─────────────────────────────────────────

    const framingStartNode = this._addNode(NODE_TYPES.SHOT_FRAMING, {
      shotId,
      name: 'Shot Framing START',
      parameters: {
        shotSize: fs.camera?.shotSize || fs.shot || 'plano_medio',
        angle: fs.camera?.angle || fs.angle || 'frontal',
        degrees: fs.camera?.degrees || 0,
      },
    });

    // ── Framing END ───────────────────────────────────────────

    const framingEndNode = this._addNode(NODE_TYPES.SHOT_FRAMING, {
      shotId,
      name: 'Shot Framing END',
      parameters: {
        shotSize: fe.camera?.shotSize || fe.shot || 'primer_plano',
        angle: fe.camera?.angle || fe.angle || 'frontal',
        degrees: fe.camera?.degrees || 0,
      },
    });

    // ── Prompt START ──────────────────────────────────────────

    const promptStartNode = this._addNode(NODE_TYPES.PROMPT_BUILDER, {
      shotId,
      name: 'Prompt Builder START',
      parameters: {
        characterDescription:  buildCharacterDescription(fs, shot),
        backgroundDescription: buildBackgroundDescription(fs, shot),
        action:                buildActionText(fs, shot),
        frameType:             'start',
        optimizeWithLLM:       true,
        targetProvider:        provider,
        backgroundMode:        shot?.scene?.backgroundMode || 'keep_start_end',
        // ── Performance del personaje — vienen de options via context ──
        shotMode:        this.context.shotMode    || 'cinematic',
        speechRate:      this.context.speechRate  || 'normal',
        handMovement:    this.context.cameraAngle === 'frontal' ? 'restrained' : 'off',
        blinkingEnabled: this.context.shotMode === 'talking_head',
        cameraAngle:     this.context.cameraAngle || 'frontal',
      },
    });

    this._connect(
      [cameraNode, lensNode, framingStartNode, framingEndNode, lightingNode, cameraMoveNode],
      promptStartNode
    );

    // ── Prompt END ────────────────────────────────────────────

    const promptEndNode = this._addNode(NODE_TYPES.PROMPT_BUILDER, {
      shotId,
      name: 'Prompt Builder END',
      parameters: {
        characterDescription:  buildCharacterDescription(fe, shot),
        backgroundDescription: buildBackgroundDescription(fe, shot),
        action:                buildActionText(fe, shot),
        frameType:             'end',
        optimizeWithLLM:       true,
        targetProvider:        provider,
        backgroundMode:        shot?.scene?.backgroundMode || 'keep_start_end',
        // ── Performance del personaje — igual que START ──
        shotMode:        this.context.shotMode    || 'cinematic',
        speechRate:      this.context.speechRate  || 'normal',
        handMovement:    this.context.cameraAngle === 'frontal' ? 'restrained' : 'off',
        blinkingEnabled: this.context.shotMode === 'talking_head',
        cameraAngle:     this.context.cameraAngle || 'frontal',
      },
    });

    this._connect(
      [cameraNode, lensNode, framingEndNode, lightingNode, cameraMoveNode, promptStartNode],
      promptEndNode
    );

    // ── Video Render (opcional) ──────────────────────────────

    if (this._renderConfig) {
      const videoNode = this._addNode(NODE_TYPES.VIDEO_RENDER, {
        shotId,
        name: 'Video Render',
        parameters: {
          mediaProvider:   this._renderConfig.mediaProvider || 'veo',
          startUrl:        this._renderConfig.startUrl || null,
          endUrl:          this._renderConfig.endUrl || null,
          turnaround:      this._renderConfig.turnaround || {},
          motionRef:       this._renderConfig.motionRef || null,
          action:          this._renderConfig.action || shot?.transition?.actionText || '',
          frameMode:       this._renderConfig.frameMode || 'exact',
          characters:      this._renderConfig.characters || [],
          aspectRatio:     this._renderConfig.aspectRatio || '16:9',
          durationSeconds: this._renderConfig.durationSeconds || 8,
        },
      });

      this._connect([promptStartNode, promptEndNode], videoNode);

      const validationNode = this._addNode('VIDEO_VALIDATION', {
        shotId,
        name: 'Video Validation',
        parameters: {
          startUrl:  this._renderConfig.startUrl || null,
          endUrl:    this._renderConfig.endUrl || null,
          frameMode: this._renderConfig.frameMode || 'exact',
        },
      });

      this._connect([videoNode], validationNode);
    }

    return this;
  }

  // ============================================================
  // EJECUCIÓN
  // ============================================================

  async execute() {
    const ordered = this._topologicalSort();
    const total = ordered.length;
    let done = 0;

    this._emitProgress(0, total, null);

    for (const node of ordered) {
      const todosInputsFallaron =
        node.inputs.length > 0 &&
        node.inputs.every((n) => n.status === 'error');

      if (todosInputsFallaron) {
        node.status = 'error';
        node.errorMsg = 'Todos los nodos previos fallaron';
        this._emitNodeUpdate(node);
        continue;
      }

      try {
        if (!node.id && this.context.shotId) {
          node.shotId = this.context.shotId;
          await node.saveToDb().catch(() => {});
        }

        await node.execute(this.context);
        done++;

        this._emitNodeUpdate(node);
        this._emitProgress(done, total, node);
      } catch (error) {
        this._emitNodeUpdate(node);
        console.error(`[DAG] Nodo "${node.name || node.type}" falló:`, error.message);
      }
    }

    return this._collectResults();
  }

  async retry() {
    for (const node of this.nodes.values()) {
      if (node.status === 'error' || node.status === 'pending') {
        node.status = 'pending';
        node.result = null;
        node.errorMsg = null;
      }
    }
    return this.execute();
  }

  async retryFrom(nodeType) {
    const targetNodes = this._getNodesByType(nodeType);
    for (const node of targetNodes) {
      this._resetNodeAndDependents(node);
    }
    return this.execute();
  }

  // ============================================================
  // RESULTADOS
  // ============================================================

  _collectResults() {
    const results = {};

    for (const node of this.nodes.values()) {
      results[node.name || node.type] = {
        status: node.status,
        result: node.result,
        error:  node.errorMsg,
        metrics: {
          timeMs:  node.executionTimeMs,
          tokens:  node.tokensUsed,
          costUsd: node.costUsd,
        },
      };
    }

    const promptStart      = this._getNodeResult('Prompt Builder START');
    const promptEnd        = this._getNodeResult('Prompt Builder END');
    const videoResult      = this._getNodeResult('Video Render');
    const validationResult = this._getNodeResult('Video Validation');

    const validationWarnings = [];
    const promptStartResult  = this._getNodeResult('Prompt Builder START');
    const promptEndResult    = this._getNodeResult('Prompt Builder END');

    if (promptStartResult?.validationWarnings?.length) {
      validationWarnings.push(...promptStartResult.validationWarnings.map(w => `[START] ${w}`));
    }
    if (promptEndResult?.validationWarnings?.length) {
      validationWarnings.push(...promptEndResult.validationWarnings.map(w => `[END] ${w}`));
    }
    if (validationResult?.warnings?.length) {
      validationWarnings.push(...validationResult.warnings);
    }

    return {
      nodes: results,
      prompts: {
        start: promptStart?.promptOptimized || promptStart?.prompt || '',
        end:   promptEnd?.promptOptimized   || promptEnd?.prompt   || '',
      },
      videoUrl:           videoResult?.videoUrl || null,
      videoValidation:    validationResult || null,
      validationWarnings,
      totalCost:          this._totalCost(),
      totalTokens:        this._totalTokens(),
      success:            this._allCompleted(),
    };
  }

  getPrompts() {
    return {
      start: this._getNodeResult('Prompt Builder START')?.promptOptimized || '',
      end:   this._getNodeResult('Prompt Builder END')?.promptOptimized   || '',
    };
  }

  getNodeStatus() {
    return Array.from(this.nodes.values()).map(n => n.toJSON());
  }

  // ============================================================
  // HELPERS INTERNOS
  // ============================================================

  _addNode(type, config) {
    const node = createNode(type, config);
    const key  = config.name || `${type}_${this.nodes.size}`;
    node.name  = config.name || key;
    this.nodes.set(key, node);
    return node;
  }

  _connect(inputNodes, outputNode) {
    outputNode.inputs = inputNodes;
    for (const input of inputNodes) {
      input.outputs = input.outputs || [];
      input.outputs.push(outputNode);
    }
  }

  _topologicalSort() {
    const visited = new Set();
    const result  = [];

    const visit = (node) => {
      if (visited.has(node)) return;
      visited.add(node);
      for (const input of node.inputs) visit(input);
      result.push(node);
    };

    for (const node of this.nodes.values()) visit(node);
    return result;
  }

  _getNodesByType(type) {
    return Array.from(this.nodes.values()).filter(n => n.type === type);
  }

  _getNodeResult(name) {
    const node = this.nodes.get(name);
    return node?.result || null;
  }

  _resetNodeAndDependents(node) {
    node.status   = 'pending';
    node.result   = null;
    node.errorMsg = null;
    for (const dependent of node.outputs || []) {
      this._resetNodeAndDependents(dependent);
    }
  }

  _allCompleted() {
    return Array.from(this.nodes.values()).every(n => n.status === 'completed');
  }

  _totalCost() {
    return Array.from(this.nodes.values()).reduce((sum, n) => sum + (n.costUsd || 0), 0);
  }

  _totalTokens() {
    return Array.from(this.nodes.values()).reduce((sum, n) => sum + (n.tokensUsed || 0), 0);
  }

  _emitProgress(done, total, currentNode) {
    if (this.onProgress) {
      this.onProgress({
        done,
        total,
        percent:     total > 0 ? Math.round((done / total) * 100) : 0,
        currentNode: currentNode?.name || null,
      });
    }
  }

  _emitNodeUpdate(node) {
    if (this.onNodeUpdate) {
      this.onNodeUpdate(node.toJSON());
    }
  }
}

// ============================================================
// HELPER: construir y ejecutar DAG para un shot en 1 línea
// ============================================================

export async function buildAndExecuteDAG(shot, options = {}) {
  // ── CARGAR ASSETS SAGRADOS del proyecto ──────────────────
  // Si hay projectId, leer sujetos y escenas guardados.
  // Inyectarlos en el shot ANTES de construir el DAG.
  // CONTRATO: el DAG NUNCA inventa — usa estas referencias.
  let enrichedShot = shot;

  if (options.projectId) {
    try {
      const { subjects, scenes } = await loadProjectAssets(options.projectId);

      const mainSubject = subjects[0] || null;
      const mainScene   = scenes[0]   || null;

      if (mainSubject || mainScene) {
        enrichedShot = {
          ...shot,
          frame_start: {
            ...shot.frame_start,
            character: {
              ...shot.frame_start?.character,
              description: buildSubjectDescription(mainSubject)
                || shot.frame_start?.character?.description || '',
            },
            background: {
              ...shot.frame_start?.background,
              description: buildSceneDescription(mainScene)
                || shot.frame_start?.background?.description || '',
            },
          },
          frame_end: {
            ...shot.frame_end,
            character: {
              ...shot.frame_end?.character,
              description: buildSubjectDescription(mainSubject)
                || shot.frame_end?.character?.description || '',
            },
            background: {
              ...shot.frame_end?.background,
              description: buildSceneDescription(mainScene)
                || shot.frame_end?.background?.description || '',
            },
          },
        };
      }
    } catch (e) {
      console.warn('[DAG] No se pudieron cargar assets del proyecto:', e.message);
      // No bloquea — continúa con el shot original
    }
  }

  // ── MODO PROMPT MANUAL — saltar el DAG completo ─────────────
  // Si el usuario escribió un customPrompt, NO corremos el PromptBuilderNode
  // ni ningún otro nodo del DAG. Vamos directamente al VideoRenderNode
  // con el prompt del usuario intacto. Cero interferencia.
  if (options.customPrompt && options.frames) {
    const { VideoRenderNode } = await import('./nodes/VideoRenderNode');

    // Sujeto principal primero — luego secundarios
    const characters = (options.frames.characters || []);
    const principal  = characters.filter(c => c.role === 'principal');
    const resto      = characters.filter(c => c.role !== 'principal' && c.role !== 'extra');
    const ordered    = [...principal, ...resto];

    // Construir turnaround priorizando el sujeto principal
    const mergedTurnaround = { ...(options.frames.turnaround || {}) };
    let slotIdx = 0;
    const slots = ['front', 'three_quarter', 'profile'];
    for (const char of ordered) {
      for (const view of ['front', 'three_quarter', 'profile']) {
        const url = char.images?.[view];
        if (url && slotIdx < slots.length && !mergedTurnaround[slots[slotIdx]]) {
          mergedTurnaround[slots[slotIdx]] = url;
          slotIdx++;
        }
      }
    }

    const node = new VideoRenderNode({
      mediaProvider:   options.mediaProvider         || 'veo',
      startUrl:        options.frames.startUrl       || null,
      endUrl:          options.frames.endUrl         || null,
      turnaround:      mergedTurnaround,
      motionRef:       options.frames.motionRef      || null,
      action:          options.frames.action         || '',
      frameMode:       options.frames.frameMode      || 'exact',
      characters:      [],   // ya procesados arriba en turnaround
      aspectRatio:     options.aspectRatio           || shot.project?.format || '16:9',
      durationSeconds: shot.duration_seconds         || 8,
      prompt:          options.customPrompt,         // prompt del usuario — sin tocar
      isManualPrompt:  true,                         // impide que VideoRenderNode modifique el prompt
      // ── Performance del personaje ─────────────────────────
      shotMode:        options.shotMode    || 'cinematic',
      speechRate:      options.speechRate  || 'normal',
      cameraAngle:     options.cameraAngle || 'frontal',
    });

    options.onProgress?.({ done: 1, total: 1, percent: 50, currentNode: 'Video Render' });
    const result = await node.process({});
    options.onProgress?.({ done: 1, total: 1, percent: 100, currentNode: 'Video Render' });

    return {
      videoUrl:  result.videoUrl,
      prompts:   { start: options.customPrompt, end: options.customPrompt },
      provider:  options.mediaProvider || 'veo',
      mode:      'custom_prompt',
    };
  }

  // ── MODO NORMAL — DAG completo con PromptBuilderNode ─────────
  const executor = new DAGExecutor({
    context: {
      userId:          options.userId,
      projectId:       options.projectId,
      shotId:          shot.id,
      llmProviderName: options.llmProvider   || 'gemini',
      mediaProvider:   options.mediaProvider || 'veo',
      // ── Performance del personaje ─────────────────────────
      shotMode:        options.shotMode    || 'cinematic',
      speechRate:      options.speechRate  || 'normal',
      cameraAngle:     options.cameraAngle || 'frontal',
    },
    onProgress:   options.onProgress,
    onNodeUpdate: options.onNodeUpdate,
  });

  if (options.frames) {
    // Sujeto principal primero en el turnaround
    const characters = (options.frames.characters || []);
    const principal  = characters.filter(c => c.role === 'principal');
    const resto      = characters.filter(c => c.role !== 'principal' && c.role !== 'extra');
    const ordered    = [...principal, ...resto];
    const mergedTurnaround = { ...(options.frames.turnaround || {}) };
    let slotIdx = 0;
    const slots = ['front', 'three_quarter', 'profile'];
    for (const char of ordered) {
      for (const view of ['front', 'three_quarter', 'profile']) {
        const url = char.images?.[view];
        if (url && slotIdx < slots.length && !mergedTurnaround[slots[slotIdx]]) {
          mergedTurnaround[slots[slotIdx]] = url;
          slotIdx++;
        }
      }
    }

    executor._renderConfig = {
      mediaProvider:   options.mediaProvider         || 'veo',
      startUrl:        options.frames.startUrl       || null,
      endUrl:          options.frames.endUrl         || null,
      turnaround:      mergedTurnaround,
      motionRef:       options.frames.motionRef      || null,
      action:          options.frames.action         || '',
      frameMode:       options.frames.frameMode      || 'exact',
      characters:      [],   // ya procesados en turnaround
      aspectRatio:     options.aspectRatio           || shot.project?.format || '16:9',
      durationSeconds: shot.duration_seconds         || 8,
    };
  }

  executor.buildFromShot(enrichedShot, options.mediaProvider || 'veo');
  return executor.execute();
}

export default DAGExecutor;