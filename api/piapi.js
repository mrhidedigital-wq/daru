// api/piapi.js
// Vercel Serverless Function — proxy consolidado para PiAPI (SeedDance + remove-watermark).
// body.action === 'generate' → crea tarea (también usado para remove-watermark)
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
    const { body: piapiBody, apiKey } = req.body;
    if (!apiKey || !piapiBody)
      return res.status(400).json({ error: 'apiKey and body are required' });

    try {
      const upstream = await fetch('https://api.piapi.ai/api/v1/task', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body:    JSON.stringify(piapiBody),
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return res.status(upstream.status).json({ error: data?.message || data?.error?.message || upstream.statusText });
      return res.status(200).json(data);
    } catch (err) {
      console.error('[piapi/generate]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── poll ───────────────────────────────────────────────────
  if (action === 'poll') {
    const { taskId, apiKey } = req.body;
    if (!taskId || !apiKey)
      return res.status(400).json({ error: 'taskId and apiKey are required' });

    try {
      const upstream = await fetch(`https://api.piapi.ai/api/v1/task/${taskId}`, {
        headers: { 'X-API-Key': apiKey },
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return res.status(upstream.status).json({ error: data?.message || upstream.statusText });
      return res.status(200).json(data);
    } catch (err) {
      console.error('[piapi/poll]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action}. Use generate or poll.` });
}
