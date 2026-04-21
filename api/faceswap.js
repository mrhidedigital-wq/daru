// api/faceswap.js
// Vercel Serverless Function — face swap profesional via Replicate (codeplugtech/face-swap).
// body.action === 'swap' → sube imágenes y crea predicción (Prefer: wait=30)
// body.action === 'poll' → consulta estado de predicción en curso

export const config = { maxDuration: 120 };

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ─── Supabase key lookup ──────────────────────────────────────
async function getReplicateKey() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceKey) {
      const r = await fetch(
        `${supabaseUrl}/rest/v1/api_keys?key_name=eq.replicate_api_key&select=key_value`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      const rows = await r.json().catch(() => []);
      if (rows?.[0]?.key_value) return rows[0].key_value;
    }
  } catch { /* fallback */ }
  return process.env.REPLICATE_API_KEY || null;
}

// ─── Upload base64 image to Replicate Files API ───────────────
async function uploadToReplicate(base64, token) {
  const mimeType   = base64.startsWith('data:') ? base64.split(';')[0].split(':')[1] : 'image/jpeg';
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  const buffer     = Buffer.from(base64Data, 'base64');

  const form = new FormData();
  form.append('content', new Blob([buffer], { type: mimeType }), 'image.jpg');

  const res = await fetch('https://api.replicate.com/v1/files', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
    body:    form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Replicate upload failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.urls?.get || data.url;
}

// ─── Download output URL to base64 ───────────────────────────
async function base64FromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download result: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const ct     = res.headers.get('content-type') || 'image/jpeg';
  return `data:${ct};base64,${Buffer.from(buffer).toString('base64')}`;
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};

  // ── swap ───────────────────────────────────────────────────
  if (action === 'swap') {
    const { targetImageBase64, sourceImageBase64 } = req.body;
    if (!targetImageBase64 || !sourceImageBase64)
      return res.status(400).json({ error: 'targetImageBase64 and sourceImageBase64 are required' });

    const token = await getReplicateKey();
    if (!token)
      return res.status(400).json({ error: 'replicate_api_key no configurada. Agrégala en Ajustes → API Keys.' });

    try {
      const [targetUrl, sourceUrl] = await Promise.all([
        uploadToReplicate(targetImageBase64, token),
        uploadToReplicate(sourceImageBase64, token),
      ]);

      const predRes = await fetch('https://api.replicate.com/v1/models/codeplugtech/face-swap/predictions', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'Authorization':     `Bearer ${token}`,
          'Prefer':            'wait=30',
          'Replicate-Version': 'latest',
        },
        body: JSON.stringify({
          input: {
            target_image: targetUrl,  // escena — donde va la cara
            swap_image:   sourceUrl,  // cara del usuario
          },
        }),
      });

      const pred = await predRes.json().catch(() => ({}));
      if (!predRes.ok)
        return res.status(predRes.status).json({ error: pred.detail || pred.error || predRes.statusText });

      if (pred.status === 'succeeded' && pred.output) {
        const imageBase64 = await base64FromUrl(pred.output);
        return res.status(200).json({ imageBase64 });
      }

      if (pred.status === 'failed')
        return res.status(200).json({ error: pred.error || 'Face swap failed' });

      return res.status(200).json({ predictionId: pred.id, status: pred.status });

    } catch (err) {
      console.error('[faceswap/swap]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── poll ───────────────────────────────────────────────────
  if (action === 'poll') {
    const { predictionId } = req.body;
    if (!predictionId)
      return res.status(400).json({ error: 'predictionId is required' });

    const token = await getReplicateKey();
    if (!token)
      return res.status(400).json({ error: 'replicate_api_key no configurada. Agrégala en Ajustes → API Keys.' });

    try {
      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const pred = await pollRes.json().catch(() => ({}));
      if (!pollRes.ok)
        return res.status(pollRes.status).json({ error: pred.detail || pollRes.statusText });

      if (pred.status === 'succeeded' && pred.output) {
        const imageBase64 = await base64FromUrl(pred.output);
        return res.status(200).json({ imageBase64, status: 'succeeded' });
      }

      if (pred.status === 'failed')
        return res.status(200).json({ status: 'failed', error: pred.error || 'Face swap failed' });

      return res.status(200).json({ status: pred.status, predictionId: pred.id });

    } catch (err) {
      console.error('[faceswap/poll]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action}. Use swap or poll.` });
}
