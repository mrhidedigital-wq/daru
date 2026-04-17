// src/lib/dag/nodes/PromptBuilderNode.js
// El nodo más importante: recibe outputs de todos los nodos anteriores
// y construye el prompt cinematográfico final optimizado con LLM.
//
// BUG 2 FIX: _collectFragments() identifica el nodo ShotFraming
//             por inputNode.name ('Shot Framing START' | 'Shot Framing END')
//             en lugar de por tipo — evita que uno sobreescriba al otro.
//
// BUG 5 FIX: cuando optimizeWithLLM=true, se hace UNA sola llamada al LLM
//             que devuelve JSON { start: "...", end: "..." } cuando el nodo
//             es el START, y el END reutiliza ese resultado.
//             Esto reduce de 2 llamadas a 1 por shot.
//
// NUEVO: speechRate, blinkingRate, handMovement — control de performance
//        del personaje para Modo 2 (personaje hablando a cámara).

import { CinematicNode, NODE_TYPES } from '../CinematicNode';
import { promptCacheDB }             from '../../supabase/database';

// ============================================================
// SPEECH RATE — control de velocidad del habla
// Solo activo cuando shotMode === 'talking_head'
// ============================================================

const SPEECH_RATE_HINTS = {
  veloz:      `The character speaks at an extremely fast pace — rapid-fire delivery, almost no pauses between words, machine-gun rhythm, every syllable crisp and immediate. The lip sync must reflect hyper-fast articulation.`,
  rapido:     `The character speaks fast with founder-style pitch energy — fluid, direct, and confident. Quick transitions between words, minimal pauses, high verbal momentum. The lip sync must reflect energetic fast-paced delivery.`,
  normal:     `The character speaks at a natural conversational pace — relaxed, clear, and easy to follow. Normal breath pauses between sentences. The lip sync must reflect a comfortable everyday speaking rhythm.`,
  lento:      `The character speaks slowly and deliberately — each word carries intentional weight, with slight pauses between phrases. Measured, thoughtful delivery. The lip sync must reflect a slow, controlled articulation.`,
  con_pausas: `The character speaks with dramatic intentional pauses between key phrases — silence is used as emphasis. Pauses of 1-2 seconds between ideas, then words delivered with precision. The lip sync must reflect this pause-and-speak pattern.`,
};

// ============================================================
// BLINKING — parpadeo natural
// Siempre activo en talking_head
// ============================================================

const BLINKING_HINT = `The character blinks naturally every 3-5 seconds — eyelids closing fully and reopening at a human pace. Never a frozen stare. The blinking must feel involuntary and organic, not mechanical.`;

// ============================================================
// HAND MOVEMENT — movimiento de manos al hablar
// ============================================================

const HAND_MOVEMENT_HINTS = {
  off:         ``,
  restrained:  `The character uses subtle restrained hand gestures while speaking — small movements near the torso, fingers occasionally articulating a point, never leaving the frame. Natural and controlled.`,
  expressive:  `The character uses expressive hand gestures while speaking — hands move freely, fingers articulate each point, arms open and close naturally with the rhythm of speech. The performance feels alive and human.`,
};

