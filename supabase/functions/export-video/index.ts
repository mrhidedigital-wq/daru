// supabase/functions/export-video/index.ts
// Supabase Edge Function — concatena videos de un proyecto con ffmpeg.wasm.
// Reemplaza: POST /api/export de server.js
//
// Deploy:
//   supabase functions deploy export-video --no-verify-jwt
//
// Timeout: hasta 400 segundos (Supabase Edge Functions).
//
// ffmpeg.wasm: usa @ffmpeg/core (single-thread, sin SharedArrayBuffer).
//   WASM binaries se cargan desde unpkg en la primera invocación.
//   Subsequent calls reusan la instancia cargada (module-level singleton).
//
// Body: { projectId: string, userId: string }
// Response: { success, url, shots, fileSizeMB, storagePath }

import { createClient }          from 'npm:@supabase/supabase-js@2';
import { FFmpeg }                from 'npm:@ffmpeg/ffmpeg@0.12.10';
import { fetchFile, toBlobURL }  from 'npm:@ffmpeg/util@0.12.1';

// ─── CORS ────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function corsResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// ─── ffmpeg singleton (se carga una vez por instancia de la función) ───
let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;

  const ffmpeg = new FFmpeg();

  // Cargar core single-thread desde unpkg (sin SharedArrayBuffer)
  const BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${BASE}/ffmpeg-core.js`,   'text/javascript'),
    wasmURL: await toBlobURL(`${BASE}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

// ─── Handler ──────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return corsResponse({ error: 'Method not allowed' }, 405);
  }

  const { projectId, userId } = await req.json().catch(() => ({}));

  if (!projectId || !userId) {
    return corsResponse({ error: 'projectId and userId are required' }, 400);
  }

  // Supabase client con service role (env vars auto-provistas por Supabase)
  const supabaseUrl      = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase         = createClient(supabaseUrl, serviceRoleKey);

  console.log(`[export-video] Project: ${projectId}, User: ${userId}`);

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
      return corsResponse({ error: 'No shots with videos found in this project' }, 400);
    }

    console.log(`[export-video] ${shots.length} shots to process`);

    // 2) Cargar ffmpeg
    const ffmpeg = await getFFmpeg();

    // 3) Descargar cada video y escribirlo en el FS virtual de ffmpeg
    const inputFiles: string[] = [];

    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      if (!shot.result_video_url) continue;

      const filename = `shot_${String(i).padStart(3, '0')}.mp4`;
      console.log(`[export-video] Downloading shot ${shot.shot_number}...`);

      try {
        const fileData = await fetchFile(shot.result_video_url);
        await ffmpeg.writeFile(filename, fileData);
        inputFiles.push(filename);
      } catch (dlErr) {
        console.warn(`[export-video] Failed to download shot ${shot.shot_number}:`, dlErr);
      }
    }

    if (inputFiles.length === 0) {
      return corsResponse({ error: 'No videos could be downloaded' }, 400);
    }

    // 4) Crear concat list en el FS virtual
    const concatContent = inputFiles.map(f => `file '${f}'`).join('\n');
    await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatContent));

    // 5) Ejecutar ffmpeg concat con re-encode
    // -c:v libx264: uniformiza codec entre providers (Veo/Kling/SeedDance)
    // -pix_fmt yuv420p: compatibilidad con todos los reproductores
    // -movflags +faststart: streaming web optimizado
    console.log(`[export-video] Concatenating ${inputFiles.length} files...`);

    await ffmpeg.exec([
      '-f',         'concat',
      '-safe',      '0',
      '-i',         'concat.txt',
      '-c:v',       'libx264',
      '-preset',    'fast',
      '-crf',       '22',
      '-pix_fmt',   'yuv420p',
      '-movflags',  '+faststart',
      '-c:a',       'aac',
      '-b:a',       '192k',
      '-y',
      'output.mp4',
    ]);

    // 6) Leer el output del FS virtual
    const outputData = await ffmpeg.readFile('output.mp4') as Uint8Array;

    if (!outputData || outputData.length === 0) {
      throw new Error('ffmpeg did not produce output file');
    }

    const fileSizeMB = (outputData.length / 1024 / 1024).toFixed(2);
    console.log(`[export-video] Output: ${fileSizeMB} MB`);

    // 7) Subir a Supabase Storage
    const storagePath = `${userId}/${projectId}/export_${Date.now()}.mp4`;

    const { error: uploadErr } = await supabase.storage
      .from('project-exports')
      .upload(storagePath, outputData, {
        contentType:  'video/mp4',
        cacheControl: '3600',
        upsert:       false,
      });

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

    const { data: urlData } = supabase.storage
      .from('project-exports')
      .getPublicUrl(storagePath);

    // 8) Actualizar status del proyecto
    await supabase
      .from('projects')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .catch(() => { /* no crítico */ });

    // 9) Limpiar FS virtual de ffmpeg
    for (const f of [...inputFiles, 'concat.txt', 'output.mp4']) {
      await ffmpeg.deleteFile(f).catch(() => {});
    }

    console.log(`[export-video] ✓ Done: ${urlData.publicUrl}`);

    return corsResponse({
      success:    true,
      url:        urlData.publicUrl,
      shots:      shots.length,
      fileSizeMB,
      storagePath,
    });

  } catch (err) {
    console.error('[export-video] Error:', err.message);
    return corsResponse({ error: err.message }, 500);
  }
});
