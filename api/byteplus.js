// api/byteplus.js
// Vercel Serverless Function — proxy consolidado para BytePlus Ark API.
// Soporta SeedDance 2.0 y 1.5 Pro.
// body.action === 'generate' → crea tarea de generación
// body.action === 'poll'     → consulta estado de tarea

export const config = { maxDuration: 300 };

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const BASE = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};

  // ── generate ───────────────────────────────────────────────
  if (action === 'generate') {
    const { body: byteplusBody, apiKey } = req.body;
    if (!apiKey || !byteplusBody)
      return res.status(400).json({ error: 'apiKey and body are required' });

    try {
      const upstream = await fetch(BASE, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(byteplusBody),
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return res.status(upstream.status).json({ error: data?.error?.message || data?.message || upstream.statusText });
      return res.status(200).json(data);
    } catch (err) {
      console.error('[byteplus/generate]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── poll ───────────────────────────────────────────────────
  if (action === 'poll') {
    const { taskId, apiKey } = req.body;
    if (!taskId || !apiKey)
      return res.status(400).json({ error: 'taskId and apiKey are required' });

    try {
      const upstream = await fetch(`${BASE}/${taskId}`, {
        method:  'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return res.status(upstream.status).json({ error: data?.error?.message || data?.message || upstream.statusText });
      return res.status(200).json(data);
    } catch (err) {
      console.error('[byteplus/poll]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action}. Use generate or poll.` });
}