// Instrucciones de formato por proveedor — basadas en guías oficiales 2025/2026
// Fuentes: Google Cloud Veo 3.1 guide, fal.ai Kling 3.0 guide, ByteDance Seedance 2.0 docs
const PROVIDER_HINTS = {
  veo: `
FORMAT:
- One dense cinematic paragraph. Max 175 words — beyond that Veo ignores instructions.
- What you write FIRST gets the most attention. Lead with the most important element.
- Use standard film terminology: Veo understands dolly, steadicam, rack focus, etc.
- Describe what you WANT, never what you DON'T want (negatives confuse Veo).

ORDER (strictly):
1. Subject + physical description (repeat key identity cues every generation)
2. Action — one clear action per shot
3. Environment / setting
4. Camera shot type (close-up, medium shot, wide shot, etc.)
5. Camera movement (slow dolly-in, steadicam follows, static on tripod, etc.)
6. Lighting (golden hour, rim lighting, soft key light, etc.)
7. Technical style (shot on 35mm film, anamorphic, shallow depth of field, etc.)

STYLE:
- Cinematic, technical, objective
- Use precise film grammar — not poetic language
- Specific beats this word: "cinematic film look", "shot on 35mm film", "anamorphic widescreen"
- No invented emotions or motivations

LENGTH: 80-175 words. Never exceed 175 words.
`,

  kling: `
FORMAT:
- Write like directions to a scene, not a list of objects.
- Kling 3.0 understands cinematic intent — describe WHY the camera moves, not just WHAT it does.
- For image-to-video: focus ONLY on motion instructions — the scene is already in the image.
- Keep prompts 50-80 words for text-to-video. 20-40 words for image-to-video.

ORDER (strictly):
1. Subject + clear physical description (clothing, appearance)
2. Subject movement — one specific action, written in present tense
3. Scene / environment — where it happens, atmosphere
4. Camera movement — describe behavior over time (tracking, following, freezing, panning)
5. Lighting + mood — "golden hour", "studio lighting", "dramatic shadows"
6. Visual style (optional) — "cinematic", "film noir", "TV commercial"

STYLE:
- Action-first language
- Motivated camera — connect every camera move to a narrative reason
- Avoid vague words: "beautiful", "cool", "awesome" — be descriptive instead
- One camera move per shot — compound movements cause distortion

LENGTH: 50-80 words for text-to-video. 20-40 words for image-to-video.
`,

  seeddance: `
FORMAT:
- Reference-first model — subject identity is the #1 priority.
- One clear action per shot — multiple actions cause chaos.
- Use sequential structure for multi-action: "Subject does X. Then does Y."
- Seedance processes audio and video simultaneously — include audio cues if needed.

ORDER (strictly):
1. Subject identity — detailed physical description (repeat verbatim across shots for consistency)
2. Single action — present tense, with intensity descriptor ("walks slowly", "turns sharply")
3. Environment — setting and atmosphere
4. Camera movement — one move only. Use film terms: "slow dolly-in", "tracking shot", "static"
5. Lighting — specific and visual ("warm afternoon backlight", "cold fluorescent interior")
6. Audio (optional) — "ambient street noise", "soft piano", "dialogue: [text]"

STYLE:
- Continuity-focused — character consistency across frames is the main goal
- Physics-aware language works well: describe weight, texture, force
- Use @Image1 notation when referencing uploaded character images
- Avoid compound camera moves ("dolly while panning") — split into sequential beats

LENGTH: 60-120 words. Concise and precise beats long and vague.
`,
};

// ============================================================
// CONTRATO ANTI-ALUCINACIÓN
// Reglas que el LLM debe seguir para no inventar datos.
// Se inyectan en el system prompt de TODAS las llamadas.
// ============================================================

const ANTI_HALLUCINATION_CONTRACT = `
ANTI-HALLUCINATION CONTRACT — MANDATORY:
1. FIDELITY: Every technical value in the input (focal length, aperture, lighting scheme,
   camera movement, shot size) MUST appear verbatim in the output. Do not paraphrase specs.
2. EMPTY FIELDS: If a field says "not specified", DO NOT infer, guess or fill it.
   Simply omit that element from the prompt entirely.
3. CHARACTER: Use ONLY the character description provided word-for-word.
   NEVER add: clothing colors, hair color, eye color, age, ethnicity, facial features,
   emotions, or names that are not explicitly stated in the CHARACTER field.
4. BACKGROUND: Use ONLY the background description provided.
   NEVER add: specific locations, architecture, weather, time of day, objects,
   or atmosphere not stated in the BACKGROUND field.
5. ACTION: Use ONLY the action provided.
   NEVER add: motivations, emotional states, or physical details not in the ACTION field.
6. FORBIDDEN INVENTIONS: brand names, proper nouns, color names, nationalities,
   ages, relationships, narrative context — unless explicitly provided.
7. SELF-CHECK: Before outputting, verify: "Does every word in my output
   trace back to a field in the input?" If not, remove it.`;

