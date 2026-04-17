// api/byteplus/generate.js
// Vercel Serverless Function — proxy para BytePlus Ark API.
// Soporta SeedDance 2.0 y 1.5 Pro.
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

  const { body: byteplusBody, apiKey } = req.body;

  if (!apiKey || !byteplusBody)
    return res.status(400).json({ error: 'apiKey and body are required' });

  try {
    const endpoint = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';

    const upstream = await fetch(endpoint, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(byteplusBody),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || data?.message || upstream.statusText,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('[byteplus/generate]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
