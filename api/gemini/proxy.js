// api/gemini/proxy.js
// Vercel Serverless Function — proxy seguro para Gemini image generation.
// El frontend envía el body completo (contents + generationConfig)
// y este handler añade la API key del servidor antes de reenviar a Google.
//
// Env vars necesarias en Vercel:
//   GEMINI_API_KEY             → clave de servidor, nunca expuesta al browser
//   (opcional) SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY → leer key de la BD

export const config = { maxDuration: 60 };

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ─── Leer Gemini key desde Supabase con fallback a env ────────
async function getGeminiKey() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceKey) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/api_keys?key_name=eq.gemini_api_key&select=key_value`,
        {
          headers: {
            apikey:        serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        }
      );
      const rows = await res.json().catch(() => []);
      if (rows?.[0]?.key_value) return rows[0].key_value;
    }
  } catch { /* fallback */ }

  return process.env.GEMINI_API_KEY || null;
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { contents, generationConfig, model } = req.body || {};

  if (!contents || !generationConfig)
    return res.status(400).json({ error: 'contents and generationConfig are required' });

  const apiKey = await getGeminiKey();
  if (!apiKey)
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });

  const modelId = model || 'gemini-2.5-flash-preview-04-17';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  try {
    const upstream = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contents, generationConfig }),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      console.error('[gemini/proxy]', upstream.status, data?.error?.message);
      return res
        .status(upstream.status)
        .json({ error: data?.error?.message || upstream.statusText });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('[gemini/proxy]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