export class PromptBuilderNode extends CinematicNode {
  constructor(config = {}) {
    super({
      ...config,
      type: NODE_TYPES.PROMPT_BUILDER,
      name: config.name || 'Prompt Builder',
      parameters: {
        characterDescription:  config.parameters?.characterDescription  || '',
        backgroundDescription: config.parameters?.backgroundDescription || '',
        action:                config.parameters?.action                || '',
        frameType:             config.parameters?.frameType             || 'start',
        optimizeWithLLM:       config.parameters?.optimizeWithLLM !== false,
        targetProvider:        config.parameters?.targetProvider        || 'veo',
        // ── NUEVO: parámetros de performance del personaje ──
        shotMode:              config.parameters?.shotMode              || 'cinematic', // 'cinematic' | 'talking_head'
        speechRate:            config.parameters?.speechRate            || 'normal',   // 'veloz' | 'rapido' | 'normal' | 'lento' | 'con_pausas'
        blinkingEnabled:       config.parameters?.blinkingEnabled       !== false,     // true por defecto en talking_head
        handMovement:          config.parameters?.handMovement          || 'off',      // 'off' | 'restrained' | 'expressive'
        // ── sameScene: ambos frames son vistas de la misma toma ──
        sameScene:             config.parameters?.sameScene             ?? false,
        ...config.parameters,
      },
    });
  }

  async process(context = {}) {
    const fragments  = this._collectFragments();
    const basePrompt = this._buildBasePrompt(fragments);

    if (this.parameters.optimizeWithLLM) {
      const result = await this._optimizeWithLLM(basePrompt, fragments, context);
      // Validar output post-generacion — detecta alucinaciones y las registra
      // sin bloquear la ejecucion (el pipeline no se detiene por una advertencia)
      result.validationWarnings = this._validateOutput(result, fragments);
      return result;
    }

    return {
      prompt:          basePrompt,
      promptOptimized: basePrompt,
      fragments,
      tokenCount:      Math.ceil(basePrompt.length / 4),
      optimized:       false,
      validationWarnings: [],
    };
  }

  // ============================================================
  // BUG 2 FIX: recolectar fragmentos por NOMBRE del nodo,
  // no solo por tipo — evita colisión entre Framing START y END
  // ============================================================

  _collectFragments() {
    const fragments = {};

    for (const inputNode of this.inputs) {
      // Saltamos nodos que fallaron o no tienen resultado
      if (!inputNode.result) continue;

      switch (inputNode.type) {

        case NODE_TYPES.CAMERA_SETUP:
          fragments.camera = inputNode.result.promptFragment;
          break;

        case NODE_TYPES.LENS_CHOICE:
          fragments.lens = inputNode.result.promptFragment;
          break;

        case NODE_TYPES.SHOT_FRAMING:
          // BUG 2 FIX: usar el nombre del nodo para distinguir START vs END
          // El nombre viene de buildFromShot: 'Shot Framing START' | 'Shot Framing END'
          // Si el nombre no está definido, usar el tipo del PromptBuilder como guía
          {
            const esStart = inputNode.name?.includes('START')
              || this.parameters.frameType === 'start';
            const esEnd   = inputNode.name?.includes('END')
              || this.parameters.frameType === 'end';

            // Solo tomar el framing que corresponde a este PromptBuilder
            if (this.parameters.frameType === 'start' && esStart) {
              fragments.framing = inputNode.result.promptFragment;
            } else if (this.parameters.frameType === 'end' && esEnd) {
              fragments.framing = inputNode.result.promptFragment;
            } else if (!fragments.framing) {
              // Fallback: tomar cualquier framing si no hay uno asignado
              fragments.framing = inputNode.result.promptFragment;
            }
          }
          break;

        case NODE_TYPES.LIGHTING_SETUP:
          fragments.lighting = inputNode.result.promptFragment;
          break;

        case NODE_TYPES.CAMERA_MOVE:
          fragments.cameraMove = inputNode.result.promptFragment;
          break;

        case NODE_TYPES.INPUT_CHARACTER:
          fragments.character = inputNode.result.description || '';
          break;

        case NODE_TYPES.INPUT_BACKGROUND:
          fragments.background = inputNode.result.description || '';
          break;

        default:
          break;
      }
    }

    // Parámetros directos del nodo (vienen del shot)
    if (this.parameters.characterDescription && !fragments.character)
      fragments.character = this.parameters.characterDescription;
    if (this.parameters.backgroundDescription && !fragments.background)
      fragments.background = this.parameters.backgroundDescription;
    if (this.parameters.action)
      fragments.action = this.parameters.action;

    return fragments;
  }

