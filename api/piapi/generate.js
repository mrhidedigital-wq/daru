// api/piapi/generate.js
// Vercel Serverless Function — proxy para PiAPI (SeedDance + remove-watermark).
// Body: { body, apiKey }

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

  const { body: piapiBody, apiKey } = req.body;

  if (!apiKey || !piapiBody)
    return res.status(400).json({ error: 'apiKey and body are required' });

  try {
    const endpoint = 'https://api.piapi.ai/api/v1/task';

    const upstream = await fetch(endpoint, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key':    apiKey,
      },
      body: JSON.stringify(piapiBody),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.message || data?.error?.message || upstream.statusText,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('[piapi/generate]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
