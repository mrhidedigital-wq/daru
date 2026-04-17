// src/lib/dag/nodes/VideoRenderNode.js
import { CinematicNode } from '../CinematicNode';

// ─── Key resolution: Supabase first, .env fallback ────────────
// El cache de 5 minutos evita golpear Supabase en cada render.
// En Vercel las variables REACT_APP_* opcionales no existen —
// process.env las devuelve undefined, no lanza error.
const _keyCache = new Map();
const KEY_CACHE_TTL_MS  = 5  * 60 * 1000; // 5 min
const TOKEN_MAX_AGE_MS  = 60 * 60 * 1000; // 60 min

export async function resolveKey(keyName, envFallback) {
  const now    = Date.now();
  const cached = _keyCache.get(keyName);
  if (cached && (now - cached.ts) < KEY_CACHE_TTL_MS) return cached.value;

  try {
    const { supabase } = await import('../../supabase/client');
    const { data } = await supabase
      .from('api_keys')
      .select('key_value')
      .eq('key_name', keyName)
      .maybeSingle();

    if (data?.key_value) {
      _keyCache.set(keyName, { value: data.key_value, ts: now });
      return data.key_value;
    }
  } catch { /* continúa al fallback */ }

  // Fallback a .env — undefined si no existe (no lanza error en Vercel)
  const envValue = envFallback ? (process.env[envFallback] || null) : null;
  _keyCache.set(keyName, { value: envValue, ts: now });
  return envValue;
}

export async function resolveVertexToken() {
  const now = Date.now();

  try {
    const { supabase } = await import('../../supabase/client');
    const { data } = await supabase
      .from('api_keys')
      .select('key_value, updated_at')
      .eq('key_name', 'vertex_access_token')
      .maybeSingle();

    if (data?.key_value && data?.updated_at) {
      const age = now - new Date(data.updated_at).getTime();
      if (age < TOKEN_MAX_AGE_MS) {
        return data.key_value; // token válido
      }
      // Token vencido en Supabase — no usarlo, caer al .env
      console.warn('[VideoRenderNode] Vertex token en Supabase vencido, usando fallback .env');
    }
  } catch { /* continúa al fallback */ }

  // Fallback a .env — undefined si no existe
  return process.env.REACT_APP_VERTEX_ACCESS_TOKEN || null;
}

// Invalida la caché de una key (útil tras guardar desde Settings)
export function invalidateKeyCache(keyName) {
  if (keyName) _keyCache.delete(keyName);
  else         _keyCache.clear();
}

const PROVIDERS = {
  veo:                   'veo',
  kling:                 'kling',
  seeddance:             'seeddance',
  seeddance_byteplus:    'seeddance_byteplus',
  seeddance_byteplus_15: 'seeddance_byteplus_15',
  seeddance_piapi:       'seeddance_piapi',
};

// ─── Polling helper ───────────────────────────────────────────
async function pollUntilDone(checkFn, intervalMs = 8000, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await checkFn(i);
    if (result.done) return result;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('Video generation timed out after 8 minutes');
}

