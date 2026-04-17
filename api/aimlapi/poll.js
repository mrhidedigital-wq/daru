// api/aimlapi/poll.js
// Vercel Serverless Function — polling de generación AIMLAPI.
// Body: { generationId, apiKey }

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

  const { generationId, apiKey } = req.body;

  if (!generationId || !apiKey)
    return res.status(400).json({ error: 'generationId and apiKey are required' });

  try {
    const endpoint = `https://api.aimlapi.com/v2/video/generations?generation_id=${generationId}`;

    const upstream = await fetch(endpoint, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || upstream.statusText,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('[aimlapi/poll]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