  // ============================================================
  // NUEVO: construir bloque de performance del personaje
  // Solo se inyecta cuando shotMode === 'talking_head'
  // ============================================================

  _buildPerformanceBlock() {
    const { shotMode, speechRate, blinkingEnabled, handMovement } = this.parameters;

    if (shotMode !== 'talking_head') return '';

    const lines = [];

    // Velocidad del habla
    const speechHint = SPEECH_RATE_HINTS[speechRate] || SPEECH_RATE_HINTS.normal;
    lines.push(`SPEECH_DELIVERY:\n${speechHint}`);

    // Parpadeo natural
    if (blinkingEnabled) {
      lines.push(`BLINKING:\n${BLINKING_HINT}`);
    }

    // Movimiento de manos
    const handHint = HAND_MOVEMENT_HINTS[handMovement] || '';
    if (handHint) {
      lines.push(`HAND_PERFORMANCE:\n${handHint}`);
    }

    // Reglas fijas de talking head — siempre presentes en Modo 2
    lines.push(`TALKING_HEAD_RULES:
- No subtitles, no captions, no burned-in text, no watermarks, no on-screen text of any kind.
- Gaze direction must remain fixed and natural throughout the shot.
- Torso remains stable — slight natural micro-movements allowed but no sudden pose changes.
- Facial expression matches the speech energy: focused, alert, and expressive without exaggeration.
- Mouth articulation is compact and accurate — no wide-open jaw, no exaggerated lip shapes.
- The performance should feel like a clean real camera take, never like an AI animation.`);

    return lines.join('\n\n');
  }