// ─── VEO 3.1 ──────────────────────────────────────────────────
//
// Autenticación via Vertex AI:
//      Requiere: REACT_APP_GOOGLE_CLOUD_PROJECT  (project ID)
//                REACT_APP_VERTEX_ACCESS_TOKEN   (OAuth2 token de service account)
//      Endpoint: us-central1-aiplatform.googleapis.com
//      Obtener token: `gcloud auth print-access-token` o service account key
//
// ─── VEO EXTEND CHAIN ─────────────────────────────────────────
//
// Encadena extensiones de Veo para llegar a duraciones > 8 segundos.
//
// Mecánica documentada por Google:
//   - Clip base:      4, 6 u 8 segundos
//   - Cada extensión: +7 segundos
//   - Máximo entrada: 30 segundos por extensión
//
// Ejemplo para 30 segundos:
//   Base:        8s
//   Extensión 1: 8 + 7 = 15s
//   Extensión 2: 15 + 7 = 22s
//   Extensión 3: 22 + 7 = 29s
//   Extensión 4: 29 + 7 = 36s → trim a 30s
//
async function extendWithVeo({ videoUrl, gcsUri, prompt, aspectRatio, targetSeconds, projectId, vertexToken, turnaroundUrls = [] }) {
  const serverUrl = process.env.REACT_APP_SERVER_URL || '';

  // Calcular cuántas extensiones necesitamos
  const BASE_SECONDS = 8;
  const EXT_SECONDS  = 7;
  let currentSeconds = BASE_SECONDS;
  let extensionsNeeded = 0;
  while (currentSeconds < targetSeconds) {
    currentSeconds += EXT_SECONDS;
    extensionsNeeded++;
  }

  console.log(`[veo-extend] Target: ${targetSeconds}s → ${extensionsNeeded} extensiones → ${currentSeconds}s → trim a ${targetSeconds}s`);

  let currentVideoUrl = videoUrl;
  let currentGcsUri   = gcsUri;

  for (let i = 0; i < extensionsNeeded; i++) {
    console.log(`[veo-extend] Extensión ${i + 1}/${extensionsNeeded}`);

    const instance = { prompt };

    if (currentGcsUri) {
      instance.video = { gcsUri: currentGcsUri };
    } else if (currentVideoUrl) {
      if (currentVideoUrl.startsWith('data:video/')) {
        const b64 = currentVideoUrl.split(',')[1];
        instance.video = { bytesBase64Encoded: b64, mimeType: 'video/mp4' };
      } else {
        instance.video = { gcsUri: currentVideoUrl };
      }
    }

    // IMPORTANTE: Veo Extend NO acepta referenceImages + video simultáneamente.
    // La consistencia del personaje en extend se mantiene por dos vías:
    //   1. El propio video de entrada — Veo continúa desde el último frame
    //   2. Refuerzo textual en el prompt — descripción explícita del personaje
    // Las turnaroundUrls se guardan para el log pero NO se mandan como referenceImages.

    const body = {
      instances: [instance],
      parameters: {
        aspectRatio:     aspectRatio || '16:9',
        durationSeconds: 7, // Veo Extend solo acepta 7 — genera +7s por extensión
        sampleCount:     1,
       generateAudio:   true,

      },
    };

    const extendRes = await fetch(`${serverUrl}/api/veo/extend`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ body, projectId, accessToken: vertexToken }),
    });

    if (!extendRes.ok) {
      const err = await extendRes.json().catch(() => ({}));
      throw new Error(`Veo extend error (${i + 1}/${extensionsNeeded}): ${err?.error || extendRes.status}`);
    }

    const operation = await extendRes.json();
    const opName    = operation.name;

    const result = await pollUntilDone(async () => {
      const pollRes  = await fetch(`${serverUrl}/api/veo/poll`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ operationName: opName, accessToken: vertexToken }),
      });
      const pollData = await pollRes.json();

      if (pollData.done) {
        if (pollData.error) throw new Error(`Veo extend failed: ${pollData.error.message || JSON.stringify(pollData.error)}`);
        const response = pollData.response || {};
        const videoObj = response.generatedVideos?.[0]?.video
                      || response.generatedVideos?.[0]
                      || response.videos?.[0];
        if (!videoObj) throw new Error('Veo extend returned no video');
        if (videoObj.uri || videoObj.gcsUri) return { done: true, videoUrl: null, gcsUri: videoObj.uri || videoObj.gcsUri };
        if (videoObj.bytesBase64Encoded) return { done: true, videoUrl: `data:video/mp4;base64,${videoObj.bytesBase64Encoded}`, gcsUri: null };
        throw new Error('Veo extend returned video but no URI or bytes');
      }
      return { done: false };
    }, 10000, 72);

    currentVideoUrl = result.videoUrl;
    currentGcsUri   = result.gcsUri;
    console.log(`[veo-extend] Extensión ${i + 1} completada`);
  }

  // Trim final al targetSeconds exacto via /api/video/finalize
  console.log(`[veo-extend] Trimming a ${targetSeconds}s exactos`);
  const finalizeRes = await fetch(`${serverUrl}/api/video/finalize`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      gcsUri:                currentGcsUri   || null,
      videoUrl:              currentVideoUrl || null,
      accessToken:           vertexToken,
      targetDurationSeconds: targetSeconds,
    }),
  });

  if (!finalizeRes.ok) {
    const err = await finalizeRes.json().catch(() => ({}));
    throw new Error(`Video finalize failed: ${err?.error || finalizeRes.status}`);
  }

  const finalData = await finalizeRes.json();
  console.log(`[veo-extend] ✓ Listo: ${finalData.fileSizeMB}MB, ${finalData.trimmedToSeconds}s`);
  return finalData.url;
}

