// api/video/finalize.js
// Vercel Serverless Function — descarga, normaliza y sube video a Supabase.
// Body: { gcsUri?, videoUrl?, accessToken?, targetDurationSeconds? }
//
// NOTA: requiere FFmpeg disponible en el entorno de ejecución.
// En Vercel se puede añadir la capa "ffmpeg" mediante vercel-ffmpeg o
// incluyendo el binario en el directorio api/.

export const config = { maxDuration: 300 };

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import { exec } from 'child_process';
import { createClient } from '@supabase/supabase-js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const supabase = createClient(
  process.env.SUPABASE_URL            || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY,
);

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

function runFfmpeg(cmd, timeout = 300000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout, maxBuffer: 50 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || stdout || error.message));
      else resolve({ stdout, stderr });
    });
  });
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { gcsUri, videoUrl, accessToken, targetDurationSeconds } = req.body;

  if (!gcsUri && !videoUrl)
    return res.status(400).json({ error: 'gcsUri or videoUrl is required' });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'daru-finalize-'));

  try {
    const inputPath = path.join(tmpDir, 'input.bin');
    await downloadSourceToFile({ gcsUri, videoUrl, accessToken, outputPath: inputPath });

    const normalizedPath = path.join(tmpDir, 'normalized.mp4');
    const trimSeconds    = Number(targetDurationSeconds || 0);

    const ffmpegCmd = trimSeconds > 0
      ? `ffmpeg -y -i "${inputPath}" -t ${trimSeconds} -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 192k "${normalizedPath}"`
      : `ffmpeg -y -i "${inputPath}" -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 192k "${normalizedPath}"`;

    await runFfmpeg(ffmpegCmd, 300000);

    if (!fs.existsSync(normalizedPath))
      throw new Error('FFmpeg did not produce a finalized output');

    const fileBuffer   = fs.readFileSync(normalizedPath);
    const storagePath  = `renders/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;

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

    const stats = fs.statSync(normalizedPath);

    return res.status(200).json({
      success:          true,
      url:              urlData.publicUrl,
      storagePath,
      fileSizeMB:       (stats.size / 1024 / 1024).toFixed(2),
      trimmedToSeconds: trimSeconds || null,
    });
  } catch (err) {
    console.error('[video/finalize]', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}