  _buildBasePrompt(fragments, fragmentsEnd = null) {
    const clean = (v) => {
      if (!v) return '';
      const s = String(v).trim();
      if (!s || s.toLowerCase() === 'not specified') return '';
      return s;
    };

    const subject     = clean(fragments.character);
    const action      = clean(fragments.action);
    const environment = clean(fragments.background);
    const framing     = clean(fragments.framing);
    const framingEnd  = clean(fragmentsEnd?.framing);
    const movement    = clean(fragments.cameraMove);
    const lighting    = clean(fragments.lighting);
    const camera      = clean(fragments.camera);
    const lens        = clean(fragments.lens);

    const backgroundMode = this.parameters.backgroundMode || 'keep_start_end';

    const blocks = [];

    if (subject) {
      blocks.push(`SUBJECT:\n${subject}`);
    }

    if (action) {
      blocks.push(`ACTION:\n${action}`);
    }

    if (environment) {
      blocks.push(`ENVIRONMENT:\n${environment}`);
    }

    if (backgroundMode === 'replace_background') {
      blocks.push(`SUBJECT_LOCK:
Preserve the same character identity, anatomy, pose, and wardrobe from the source frames.`);

      if (environment) {
        blocks.push(`BACKGROUND_CHANGE:
Replace the original background with: ${environment}`);
      }

      blocks.push(`DO_NOT:
Do not alter the subject's face, body proportions, species, clothing structure, or pose.`);
    }

    if (framing) {
      blocks.push(`FRAME_START_COMPOSITION:\n${framing}`);
    }

    if (framingEnd) {
      blocks.push(`FRAME_END_COMPOSITION:\n${framingEnd}`);
    }

    if (movement) {
      blocks.push(`CAMERA_MOTION:\n${movement}`);
    }

    if (lighting) {
      blocks.push(`LIGHTING:\n${lighting}`);
    }

    if (camera || lens) {
      blocks.push(`CAMERA_PACKAGE:\n${[camera, lens].filter(Boolean).join(', ')}`);
    }

    // ── NUEVO: bloque de performance — solo en talking_head ──
    const performanceBlock = this._buildPerformanceBlock();
    if (performanceBlock) {
      blocks.push(performanceBlock);
    }

    if (this.parameters.sameScene) {
      blocks.push(`CONTINUITY_RULES:
- Keep the same subject identity, wardrobe, and scene logic across the shot.
- Do not introduce new visual elements not present in the inputs.
- SAME SCENE MODE: Both reference frames are from the SAME continuous scene. Maintain identical scene elements, characters, props, lighting and atmosphere throughout. The camera or subject moves between these two perspectives — nothing in the scene itself changes.
- The result must feel like one continuous take, not two different shots.`);
    } else {
      blocks.push(`CONTINUITY_RULES:
- Keep the same subject identity, wardrobe, and scene logic across the shot.
- Do not introduce new visual elements not present in the inputs.
- If both start and end framings are present, change composition progressively while preserving continuity.
- The result must feel like one coherent shot, not two unrelated images.`);
    }

    return blocks.join('\n\n');
  }

  // ============================================================
  // BUG 5 FIX: una sola llamada al LLM genera ambos prompts
  // cuando este nodo es el START.
  // El END busca el resultado cacheado en el nodo START.
  // ============================================================

