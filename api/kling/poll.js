// api/kling/poll.js
// Vercel Serverless Function — polling de tarea Kling.
// Body: { taskId, apiKey }

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

  const { taskId, apiKey } = req.body;

  if (!taskId || !apiKey)
    return res.status(400).json({ error: 'taskId and apiKey are required' });

  try {
    const endpoint = `https://api.freepik.com/v1/ai/video/kling-v3/${taskId}`;

    const upstream = await fetch(endpoint, {
      headers: { 'x-freepik-api-key': apiKey },
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.message || upstream.statusText,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('[kling/poll]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