async function generateWithVeo({ prompt, startUrl, endUrl, turnaround, aspectRatio, durationSeconds, frameMode }) {
  const projectId   = await resolveKey('google_cloud_project', 'REACT_APP_GOOGLE_CLOUD_PROJECT');
  const vertexToken = await resolveVertexToken();

  // Vertex AI es el único modo soportado (las claves LLM están en el servidor)
  const useVertex = !!projectId;

  if (useVertex && !vertexToken) {
    throw new Error(
      'Vertex access token expirado o no configurado. ' +
      'Ve a Ajustes → API Keys y pega el output de: gcloud auth print-access-token'
    );
  }
  if (!useVertex) {
    throw new Error(
      'Google Cloud Project ID no configurado. ' +
      'Agrégalo en Ajustes → API Keys (campo "Google Cloud Project ID").'
    );
  }

  // ── Parsear bloque SUBJECT del prompt manual ──────────────────
  // Cuando el usuario inserta un sujeto en el PROMPT MANUAL, el bloque tiene:
  //   SUBJECT 1 — Nombre:
  //   Description: ...
  //   FRONT_REF: <url>
  //   THREE_QUARTER_REF: <url>
  //   SIDE_REF: <url>
  //   [SACRED VISUAL REFERENCES — ...]
  // Las URLs deben ir como referenceImages en la API, NO en el texto del prompt.
  // Las instrucciones en mayúsculas (SACRED, DO NOT) disparan el filtro RAI de Veo.
  // Esta función extrae las URLs y devuelve el prompt limpio.
  function extractSubjectRefs(rawPrompt) {
    const subjectUrls = [];
    // Extraer todas las URLs de REF lines
    const refLineRe = /^(FRONT_REF|THREE_QUARTER_REF|SIDE_REF):\s*(https?:\/\/\S+)/gm;
    let match;
    while ((match = refLineRe.exec(rawPrompt)) !== null) {
      subjectUrls.push(match[2].trim());
    }
    // Limpiar el prompt: eliminar bloques SUBJECT completos
    // Un bloque SUBJECT empieza en "SUBJECT N —" y termina antes de la siguiente
    // línea en blanco que no forme parte del bloque, o al final del texto.
    let cleanPrompt = rawPrompt
      // Eliminar líneas FRONT_REF / THREE_QUARTER_REF / SIDE_REF
      .replace(/^(FRONT_REF|THREE_QUARTER_REF|SIDE_REF):.*$/gm, '')
      // Eliminar línea "SUBJECT N — Nombre:"
      .replace(/^SUBJECT\s+\d+\s*[—–-].*:?\s*$/gm, '')
      // Eliminar línea "Description: ..."
      .replace(/^Description:.*$/gm, '')
      // Eliminar instrucciones SACRED / DO NOT / instrucciones entre corchetes
      .replace(/^\[SACRED.*?\]\s*$/gm, '')
      .replace(/^\[.*DO NOT.*\]\s*$/gm, '')
      // Colapsar múltiples líneas vacías consecutivas en una sola
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { cleanPrompt, subjectUrls };
  }

  // Aplicar el parser al prompt recibido
  const { cleanPrompt, subjectUrls } = extractSubjectRefs(prompt);
  prompt = cleanPrompt; // eslint-disable-line no-param-reassign

  // ─────────────────────────────────────────────────────────────

  // Convertir URLs a base64
  const toBase64 = async (url) => {
    const res  = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({
        data:     reader.result.split(',')[1],
        mimeType: blob.type || 'image/jpeg',
      });
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Vertex AI Veo — dos modos de frames:
  //   EXACTO:     image + lastFrame (Veo interpola entre ambos frames exactos)
  //   REFERENCIA: referenceImages con referenceType "asset" (Veo usa como guía visual)
  const instance = { prompt };
  const isExact = frameMode === 'exact';

  if (isExact) {
    // Modo EXACTO: frames como image/lastFrame directos
    if (startUrl) {
      const img = await toBase64(startUrl);
      instance.image = { bytesBase64Encoded: img.data, mimeType: img.mimeType };
    }
    if (endUrl) {
      const img = await toBase64(endUrl);
      instance.lastFrame = { bytesBase64Encoded: img.data, mimeType: img.mimeType };
    }
  }

  // referenceImages: turnaround + frames en modo referencia
  const refImages = [];

  if (!isExact) {
    // Modo REFERENCIA: frames como assets
    if (startUrl) {
      const img = await toBase64(startUrl);
      refImages.push({
        image: { bytesBase64Encoded: img.data, mimeType: img.mimeType },
        referenceType: 'asset',
      });
    }
    if (endUrl) {
      const img = await toBase64(endUrl);
      refImages.push({
        image: { bytesBase64Encoded: img.data, mimeType: img.mimeType },
        referenceType: 'asset',
      });
    }
  }

  // Turnaround del personaje como asset references (hasta 3 total).
  // Prioridad: turnaround explícito → URLs extraídas del bloque SUBJECT del prompt.
  const turnaroundUrls = [
    ...Object.values(turnaround || {}).filter(Boolean),
    ...subjectUrls.filter(u => !Object.values(turnaround || {}).includes(u)),
  ];
  const slotsLeft = 3 - refImages.length;
  for (const url of turnaroundUrls.slice(0, Math.max(0, slotsLeft))) {
    const img = await toBase64(url);
    refImages.push({
      image: { bytesBase64Encoded: img.data, mimeType: img.mimeType },
      referenceType: 'asset',
    });
  }

  if (refImages.length > 0) {
    instance.referenceImages = refImages;
  }

  // Veo solo acepta duraciones de 4, 6 u 8 segundos
  const validDurations = [4, 6, 8];
  let veoDuration = durationSeconds || 8;
  if (!validDurations.includes(veoDuration)) {
    veoDuration = validDurations.reduce((prev, curr) =>
      Math.abs(curr - veoDuration) < Math.abs(prev - veoDuration) ? curr : prev
    );
  }

  const body = {
    instances: [instance],
    parameters: {
      aspectRatio:     aspectRatio || '16:9',
      durationSeconds: veoDuration,
      sampleCount:     1,
      generateAudio:   true,
    },
  };

  // Endpoints y headers según modo de autenticación
  const serverUrl = process.env.REACT_APP_SERVER_URL || '';

  if (useVertex) {
    // ── Modo Vertex AI via proxy backend (evita CORS) ──
    const generateRes = await fetch(`${serverUrl}/api/veo/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: body,
        projectId,
        accessToken: vertexToken,
      }),
    });

    if (!generateRes.ok) {
      const err = await generateRes.json().catch(() => ({}));
      throw new Error(`Veo API error: ${err?.error || err?.message || generateRes.status}`);
    }

    const operation = await generateRes.json();
    const opName    = operation.name;

    // Poll via proxy backend
    const { videoUrl } = await pollUntilDone(async () => {
      const pollRes  = await fetch(`${serverUrl}/api/veo/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationName: opName,
          accessToken: vertexToken,
        }),
      });
      const pollData = await pollRes.json();

      if (pollData.done) {
        // Verificar si Google devolvió un error (filtro RAI, duración inválida, etc.)
        if (pollData.error) {
          throw new Error(`Veo generation failed: ${pollData.error.message || JSON.stringify(pollData.error)}`);
        }
        const response = pollData.response || {};
        const videoObj = response.generatedVideos?.[0]?.video
                      || response.generatedVideos?.[0]
                      || response.videos?.[0];
        
        if (!videoObj) throw new Error('Veo returned no video data. Keys: ' + JSON.stringify(Object.keys(response)));

        // Vertex AI puede devolver URI (gcs) o bytes base64
        if (videoObj.uri || videoObj.gcsUri) {
          return { done: true, videoUrl: videoObj.uri || videoObj.gcsUri };
        }
        if (videoObj.bytesBase64Encoded) {
          // Convertir base64 a data URL para preview/descarga
          const dataUrl = `data:video/mp4;base64,${videoObj.bytesBase64Encoded}`;
          return { done: true, videoUrl: dataUrl };
        }
        throw new Error('Veo returned video but no URI or bytes. Keys: ' + JSON.stringify(Object.keys(videoObj)));
      }
      return { done: false };
    });

    // ── Extend Chain si durationSeconds > 8 ──────────────────
    // El clip base siempre es 8s. Si el usuario pidió más,
    // encadenamos extensiones de 7s hasta llegar al target.
    if (durationSeconds > 8) {
      // Detectar si Vertex devolvió GCS URI o URL directa
      const isGcs = videoUrl?.startsWith('gs://');
      return extendWithVeo({
        videoUrl:      isGcs ? null : videoUrl,
        gcsUri:        isGcs ? videoUrl : null,
        prompt:        instance.prompt,
        aspectRatio:   aspectRatio || '16:9',
        targetSeconds: durationSeconds,
        projectId,
        vertexToken,
        // Pasar el turnaround para reinyectarlo en cada extensión y evitar alucinaciones
        turnaroundUrls: [
          ...Object.values(turnaround || {}).filter(Boolean),
        ].slice(0, 3),
      });
    }

    return videoUrl;

  } else {
    // ── Modo Gemini API directa (sin Vertex) ──
    const geminiApiKey = await resolveKey('gemini_api_key', 'REACT_APP_GEMINI_API_KEY');
    if (!geminiApiKey) throw new Error('Gemini API key no configurada. Agrégala en Ajustes → API Keys.');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/veo-3.1-generate-preview:generateVideos?key=${geminiApiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Veo API error: ${err?.error?.message || res.status}`);
    }

    const operation = await res.json();
    const opName    = operation.name;

    const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${opName}?key=${geminiApiKey}`;

    const { videoUrl } = await pollUntilDone(async () => {
      const pollRes  = await fetch(pollUrl);
      const pollData = await pollRes.json();

      if (pollData.done) {
        const video = pollData.response?.generatedVideos?.[0]?.video;
        const url   = video?.uri || video?.videoBytes;
        if (!url) throw new Error('Veo returned no video URL');
        return { done: true, videoUrl: url };
      }
      return { done: false };
    });

    return videoUrl;
  }
}