  async _optimizeWithLLM(basePrompt, fragments, context) {
    const targetProvider = this.parameters.targetProvider;
    const frameType      = this.parameters.frameType;
    const providerHint   = PROVIDER_HINTS[targetProvider] || PROVIDER_HINTS.veo;

    // ── Si este nodo es END: buscar el resultado cacheado del START ──
    if (frameType === 'end') {
      const startNode = this.inputs.find(n => n.name === 'Prompt Builder START');

      if (startNode?.result?.promptEnd) {
        return {
          prompt:          basePrompt,
          promptOptimized: startNode.result.promptEnd,
          fragments,
          tokenCount:      0,
          optimized:       true,
          reutilizado:     true,
          llmProvider:     startNode.result.llmProvider,
          llmModel:        startNode.result.llmModel,
        };
      }
    }

    // ── Si este nodo es START: recolectar framing del END desde inputs ──
    let fragmentsEnd = null;
    if (frameType === 'start') {
      const framingEndNode = this.inputs.find(n => n.name === 'Shot Framing END');
      if (framingEndNode?.result) {
        fragmentsEnd = { framing: framingEndNode.result.promptFragment };
      }
    }

    // ── Contexto extra para el LLM: modo del shot ──
    const shotModeContext = this.parameters.shotMode === 'talking_head'
      ? `\nSHOT MODE: TALKING HEAD — This shot features a character speaking directly to camera. Preserve all SPEECH_DELIVERY, BLINKING, HAND_PERFORMANCE, and TALKING_HEAD_RULES instructions verbatim in the output. Do not summarize or omit performance instructions.`
      : `\nSHOT MODE: CINEMATIC — Standard cinematic shot. Focus on camera, lighting, and scene composition.`;

    const system = `You are a strict cinematographic prompt engineer for AI video generation.

Your task is to convert structured shot specifications into production-grade prompts for ${targetProvider.toUpperCase()}.

You do NOT invent story details.
You do NOT add styling details that are not explicitly present.
You do NOT rewrite technical specs loosely.
You preserve fidelity, continuity, and physical plausibility.

${ANTI_HALLUCINATION_CONTRACT}
${shotModeContext}

GLOBAL RULES:
1. Preserve subject identity and scene continuity across START and END.
2. Treat START and END as two moments of the same shot, not separate scenes.
3. Preserve all explicit camera, lens, lighting, and movement information verbatim whenever possible.
4. Prefer precise visual language over poetic language.
5. Avoid generic filler adjectives like "beautiful", "stunning", "epic", unless explicitly provided.
6. If an element is missing, omit it. Never guess.
7. If movement and framing imply a transition, express it cinematically and physically coherently.

PROVIDER OUTPUT RULES:
${providerHint}

OUTPUT:
- Return valid JSON only.
- No markdown.
- No commentary.
- If generating two prompts, return {"start":"...","end":"..."}.
- If generating one prompt, return {"prompt":"..."}.`;

    const generarAmbos = frameType === 'start' && fragmentsEnd;

    const structuredBase = this._buildBasePrompt(fragments, fragmentsEnd);

    const prompt = generarAmbos
      ? `Generate TWO prompts for the same continuous shot.

SHOT_SPEC:
${structuredBase}

TASK:
- Write one prompt for FRAME START.
- Write one prompt for FRAME END.
- They must describe the same subject, same environment, same shot logic.
- The main difference should be composition/progression across the shot.
- Do not create narrative changes between START and END.
- Keep all technical inputs faithful.

Return JSON:
{"start":"...","end":"..."}`
      : `Generate ONE optimized prompt for a single frame of a continuous cinematic shot.

SHOT_SPEC:
${structuredBase}

TASK:
- Convert the structured shot spec into one clean provider-ready prompt.
- Keep all technical inputs faithful.
- Do not invent missing details.

Return JSON:
{"prompt":"..."}`;

    const result = await this._callLLMWithCache({
      system,
      prompt,
      temperature: 0.35,
      max_tokens:  600,
    }, fragments);

    // Parsear respuesta JSON — con limpieza de posibles backticks
    let parsed;
    try {
      const clean = result.text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsed = JSON.parse(clean);
    } catch {
      parsed = generarAmbos
        ? { start: result.text.trim(), end: result.text.trim() }
        : { prompt: result.text.trim() };
    }

    if (generarAmbos) {
      return {
        prompt:          basePrompt,
        promptOptimized: parsed.start || result.text.trim(),
        promptEnd:       parsed.end   || parsed.start || result.text.trim(),
        fragments,
        tokenCount:      result.tokens_total,
        optimized:       true,
        generadoAmbos:   true,
        llmProvider:     result.provider,
        llmModel:        result.model,
      };
    }

    return {
      prompt:          basePrompt,
      promptOptimized: parsed.prompt || result.text.trim(),
      fragments,
      tokenCount:      result.tokens_total,
      optimized:       true,
      llmProvider:     result.provider,
      llmModel:        result.model,
    };
  }

  // ============================================================
  // PROMPT CACHE
  // ============================================================

