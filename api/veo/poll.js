// api/veo/poll.js
// Vercel Serverless Function — proxy para polling de operaciones Veo.
// Reemplaza: POST /api/veo/poll en server.js
//
// Vertex AI usa fetchPredictOperation (POST) para polling, no un GET normal.
// Extrae el modelPath del operationName y llama al endpoint correcto.

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

  const { operationName, accessToken } = req.body;

  if (!operationName || !accessToken)
    return res.status(400).json({ error: 'operationName and accessToken are required' });

  try {
    // Extraer modelPath del operationName:
    // "projects/P/locations/L/publishers/google/models/M/operations/OP_ID"
    const parts = operationName.match(
      /^(projects\/[^/]+\/locations\/[^/]+\/publishers\/[^/]+\/models\/[^/]+)\/operations\/.+$/
    );

    if (!parts)
      return res.status(400).json({ error: 'Invalid operationName format' });

    const fetchUrl =
      `https://us-central1-aiplatform.googleapis.com/v1/${parts[1]}:fetchPredictOperation`;

    const upstream = await fetch(fetchUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ operationName }),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const hint =
        upstream.status === 401
          ? 'Access token expired. Run: gcloud auth print-access-token'
          : undefined;
      return res.status(502).json({
        error:        data?.error?.message || upstream.statusText,
        googleStatus: upstream.status,
        hint,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('[veo/poll]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
