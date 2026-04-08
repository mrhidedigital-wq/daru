// server.js
// Backend Express para DARU Studio.
// Endpoints:
//   POST /api/export      — concatena videos en MP4
//   POST /api/veo/generate — proxy Vertex AI (evita CORS)
//   POST /api/veo/poll     — proxy polling Vertex AI
//
// Uso:
//   node server.js  (lee .env automáticamente con dotenv)

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const { execSync, exec } = require('child_process');
const { createClient }   = require('@supabase/supabase-js');

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ── Supabase (service role para acceso completo) ─────────────
const supabase = createClient(
  process.env.SUPABASE_URL            || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY,
);

// ── Health check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  // Verificar que FFmpeg está disponible
  let ffmpegVersion = 'not found';
  try {
    ffmpegVersion = execSync('ffmpeg -version', { encoding: 'utf8' }).split('\n')[0];
  } catch { /* ffmpeg not installed */ }

  res.json({
    status:  'ok',
    ffmpeg:  ffmpegVersion,
    uptime:  process.uptime(),
  });
});



function parseGsUri(gsUri) {
  const match = /^gs:\/\/([^/]+)\/(.+)$/.exec(gsUri || '');
  if (!match) throw new Error(`Invalid gs:// URI: ${gsUri}`);
  return { bucket: match[1], objectPath: match[2] };
}