// ─── KLING 3.0 ────────────────────────────────────────────────
async function generateWithKling({ prompt, startUrl, endUrl, turnaround, aspectRatio, durationSeconds }) {
  const apiKey = await resolveKey('kling_api_key', 'REACT_APP_KLING_API_KEY');
  if (!apiKey) throw new Error('Kling API key no configurada. Agrégala en Ajustes → API Keys.');

  // Usar Freepik API (más simple) o PiAPI
  const BASE = 'https://api.freepik.com/v1/ai/video/kling-v3';

  const imageList = [];
  if (startUrl) imageList.push({ type: 'first_frame', url: startUrl });
  if (endUrl)   imageList.push({ type: 'end_frame',   url: endUrl   });

  const body = {
    prompt,
    negative_prompt: 'blurry, low quality, distorted, watermark',
    mode:            'pro',
    duration:        Math.min(Math.max(durationSeconds || 5, 3), 15),
    aspect_ratio:    aspectRatio || '16:9',
    cfg_scale:       0.5,
    ...(imageList.length > 0 && { image_list: imageList }),
  };

  const res = await fetch(BASE, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-freepik-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Kling API error: ${err?.message || res.status}`);
  }

  const { data } = await res.json();
  const taskId   = data?.task_id || data?.id;
  if (!taskId) throw new Error('Kling returned no task ID');

  // Poll task status
  const { videoUrl } = await pollUntilDone(async () => {
    const pollRes  = await fetch(`${BASE}/${taskId}`, {
      headers: { 'x-freepik-api-key': apiKey },
    });
    const pollData = await pollRes.json();
    const status   = pollData?.data?.status || pollData?.status;

    if (status === 'completed' || status === 'succeed') {
      const url = pollData?.data?.output?.video_url
               || pollData?.data?.video_url
               || pollData?.output?.video_url;
      if (!url) throw new Error('Kling returned no video URL');
      return { done: true, videoUrl: url };
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`Kling generation failed: ${pollData?.data?.message || 'Unknown error'}`);
    }
    return { done: false };
  });

  return videoUrl;
}

// ─── SEEDDANCE 2.0 ────────────────────────────────────────────
async function generateWithSeedDance({ prompt, startUrl, endUrl, turnaround, motionRef, aspectRatio, durationSeconds }) {
  const apiKey = await resolveKey('seeddance_api_key', 'REACT_APP_SEEDDANCE_API_KEY');
  if (!apiKey) throw new Error('SeedDance API key no configurada. Agrégala en Ajustes → API Keys.');

  const BASE = 'https://api.aimlapi.com/v2/video/generations';

  let body;

  if (motionRef) {
    // Omni Reference mode — imagen del personaje + video de movimiento
    const turnaroundUrls = Object.values(turnaround || {}).filter(Boolean);
    body = {
      model:        'bytedance/seedance-1-5-pro',
      prompt:       `@image_file_1 character ${prompt}. Follow @video_file_1 camera movement and style.`,
      functionMode: 'omni_reference',
      image_files:  turnaroundUrls.slice(0, 1),
      video_files:  [motionRef],
      ratio:        aspectRatio === '9:16' ? '9:16' : aspectRatio === '1:1' ? '1:1' : '16:9',
      duration:     Math.min(Math.max(durationSeconds || 5, 4), 15),
    };
  } else {
    // First frame / First+Last frame mode
    // AIMLAPI v2 usa 'image_files' (array de URLs), NO 'filePaths'
    const imageFiles = [startUrl, endUrl].filter(Boolean);

    // functionMode correcto según cuántos frames hay disponibles
    // Bug fix: el ternario anterior tenía 'first_last_frames' en AMBAS ramas
    const functionMode = imageFiles.length === 2 ? 'first_last_frames' : 'first_frame';

    body = {
      model:        'bytedance/seedance-1-5-pro',
      prompt,
      functionMode,
      image_files:  imageFiles,   // campo correcto de la API AIMLAPI v2
      ratio:        aspectRatio === '9:16' ? '9:16' : aspectRatio === '1:1' ? '1:1' : '16:9',
      duration:     Math.min(Math.max(durationSeconds || 5, 4), 15),
    };
  }

  const res = await fetch(BASE, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`SeedDance API error: ${err?.error?.message || res.status}`);
  }

  const { id: generationId } = await res.json();
  if (!generationId) throw new Error('SeedDance returned no generation ID');

  // Poll status
  const { videoUrl } = await pollUntilDone(async () => {
    const pollRes  = await fetch(`${BASE}?generation_id=${generationId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const pollData = await pollRes.json();
    const status   = pollData?.status;

    if (status === 'completed') {
      const url = pollData?.video?.url;
      if (!url) throw new Error('SeedDance returned no video URL');
      return { done: true, videoUrl: url };
    }
    if (status === 'error') {
      throw new Error(`SeedDance failed: ${pollData?.error?.message || 'Unknown error'}`);
    }
    return { done: false };
  }, 10000, 48); // 10s intervals, max 8 min

  return videoUrl;
}

