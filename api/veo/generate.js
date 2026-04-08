// api/veo/generate.js
// Vercel Serverless Function — proxy para Veo 3.1 via Vertex AI.
// Reemplaza: POST /api/veo/generate en server.js
// El frontend llama exactamente la misma URL (/api/veo/generate).
//
// Env vars necesarias en Vercel:
//   (ninguna — accessToken viene en el body, projectId también)

export const config = { maxDuration: 30 };

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

  const { body: veoBody, projectId, accessToken } = req.body;

  if (!projectId || !accessToken || !veoBody)
    return res.status(400).json({ error: 'projectId, accessToken, and body are required' });

  try {
    const endpoint =
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}` +
      `/locations/us-central1/publishers/google/models/veo-3.1-generate-001:predictLongRunning`;

    const upstream = await fetch(endpoint, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(veoBody),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .json({ error: data?.error?.message || upstream.statusText });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('[veo/generate]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