async function downloadSourceToFile({ gcsUri, videoUrl, accessToken, outputPath }) {
  let response;

  if (gcsUri) {
    if (!accessToken) throw new Error('accessToken is required to download a gs:// source');
    const { bucket, objectPath } = parseGsUri(gcsUri);
    const downloadUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media`;
    response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } else if (videoUrl?.startsWith('data:video/')) {
    const [, mimePart = 'video/mp4', b64 = ''] = videoUrl.match(/^data:([^;]+);base64,(.+)$/) || [];
    if (!b64) throw new Error('Invalid video data URL');
    fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'));
    return { mimeType: mimePart, localPath: outputPath };
  } else if (videoUrl) {
    response = await fetch(videoUrl);
  } else {
    throw new Error('Either gcsUri or videoUrl is required');
  }

  if (!response.ok) {
    throw new Error(`Failed to download source video: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
  return {
    mimeType: response.headers.get('content-type') || 'video/mp4',
    localPath: outputPath,
  };
}

async function runFfmpeg(cmd, timeout = 300000) {
  return await new Promise((resolve, reject) => {
    exec(cmd, { timeout, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function uploadOutputToSupabase(localPath, keyPrefix = 'renders') {
  const fileBuffer = fs.readFileSync(localPath);
  const storagePath = `${keyPrefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;

  const { error: uploadErr } = await supabase.storage
    .from('project-exports')
    .upload(storagePath, fileBuffer, {
      contentType: 'video/mp4',
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

  const { data: urlData } = supabase.storage
    .from('project-exports')
    .getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: urlData.publicUrl,
  };
}

// ── POST /api/export ─────────────────────────────────────────
// Body: { projectId, userId }
// Proceso:
//   1. Obtiene los shots del proyecto ordenados por shot_number
//   2. Descarga cada video a /tmp
//   3. Crea un concat file para FFmpeg
//   4. Ejecuta: ffmpeg -f concat -i list.txt -c copy output.mp4
//   5. Sube output.mp4 a Supabase Storage bucket "project-exports"
//   6. Devuelve la URL pública del export
// ─────────────────────────────────────────────────────────────

app.post('/api/export', async (req, res) => {
  const { projectId, userId } = req.body;

  if (!projectId || !userId) {
    return res.status(400).json({ error: 'projectId and userId are required' });
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `daru-export-${projectId}-`));

  try {
    // 1) Obtener shots con video
    const { data: shots, error: shotsErr } = await supabase
      .from('shots')
      .select('id, shot_number, result_video_url, duration_seconds')
      .eq('project_id', projectId)
      .not('result_video_url', 'is', null)
      .order('shot_number', { ascending: true });

    if (shotsErr) throw new Error(`DB error: ${shotsErr.message}`);
    if (!shots || shots.length === 0) {
      return res.status(400).json({ error: 'No shots with videos found in this project' });
    }

    console.log(`[export] Project ${projectId}: ${shots.length} shots to concatenate`);

    // 2) Descargar cada video
    const videoPaths = [];
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const url  = shot.result_video_url;

      if (!url) continue;

      const ext      = url.includes('.webm') ? 'webm' : 'mp4';
      const filePath = path.join(tmpDir, `shot_${String(i).padStart(3, '0')}.${ext}`);

      console.log(`[export] Downloading shot ${shot.shot_number}: ${url.substring(0, 80)}...`);

      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[export] Failed to download shot ${shot.shot_number}: ${response.status}`);
        continue;
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(filePath, buffer);

      // Si es webm, convertir a mp4 primero (FFmpeg concat requiere mismo codec)
      if (ext === 'webm') {
        const mp4Path = filePath.replace('.webm', '.mp4');
        execSync(`ffmpeg -i "${filePath}" -c:v libx264 -preset fast -crf 23 -y "${mp4Path}"`, {
          timeout: 60000,
        });
        fs.unlinkSync(filePath);
        videoPaths.push(mp4Path);
      } else {
        videoPaths.push(filePath);
      }
    }

    if (videoPaths.length === 0) {
      return res.status(400).json({ error: 'No videos could be downloaded' });
    }

    // 3) Crear concat list file
    // FFmpeg necesita un archivo con la lista de videos a concatenar:
    //   file 'shot_000.mp4'
    //   file 'shot_001.mp4'
    //   ...
    const concatListPath = path.join(tmpDir, 'concat.txt');
    const concatContent  = videoPaths.map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);

    // 4) Re-encode para asegurar compatibilidad (los providers pueden usar codecs distintos)
    const outputPath = path.join(tmpDir, 'export_final.mp4');

    console.log(`[export] Concatenating ${videoPaths.length} videos...`);

    await new Promise((resolve, reject) => {
      const cmd = `ffmpeg -f concat -safe 0 -i "${concatListPath}" -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -movflags +faststart -y "${outputPath}"`;

      exec(cmd, { timeout: 300000 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[export] FFmpeg error:`, stderr);
          reject(new Error(`FFmpeg failed: ${error.message}`));
        } else {
          resolve();
        }
      });
    });

    // Verificar que se creó el archivo
    if (!fs.existsSync(outputPath)) {
      throw new Error('FFmpeg did not produce output file');
    }

    const stats = fs.statSync(outputPath);
    console.log(`[export] Output: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // 5) Subir a Supabase Storage
    const fileBuffer  = fs.readFileSync(outputPath);
    const storagePath = `${userId}/${projectId}/export_${Date.now()}.mp4`;

    const { error: uploadErr } = await supabase.storage
      .from('project-exports')
      .upload(storagePath, fileBuffer, {
        contentType:  'video/mp4',
        cacheControl: '3600',
        upsert:       false,
      });

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    // 6) Obtener URL pública
    const { data: urlData } = supabase.storage
      .from('project-exports')
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // 7) Actualizar proyecto con URL del export
    try {
      await supabase
        .from('projects')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', projectId);
    } catch {}

    console.log(`[export] ✓ Done: ${publicUrl}`);

    res.json({
      success:      true,
      url:          publicUrl,
      shots:        shots.length,
      fileSizeMB:   (stats.size / 1024 / 1024).toFixed(2),
      storagePath,
    });

  } catch (err) {
    console.error(`[export] Error:`, err.message);
    res.status(500).json({ error: err.message });
  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* ignore cleanup errors */ }
  }
});


// ── POST /api/video/finalize ────────────────────────────────
// Descarga un video desde gs:// o URL, opcionalmente lo recorta,
// lo normaliza a MP4 browser-friendly y lo sube a Supabase Storage.
// Body: { gcsUri?, videoUrl?, accessToken?, targetDurationSeconds? }
// ─────────────────────────────────────────────────────────────

app.post('/api/video/finalize', async (req, res) => {
  const { gcsUri, videoUrl, accessToken, targetDurationSeconds } = req.body;

  if (!gcsUri && !videoUrl) {
    return res.status(400).json({ error: 'gcsUri or videoUrl is required' });
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daru-finalize-'));

  try {
    const inputPath = path.join(tmpDir, 'input.bin');
    await downloadSourceToFile({ gcsUri, videoUrl, accessToken, outputPath: inputPath });

    const normalizedPath = path.join(tmpDir, 'normalized.mp4');
    const trimSeconds = Number(targetDurationSeconds || 0);

    const ffmpegCmd = trimSeconds > 0
      ? `ffmpeg -y -i "${inputPath}" -t ${trimSeconds} -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 192k "${normalizedPath}"`
      : `ffmpeg -y -i "${inputPath}" -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 192k "${normalizedPath}"`;

    await runFfmpeg(ffmpegCmd, 300000);

    if (!fs.existsSync(normalizedPath)) {
      throw new Error('FFmpeg did not produce a finalized output');
    }

    const uploaded = await uploadOutputToSupabase(normalizedPath, 'renders');
    const stats = fs.statSync(normalizedPath);

    res.json({
      success: true,
      url: uploaded.publicUrl,
      storagePath: uploaded.storagePath,
      fileSizeMB: (stats.size / 1024 / 1024).toFixed(2),
      trimmedToSeconds: trimSeconds || null,
    });
  } catch (err) {
    console.error('[video/finalize] Error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

// ── POST /api/veo/generate ──────────────────────────────────
// Proxy para Veo 3.1 via Vertex AI (evita CORS del browser)
// Body: { body, projectId, accessToken }
// ─────────────────────────────────────────────────────────────

app.post('/api/veo/generate', async (req, res) => {
  const { body: veoBody, projectId, accessToken } = req.body;

  if (!projectId || !accessToken || !veoBody) {
    return res.status(400).json({ error: 'projectId, accessToken, and body are required' });
  }

  try {
    // ⚠️ Migrado de veo-3.1-generate-preview (deprecated 2 abril 2026) al endpoint GA
    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/veo-3.1-generate-001:predictLongRunning`;

    console.log(`[veo] Starting video generation for project ${projectId}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(veoBody),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error(`[veo] Generate error:`, err);
      return res.status(response.status).json({ error: err?.error?.message || response.statusText });
    }

    const operation = await response.json();
    console.log(`[veo] Operation started: ${operation.name}`);
    res.json(operation);

  } catch (err) {
    console.error(`[veo] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});


// ── POST /api/veo/extend ────────────────────────────────────
// Proxy para Veo Extend via Vertex AI (misma mecánica que generate)
// Body: { body, projectId, accessToken }
// ─────────────────────────────────────────────────────────────

app.post('/api/veo/extend', async (req, res) => {
  const { body: veoBody, projectId, accessToken } = req.body;

  if (!projectId || !accessToken || !veoBody) {
    return res.status(400).json({ error: 'projectId, accessToken, and body are required' });
  }

  try {
    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/veo-3.1-generate-001:predictLongRunning`;

    console.log(`[veo] Starting video extension for project ${projectId}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(veoBody),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[veo] Extend error:', err);
      return res.status(response.status).json({ error: err?.error?.message || response.statusText });
    }

    const operation = await response.json();
    console.log(`[veo] Extend operation started: ${operation.name}`);
    res.json(operation);
  } catch (err) {
    console.error('[veo] Extend proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/veo/poll ──────────────────────────────────────
// Proxy para polling de operación Veo
// Body: { operationName, projectId, accessToken }
// ─────────────────────────────────────────────────────────────

app.post('/api/veo/poll', async (req, res) => {
  const { operationName, accessToken } = req.body;

  if (!operationName || !accessToken) {
    return res.status(400).json({ error: 'operationName and accessToken are required' });
  }

  try {
    // Vertex AI usa fetchPredictOperation para polling — NO un GET directo a la operación
    // Extraer projectId y modelId del operationName:
    // "projects/PROJECT/locations/us-central1/publishers/google/models/MODEL/operations/OP_ID"
    const parts = operationName.match(/^(projects\/[^/]+\/locations\/[^/]+\/publishers\/[^/]+\/models\/[^/]+)\/operations\/(.+)$/);
    
    if (!parts) {
      console.error(`[veo] Invalid operationName format: ${operationName}`);
      return res.status(400).json({ error: 'Invalid operationName format' });
    }

    const modelPath = parts[1]; // projects/.../models/MODEL
    const fetchUrl = `https://us-central1-aiplatform.googleapis.com/v1/${modelPath}:fetchPredictOperation`;

    console.log(`[veo] Polling via fetchPredictOperation: ${fetchUrl.substring(0, 120)}...`);

    const response = await fetch(fetchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operationName }),
    });

    const data = await response.json().catch(() => ({}));
    console.log(`[veo] Poll response status: ${response.status}, done: ${data.done}, keys: ${Object.keys(data).join(',')}`);

    if (!response.ok) {
      const errorMsg = data?.error?.message || response.statusText;
      console.error(`[veo] Google API error: ${response.status} — ${errorMsg}`);
      return res.status(502).json({ 
        error: errorMsg, 
        googleStatus: response.status,
        hint: response.status === 401 ? 'Access token expired. Run: gcloud auth print-access-token' : undefined
      });
    }

    res.json(data);

  } catch (err) {
    console.error(`[veo] Poll error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/llm/complete ──────────────────────────────────
// Proxy seguro para LLM providers — las claves NUNCA llegan al browser.
// Body: { provider, model?, system?, prompt, temperature?, max_tokens? }
// Providers soportados: 'gemini' | 'claude' | 'gpt4'
// ─────────────────────────────────────────────────────────────

async function callGemini({ model, system, prompt, temperature, max_tokens }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured on server');

  const modelId = model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  // Detectar si el prompt espera JSON para forzar el modo JSON de Gemini
  const expectsJson = prompt && (
    prompt.includes('Return JSON') ||
    prompt.includes('responde SOLO con JSON') ||
    prompt.includes('SOLO con JSON válido') ||
    prompt.includes('valid JSON only')
  );

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: temperature ?? 0.7,
      maxOutputTokens: max_tokens || 8192,
      ...(expectsJson ? { responseMimeType: 'application/json' } : {}),
    },
  };
  // thinkingBudget: 0 deshabilita el modo thinking en gemini-2.5+.
  // gemini-2.5-flash usa thinkingBudget (entero), NO thinkingLevel (string).
  const isTextModel = !modelId.includes('-image');
  const supportsThinking = isTextModel && (modelId.includes('gemini-2.5') || modelId.includes('gemini-3'));
  if (supportsThinking) {
    body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini API error ${response.status}: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const allParts = data.candidates?.[0]?.content?.parts || [];
  const textParts = allParts.filter(p => p.text != null && !p.thought);
  const text = textParts.length > 0
    ? textParts.map(p => p.text).join('')
    : (allParts.find(p => p.text != null)?.text || '');

  const tokens_input = data.usageMetadata?.promptTokenCount || 0;
  const tokens_output = data.usageMetadata?.candidatesTokenCount || 0;

  return {
    text,
    tokens_input,
    tokens_output,
    tokens_total: tokens_input + tokens_output,
    cost_usd: parseFloat(((tokens_input / 1000) * 0.00125 + (tokens_output / 1000) * 0.005).toFixed(6)),
    model: modelId,
    provider: 'gemini',
  };
}

async function callClaude({ model, system, prompt, temperature, max_tokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured on server');

  const modelId = model || 'claude-sonnet-4-20250514';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: max_tokens || 4096,
      temperature: temperature ?? 0.7,
      system: system || '',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Claude API error ${response.status}: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const tokens_input = data.usage?.input_tokens || 0;
  const tokens_output = data.usage?.output_tokens || 0;

  return {
    text,
    tokens_input,
    tokens_output,
    tokens_total: tokens_input + tokens_output,
    cost_usd: parseFloat(((tokens_input / 1000) * 0.003 + (tokens_output / 1000) * 0.015).toFixed(6)),
    model: modelId,
    provider: 'claude',
  };
}

async function callGPT4({ model, system, prompt, temperature, max_tokens }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured on server');

  const modelId = model || 'gpt-4o-mini';
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
      messages,
      max_tokens: max_tokens || 4096,
      temperature: temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`GPT-4 API error ${response.status}: ${err?.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const tokens_input = data.usage?.prompt_tokens || 0;
  const tokens_output = data.usage?.completion_tokens || 0;

  return {
    text,
    tokens_input,
    tokens_output,
    tokens_total: tokens_input + tokens_output,
    cost_usd: parseFloat(((tokens_input / 1000) * 0.000150 + (tokens_output / 1000) * 0.000600).toFixed(6)),
    model: modelId,
    provider: 'gpt4',
  };
}

const LLM_HANDLERS = { gemini: callGemini, claude: callClaude, gpt4: callGPT4 };

// ── POST /api/gemini/proxy/:model/:action? ──────────────────
// Proxy genérico para cualquier llamada directa a la Gemini API.
// Reemplaza todas las llamadas desde el frontend que incluían la API key en la URL.
// :model  → nombre del modelo, ej. "gemini-2.5-flash" o "imagen-3.0-capability-001"
// :action → acción del endpoint (default: "generateContent"). Usar "predict" para Imagen.
// El body se pasa tal cual a la API de Google.
// ─────────────────────────────────────────────────────────────
const geminiProxyHandler = async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
  }

  const { model } = req.params;
  const action = req.params.action || 'generateContent';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${action}?key=${apiKey}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (err) {
    console.error(`[gemini/proxy/${model}] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
};
app.post('/api/gemini/proxy/:model', geminiProxyHandler);
app.post('/api/gemini/proxy/:model/:action', geminiProxyHandler);

app.post('/api/llm/complete', async (req, res) => {
  const { provider, model, system, prompt, temperature, max_tokens } = req.body;

  if (!provider || !prompt) {
    return res.status(400).json({ error: 'provider and prompt are required' });
  }

  const handler = LLM_HANDLERS[provider];
  if (!handler) {
    return res.status(400).json({ error: `Unknown provider: ${provider}. Available: ${Object.keys(LLM_HANDLERS).join(', ')}` });
  }

  try {
    const result = await handler({ model, system, prompt, temperature, max_tokens });
    res.json(result);
  } catch (err) {
    console.error(`[llm/${provider}] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[DARU Server] Running on http://localhost:${PORT}`);
  console.log(`[DARU Server] Health: http://localhost:${PORT}/api/health`);
  console.log(`[DARU Server] Export: POST http://localhost:${PORT}/api/export`);
});