// ─── SEEDDANCE — BytePlus (directo de ByteDance) ──────────────
//
// Ventaja clave: watermark nativo — watermark:false entrega video limpio.
// Endpoint:  https://ark.ap-southeast.bytepluses.com/api/v3
// Modelos soportados:
//   dreamina-seedance-2-0-260128  → SeedDance 2.0 (default)
//   seedance-1-5-pro-251215       → SeedDance 1.5 Pro (sin reference_video)
//
async function generateWithSeedDanceBytePlus({
  prompt, startUrl, endUrl, turnaround, motionRef,
  aspectRatio, durationSeconds, removeWatermark,
  byteplusModel = 'dreamina-seedance-2-0-260128',
}) {
  const apiKey = await resolveKey('byteplus_api_key', 'REACT_APP_BYTEPLUS_API_KEY');
  if (!apiKey) throw new Error('BytePlus API key no configurada. Agrégala en Ajustes → API Keys.');

  // Construir el array content según el modo de entrada
  const content = [];

  // SeedDance 1.5 no soporta reference_video — omitir motionRef para ese modelo
  const supportsMotionRef = byteplusModel !== 'seedance-1-5-pro-251215';

  if (motionRef && supportsMotionRef) {
    // Omni reference: imagen del personaje + video de movimiento (solo 2.0)
    const turnaroundUrls = Object.values(turnaround || {}).filter(Boolean);
    content.push({ type: 'text', text: prompt });
    if (turnaroundUrls.length > 0) {
      content.push({ type: 'image_url', image_url: { url: turnaroundUrls[0] }, role: 'reference_image' });
    }
    content.push({ type: 'video_url', video_url: { url: motionRef }, role: 'reference_video' });
  } else if (startUrl && endUrl) {
    // First + Last frame
    content.push({ type: 'text', text: prompt });
    content.push({ type: 'image_url', image_url: { url: startUrl }, role: 'first_frame' });
    content.push({ type: 'image_url', image_url: { url: endUrl },   role: 'last_frame' });
  } else if (startUrl) {
    // Solo first frame
    content.push({ type: 'text', text: prompt });
    content.push({ type: 'image_url', image_url: { url: startUrl }, role: 'first_frame' });
  } else {
    // Solo texto
    content.push({ type: 'text', text: prompt });
  }

  const body = {
    model:   byteplusModel,
    content,
    parameters: {
      watermark: removeWatermark ? false : true,
      ratio:     aspectRatio === '9:16' ? '9:16' : aspectRatio === '1:1' ? '1:1' : '16:9',
      duration:  Math.min(Math.max(durationSeconds || 5, 4), 15),
    },
  };

  // Enrutar a través del proxy backend (evita CORS del browser).
  // Mismo patrón que generateWithVeo → /api/veo/generate.
  const serverUrl = process.env.REACT_APP_SERVER_URL || '';

  const res = await fetch(`${serverUrl}/api/byteplus/generate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ body, apiKey }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`BytePlus SeedDance API error: ${err?.error || err?.message || res.status}`);
  }

  const data    = await res.json();
  const taskId  = data?.task_id || data?.id;
  if (!taskId) throw new Error('BytePlus SeedDance returned no task ID');

  // Poll task status via proxy
  const { videoUrl } = await pollUntilDone(async () => {
    const pollRes  = await fetch(`${serverUrl}/api/byteplus/poll`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ taskId, apiKey }),
    });
    const pollData = await pollRes.json();
    const status   = pollData?.status;

    if (status === 'succeeded' || status === 'completed') {
      const url = pollData?.output?.video_url || pollData?.video_url;
      if (!url) throw new Error('BytePlus SeedDance returned no video URL');
      return { done: true, videoUrl: url };
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`BytePlus SeedDance failed: ${pollData?.error?.message || 'Unknown error'}`);
    }
    return { done: false };
  }, 10000, 48);

  return videoUrl;
}

// ─── SEEDDANCE 2.0 — PiAPI (intermediario) ────────────────────
//
// Watermark: el video sale con watermark por defecto.
// Si removeWatermark=true, se encadena un task "remove-watermark" ($0.008/s).
// Modelos: seedance-2 (Pro $0.13/s) o seedance-2-fast ($0.10/s)
//
async function generateWithSeedDancePiAPI({ prompt, startUrl, endUrl, turnaround, motionRef, aspectRatio, durationSeconds, removeWatermark, piapiModel = 'pro' }) {
  const apiKey = await resolveKey('piapi_api_key', 'REACT_APP_PIAPI_API_KEY');
  if (!apiKey) throw new Error('PiAPI key no configurada. Agrégala en Ajustes → API Keys.');

  const BASE     = 'https://api.piapi.ai/api/v1/task';
  const taskType = piapiModel === 'fast' ? 'seedance-2-fast' : 'seedance-2';

  // Construir input según modo
  let mode;
  const input = {
    aspect_ratio: aspectRatio === '9:16' ? '9:16' : aspectRatio === '1:1' ? '1:1' : '16:9',
    duration:     Math.min(Math.max(durationSeconds || 5, 4), 15),
  };

  if (motionRef) {
    // Omni reference: @image1 y @video1 en el prompt
    mode = 'omni_reference';
    const turnaroundUrls = Object.values(turnaround || {}).filter(Boolean);
    if (turnaroundUrls.length > 0) {
      input.prompt = `@image1 ${prompt}. Follow @video1 camera movement and style.`;
      input.image1 = turnaroundUrls[0];
    } else {
      input.prompt = `${prompt}. Follow @video1 camera movement and style.`;
    }
    input.video1 = motionRef;
  } else if (startUrl && endUrl) {
    // First + Last frame
    mode = 'first_last_frames';
    input.prompt            = prompt;
    input.first_frame_image = startUrl;
    input.last_frame_image  = endUrl;
  } else if (startUrl) {
    // Solo first frame — PiAPI acepta first_last_frames con solo first_frame_image
    mode = 'first_last_frames';
    input.prompt            = prompt;
    input.first_frame_image = startUrl;
  } else {
    // Solo texto
    mode = 'text_to_video';
    input.prompt = prompt;
  }

  input.mode = mode;

  const res = await fetch(BASE, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key':    apiKey,
    },
    body: JSON.stringify({
      model:     'Qingying',
      task_type: taskType,
      input,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`PiAPI SeedDance error: ${err?.message || err?.error?.message || res.status}`);
  }

  const data   = await res.json();
  const taskId = data?.data?.task_id || data?.task_id;
  if (!taskId) throw new Error('PiAPI returned no task ID');

  // Poll task status
  const { videoUrl } = await pollUntilDone(async () => {
    const pollRes  = await fetch(`${BASE}/${taskId}`, {
      headers: { 'X-API-Key': apiKey },
    });
    const pollData = await pollRes.json();
    const status   = pollData?.data?.status || pollData?.status;

    if (status === 'completed' || status === 'succeed') {
      const url = pollData?.data?.output?.video_url
               || pollData?.output?.video_url;
      if (!url) throw new Error('PiAPI returned no video URL');
      return { done: true, videoUrl: url };
    }
    if (status === 'failed' || status === 'error') {
      throw new Error(`PiAPI SeedDance failed: ${pollData?.data?.error?.message || 'Unknown error'}`);
    }
    return { done: false };
  }, 10000, 48);

  // Encadenar remove-watermark si el usuario lo activó
  if (removeWatermark) {
    return _removePiAPIWatermark(apiKey, taskId, videoUrl);
  }

  return videoUrl;
}

// Helper: quita el watermark de un video de PiAPI vía task "remove-watermark"
// Si el task falla devuelve el video original sin lanzar error — no bloquea la entrega.
async function _removePiAPIWatermark(apiKey, sourceTaskId, fallbackUrl) {
  const BASE = 'https://api.piapi.ai/api/v1/task';

  try {
    const res = await fetch(BASE, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key':    apiKey,
      },
      body: JSON.stringify({
        model:     'Qingying',
        task_type: 'remove-watermark',
        input:     { task_id: sourceTaskId },
      }),
    });

    if (!res.ok) {
      console.warn('[PiAPI] remove-watermark request failed — entregando video con watermark');
      return fallbackUrl;
    }

    const data   = await res.json();
    const wmTask = data?.data?.task_id || data?.task_id;
    if (!wmTask) return fallbackUrl;

    const { videoUrl } = await pollUntilDone(async () => {
      const pollRes  = await fetch(`${BASE}/${wmTask}`, {
        headers: { 'X-API-Key': apiKey },
      });
      const pollData = await pollRes.json();
      const status   = pollData?.data?.status || pollData?.status;

      if (status === 'completed' || status === 'succeed') {
        const url = pollData?.data?.output?.video_url || pollData?.output?.video_url;
        return { done: true, videoUrl: url || fallbackUrl };
      }
      if (status === 'failed' || status === 'error') {
        console.warn('[PiAPI] remove-watermark task failed — entregando video con watermark');
        return { done: true, videoUrl: fallbackUrl };
      }
      return { done: false };
    }, 8000, 30);

    return videoUrl;

  } catch (e) {
    console.warn('[PiAPI] remove-watermark error:', e.message);
    return fallbackUrl;
  }
}

// ─── NODE CLASS ───────────────────────────────────────────────
export class VideoRenderNode extends CinematicNode {
  constructor(config = {}) {
    super({
      type:     'VIDEO_RENDER',
      name:     'Video Render',
      // VideoRenderNode no tiene inputs del DAG que necesiten completarse —
      // sus datos vienen de la configuración directa (startUrl, endUrl, etc.)
      inputs:   [],
      ...config,
    });

    const p = config.parameters || {};
    this.mediaProvider   = config.mediaProvider   || p.mediaProvider   || 'veo';
    this.startUrl        = config.startUrl        || p.startUrl        || null;
    this.endUrl          = config.endUrl          || p.endUrl          || null;
    this.turnaround      = config.turnaround      || p.turnaround      || {};
    this.motionRef       = config.motionRef       || p.motionRef       || null;
    this.action          = config.action          || p.action          || '';
    this.frameMode       = config.frameMode       || p.frameMode       || 'exact';
    this.characters      = config.characters      || p.characters      || [];
    this.aspectRatio     = config.aspectRatio     || p.aspectRatio     || '16:9';
    this.durationSeconds = config.durationSeconds || p.durationSeconds || 8;
    this._prompt         = config.prompt          || p.prompt          || null;
    // Watermark: aplica a seeddance_byteplus (nativo) y seeddance_piapi (encadenado)
    // Para AIMLAPI seeddance, se ignora silenciosamente
    this.removeWatermark = config.removeWatermark ?? p.removeWatermark ?? false;
    this.piapiModel      = config.piapiModel      || p.piapiModel      || 'pro';
  }

  // canExecute siempre true — no depende de otros nodos del DAG
  canExecute() {
    return true;
  }

  // ── process() — método estándar del DAG ────────────────────
  async process(context = {}) {
    // El prompt puede venir: (1) config directa, (2) context.prompt,
    // (3) resultado de PromptBuilderNode si se conectó al DAG
    const promptFromInputs = this.inputs
      .map(n => n.result?.promptOptimized || n.result?.prompt)
      .find(Boolean);

    const prompt = this._prompt
               ||  context.prompt
               ||  promptFromInputs;

    if (!prompt) throw new Error('VideoRenderNode: falta el prompt. Ejecuta el DAG de prompts primero.');

    return this._renderWithProvider(prompt);
  }

  // ── API pública directa (sin pasar por el DAG) ─────────────
  // Usada en DaruStudio cuando el usuario hace clic en "Generar video"
  async render(prompt) {
    if (!prompt) throw new Error('VideoRenderNode.render(): falta el prompt.');
    this._prompt = prompt;
    return this._renderWithProvider(prompt);
  }

  // ── Lógica interna compartida ───────────────────────────────
  async _renderWithProvider(prompt) {
    // Enriquecer el prompt con la acción del usuario y modo exacto
    let finalPrompt = prompt;

    if (this.action && this.action.trim()) {
      finalPrompt = `${this.action.trim()}. ${finalPrompt}`;
    }

    if (this.frameMode === 'exact') {
      finalPrompt += ' CRITICAL: Maintain the exact visual appearance, colors, composition, and details of the provided first and last frames. Do not alter, replace, or hallucinate any element that appears in those frames. The video must start exactly as the first frame and end exactly as the last frame.';
    }

    // Recopilar imágenes de personajes — PRINCIPAL primero, luego secundarios
    // El sujeto principal ocupa los primeros slots del turnaround (front/3q/profile)
    // Los secundarios llenan los slots restantes
    const principal   = this.characters.filter(c => c.role === 'principal');
    const secundarios = this.characters.filter(c => c.role !== 'principal' && c.role !== 'extra');
    const ordered     = [...principal, ...secundarios];

    const mergedTurnaround = { ...this.turnaround };
    const slots = ['front', 'three_quarter', 'profile'];
    let slotIdx = 0;
    for (const char of ordered) {
      for (const view of ['front', 'three_quarter', 'profile']) {
        const url = char.images?.[view];
        if (url && slotIdx < slots.length && !mergedTurnaround[slots[slotIdx]]) {
          mergedTurnaround[slots[slotIdx]] = url;
          slotIdx++;
        }
      }
    }

    const shared = {
      prompt: finalPrompt,
      startUrl:        this.startUrl,
      endUrl:          this.endUrl,
      turnaround:      mergedTurnaround,
      motionRef:       this.motionRef,
      frameMode:       this.frameMode,
      aspectRatio:     this.aspectRatio,
      durationSeconds: this.durationSeconds,
      removeWatermark: this.removeWatermark,
      piapiModel:      this.piapiModel,
    };

    let videoUrl;

    switch (this.mediaProvider) {
      case PROVIDERS.veo:
        videoUrl = await generateWithVeo(shared);
        break;
      case PROVIDERS.kling:
        videoUrl = await generateWithKling(shared);
        break;
      case PROVIDERS.seeddance:
        videoUrl = await generateWithSeedDance(shared);
        break;
      case PROVIDERS.seeddance_byteplus:
        videoUrl = await generateWithSeedDanceBytePlus(shared);
        break;
      case PROVIDERS.seeddance_byteplus_15:
        // SeedDance 1.5 Pro — mismo endpoint BytePlus, sin reference_video
        videoUrl = await generateWithSeedDanceBytePlus({
          ...shared,
          motionRef:    null,  // 1.5 no soporta reference_video
          byteplusModel: 'seedance-1-5-pro-251215',
        });
        break;
      case PROVIDERS.seeddance_piapi:
        videoUrl = await generateWithSeedDancePiAPI(shared);
        break;
      default:
        throw new Error(`Proveedor de video desconocido: ${this.mediaProvider}`);
    }

    return {
      videoUrl,
      provider:        this.mediaProvider,
      prompt,
      startUrl:        this.startUrl,
      endUrl:          this.endUrl,
      turnaroundCount: Object.values(this.turnaround || {}).filter(Boolean).length,
      hasMotionRef:    !!this.motionRef,
      aspectRatio:     this.aspectRatio,
      durationSeconds: this.durationSeconds,
    };
  }
}

// ─── COST ESTIMATES (por segundo de video) ────────────────────
export const PROVIDER_COSTS = {
  veo: {
    name:          'Veo 3.1',
    perSecond:     0.35,
    supportsFirst: true,
    supportsLast:  true,
    supportsRef:   true,  // hasta 3 reference images
    maxDuration:   8,
    note:          'Best cinematic quality. 8s max with reference images.',
  },
  kling: {
    name:          'Kling 3.0 Pro',
    perSecond:     0.112,
    supportsFirst: true,
    supportsLast:  true,
    supportsRef:   false,
    maxDuration:   15,
    note:          'Best value. Multi-shot up to 15s. Native audio.',
  },
  seeddance: {
    name:          'SeedDance 2.0 (AIMLAPI)',
    perSecond:     0.02,
    supportsFirst: true,
    supportsLast:  true,
    supportsRef:   true,  // omni_reference con video de movimiento
    maxDuration:   15,
    note:          'Siempre con watermark. Motion reference.',
  },
  seeddance_byteplus: {
    name:          'SeedDance 2.0 (BytePlus)',
    perSecond:     0.09,  // ~$0.09/s ByteDance directo
    supportsFirst: true,
    supportsLast:  true,
    supportsRef:   true,  // omni_reference
    maxDuration:   15,
    note:          'Sin watermark nativo. ByteDance directo.',
  },
  seeddance_byteplus_15: {
    name:          'SeedDance 1.5 Pro — BytePlus',
    perSecond:     0.02,
    supportsFirst: true,
    supportsLast:  true,
    supportsRef:   true,  // reference_image (sin reference_video)
    maxDuration:   15,
    note:          'BytePlus directo. Créditos gratuitos.',
  },
  seeddance_piapi: {
    name:          'SeedDance 2.0 (PiAPI Pro)',
    perSecond:     0.13,  // Pro $0.13/s; Fast $0.10/s + $0.008/s remove-watermark
    supportsFirst: true,
    supportsLast:  true,
    supportsRef:   true,  // omni_reference
    maxDuration:   15,
    note:          'Remove-watermark $0.008/s extra. Fast mode disponible.',
  },
};

export function estimateCost(provider, durationSeconds) {
  const info = PROVIDER_COSTS[provider];
  if (!info) return 0;
  return (info.perSecond * durationSeconds).toFixed(3);
}

/**
 * Versión DB-backed del estimador de costos.
 * Lee de la tabla media_providers si está disponible,
 * usa PROVIDER_COSTS como fallback.
 */
export async function estimateCostFromDB(providerName, durationSeconds) {
  try {
    const { mediaProvidersDB } = await import('../../supabase/database');
    const provider = await mediaProvidersDB.getByName(providerName);
    if (provider?.cost_per_second) {
      return (parseFloat(provider.cost_per_second) * durationSeconds).toFixed(3);
    }
  } catch { /* fallback */ }
  return estimateCost(providerName, durationSeconds);
}

export default VideoRenderNode;