  async _callLLMWithCache(llmParams, fragments) {
    const cacheKey = JSON.stringify({
      provider:   this.parameters.targetProvider,
      frameType:  this.parameters.frameType,
      framing:    fragments.framing    || '',
      camera:     fragments.camera     || '',
      lens:       fragments.lens       || '',
      lighting:   fragments.lighting   || '',
      cameraMove: fragments.cameraMove || '',
      character:  fragments.character  || '',
      action:     fragments.action     || '',
      background: fragments.background || '',
      // ── NUEVO: incluir parámetros de performance en el hash del cache ──
      shotMode:   this.parameters.shotMode    || 'cinematic',
      speechRate: this.parameters.speechRate  || 'normal',
      blinking:   this.parameters.blinkingEnabled !== false,
      handMove:   this.parameters.handMovement || 'off',
    });

    let hash = 0;
    for (let i = 0; i < cacheKey.length; i++) {
      hash = ((hash << 5) - hash + cacheKey.charCodeAt(i)) | 0;
    }
    const inputHash = `pb_${Math.abs(hash).toString(36)}`;

    try {
      const cached = await promptCacheDB.getByHash(inputHash);
      if (cached?.optimized_prompt) {
        return {
          text:          cached.optimized_prompt,
          tokens_input:  0,
          tokens_output: 0,
          tokens_total:  0,
          cost_usd:      0,
          provider:      'cache',
          model:         'prompt_cache',
          cacheHit:      true,
        };
      }
    } catch {
      // Cache miss o error — continuar sin cache
    }

    const result = await this.callLLM(llmParams);

    promptCacheDB.set(
      inputHash,
      JSON.parse(cacheKey),
      result.text,
      result.tokens_input  || 0,
      result.tokens_output || 0,
    ).catch(() => {});

    return result;
  }

  // ============================================================
  // VALIDACIÓN POST-GENERACIÓN
  // ============================================================

