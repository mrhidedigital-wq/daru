// api/kling.js
// Vercel Serverless Function — proxy consolidado para Freepik Kling v3.
// body.action === 'generate' → inicia generación
// body.action === 'poll'     → consulta estado de tarea

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
    const { body: klingBody, apiKey } = req.body;
    if (!apiKey || !klingBody)
      return res.status(400).json({ error: 'apiKey and body are required' });

    try {
      const upstream = await fetch('https://api.freepik.com/v1/ai/video/kling-v3', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-freepik-api-key': apiKey },
        body:    JSON.stringify(klingBody),
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return res.status(upstream.status).json({ error: data?.message || upstream.statusText });
      return res.status(200).json(data);
    } catch (err) {
      console.error('[kling/generate]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── poll ───────────────────────────────────────────────────
  if (action === 'poll') {
    const { taskId, apiKey } = req.body;
    if (!taskId || !apiKey)
      return res.status(400).json({ error: 'taskId and apiKey are required' });

    try {
      const upstream = await fetch(`https://api.freepik.com/v1/ai/video/kling-v3/${taskId}`, {
        headers: { 'x-freepik-api-key': apiKey },
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return res.status(upstream.status).json({ error: data?.message || upstream.statusText });
      return res.status(200).json(data);
    } catch (err) {
      console.error('[kling/poll]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action}. Use generate or poll.` });
}
