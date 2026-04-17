// api/aimlapi.js
// Vercel Serverless Function — proxy consolidado para AIMLAPI SeedDance.
// body.action === 'generate' → inicia generación
// body.action === 'poll'     → consulta estado

export const config = { maxDuration: 300 };

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};

  // ── generate ───────────────────────────────────────────────
  if (action === 'generate') {
    const { body: aimlBody, apiKey } = req.body;
    if (!apiKey || !aimlBody)
      return res.status(400).json({ error: 'apiKey and body are required' });

    try {
      const upstream = await fetch('https://api.aimlapi.com/v2/video/generations', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body:    JSON.stringify(aimlBody),
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return res.status(upstream.status).json({ error: data?.error?.message || upstream.statusText });
      return res.status(200).json(data);
    } catch (err) {
      console.error('[aimlapi/generate]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── poll ───────────────────────────────────────────────────
  if (action === 'poll') {
    const { generationId, apiKey } = req.body;
    if (!generationId || !apiKey)
      return res.status(400).json({ error: 'generationId and apiKey are required' });

    try {
      const upstream = await fetch(
        `https://api.aimlapi.com/v2/video/generations?generation_id=${generationId}`,
        { headers: { 'Authorization': `Bearer ${apiKey}` } }
      );
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return res.status(upstream.status).json({ error: data?.error?.message || upstream.statusText });
      return res.status(200).json(data);
    } catch (err) {
      console.error('[aimlapi/poll]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action}. Use generate or poll.` });
}