  _validateOutput(result, fragments) {
    const warnings = [];
    const prompts = [
      result.promptOptimized || '',
      result.promptEnd       || '',
    ].filter(Boolean);

    const inputText  = Object.values(fragments).filter(Boolean).join(' ').toLowerCase();
    const actionText = (fragments.action || '').toLowerCase();
    const hasCharDesc = (fragments.character || '').length > 10;

    for (const promptText of prompts) {
      const lower = promptText.toLowerCase();

      if (fragments.framing && !promptText.includes(fragments.framing.split(',')[0])) {
        warnings.push(`FRAMING_MISSING: framing "${fragments.framing.slice(0, 40)}" not found in output`);
      }

      const colorWords = ['red', 'blue', 'green', 'black', 'white', 'yellow',
                          'purple', 'orange', 'pink', 'brown', 'gray', 'golden',
                          'rojo', 'azul', 'verde', 'negro', 'blanco', 'amarillo'];
      if (!hasCharDesc) {
        const foundColor = colorWords.find(c => lower.includes(c));
        if (foundColor) {
          warnings.push(`COLOR_HALLUCINATION: color "${foundColor}" added without character description`);
        }
      }

      const properNouns = promptText.match(/(?<![a-z])[A-Z][a-z]{3,}(?![a-z])/g) || [];
      const cinematicTerms = ['Rembrandt', 'Dolly', 'Arri', 'Alexa', 'Cooke',
                              'Bokeh', 'Steadicam', 'Technicolor', 'IMAX', 'Gaussian',
                              'Fresnel', 'Super', 'Anamorphic', 'Panavision'];
      for (const noun of properNouns) {
        if (!cinematicTerms.includes(noun) && !inputText.includes(noun.toLowerCase())) {
          warnings.push(`PROPER_NOUN_HALLUCINATION: "${noun}" not present in input data`);
        }
      }

      const emotionWords = ['happy', 'sad', 'angry', 'fearful', 'joyful', 'melancholic',
                            'peaceful', 'anxious', 'confident', 'nervous', 'excited',
                            'desperate', 'hopeful', 'furious', 'serene', 'determined',
                            'feliz', 'triste', 'enojado', 'sereno', 'ansioso',
                            'desesperado', 'furioso', 'decidido', 'esperanzado'];
      const foundEmotion = emotionWords.find(e =>
        lower.includes(e) && !actionText.includes(e) && !inputText.includes(e)
      );
      if (foundEmotion) {
        warnings.push(`EMOTION_HALLUCINATION: emotion "${foundEmotion}" not in action description`);
      }

      const tokenEstimate = Math.ceil(promptText.length / 4);
      const targetProvider = this.parameters.targetProvider;
      const maxTokens = { veo: 300, kling: 200, seeddance: 250 };
      const limit = maxTokens[targetProvider] || 300;
      if (tokenEstimate > limit * 1.3) {
        warnings.push(`PROMPT_TOO_LONG: ~${tokenEstimate} tokens exceeds ${targetProvider} recommended max of ${limit}`);
      }
      if (tokenEstimate < 20) {
        warnings.push(`PROMPT_TOO_SHORT: ~${tokenEstimate} tokens — prompt may be insufficient for quality generation`);
      }

      if (fragments.lens && !lower.includes('mm') && !lower.includes('lens')) {
        warnings.push(`LENS_MISSING: lens info "${fragments.lens.slice(0, 30)}" not reflected in output`);
      }
      if (fragments.lighting && !lower.includes('light') && !lower.includes('iluminac')) {
        warnings.push(`LIGHTING_MISSING: lighting scheme not reflected in output`);
      }
      if (fragments.cameraMove && fragments.cameraMove !== 'static camera') {
        const moveTerms = ['dolly', 'pan', 'tilt', 'track', 'crane', 'steadicam',
                           'parallax', 'zoom', 'push', 'pull', 'orbit', 'movement'];
        const hasMoveRef = moveTerms.some(t => lower.includes(t));
        if (!hasMoveRef) {
          warnings.push(`CAMERA_MOVE_MISSING: camera movement not reflected in output`);
        }
      }
    }

    if (result.promptOptimized && result.promptEnd) {
      const startClean = (result.promptOptimized || '').trim().toLowerCase();
      const endClean   = (result.promptEnd       || '').trim().toLowerCase();

      if (startClean === endClean && fragments.cameraMove && fragments.cameraMove !== 'static camera') {
        warnings.push(`START_END_IDENTICAL: prompts are identical but camera movement "${fragments.cameraMove}" implies visual change`);
      }

      if (result.generadoAmbos && fragments.framing) {
        const framingStart = fragments.framing.toLowerCase();
        if (startClean === endClean && framingStart.includes('→')) {
          warnings.push(`FRAMING_CHANGE_MISSING: shot has framing transition but prompts are identical`);
        }
      }
    }

    const cameraMove = (fragments.cameraMove || '').toLowerCase();
    if (cameraMove.includes('dolly_in') && cameraMove.includes('dolly_out')) {
      warnings.push(`IMPOSSIBLE_MOVE: dolly_in + dolly_out simultaneous is physically impossible`);
    }
    if (cameraMove.includes('pan_left') && cameraMove.includes('pan_right')) {
      warnings.push(`IMPOSSIBLE_MOVE: pan_left + pan_right simultaneous is physically impossible`);
    }
    if (cameraMove.includes('tilt_up') && cameraMove.includes('tilt_down')) {
      warnings.push(`IMPOSSIBLE_MOVE: tilt_up + tilt_down simultaneous is physically impossible`);
    }

    const framing = (fragments.framing || '').toLowerCase();
    if (hasCharDesc && (framing.includes('gran_plano_general') || framing.includes('extreme wide'))) {
      const faceTerms = ['eyes', 'eyebrows', 'lips', 'wrinkles', 'freckles',
                         'ojos', 'cejas', 'labios', 'arrugas', 'pecas'];
      const charLower = (fragments.character || '').toLowerCase();
      const hasFaceDetail = faceTerms.some(t => charLower.includes(t));
      if (hasFaceDetail) {
        warnings.push(`CHARACTER_OUT_OF_RANGE: facial details described but framing is extreme wide — face won't be visible`);
      }
    }

    if (warnings.length > 0) {
      console.warn(`[PromptBuilderNode:${this.name}] Validation warnings:`, warnings);
    }

    return warnings;
  }

}

export default PromptBuilderNode;