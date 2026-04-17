// api/veo.js
// Vercel Serverless Function — proxy consolidado para Veo (Vertex AI).
// body.action === 'generate' → inicia generación de video
// body.action === 'extend'   → extiende un video existente
// body.action === 'poll'     → polling de operación en curso

export const config = { maxDuration: 300 };

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const VEO_ENDPOINT = (projectId) =>
  `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}` +
  `/locations/us-central1/publishers/google/models/veo-3.1-generate-001:predictLongRunning`;

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};

  // ── generate / extend ──────────────────────────────────────
  if (action === 'generate' || action === 'extend') {
    const { body: veoBody, projectId, accessToken } = req.body;

    if (!projectId || !accessToken || !veoBody)
      return res.status(400).json({ error: 'projectId, accessToken, and body are required' });

    try {
      const upstream = await fetch(VEO_ENDPOINT(projectId), {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(veoBody),
      });

      const data = await upstream.json().catch(() => ({}));

      if (!upstream.ok)
        return res.status(upstream.status).json({ error: data?.error?.message || upstream.statusText });

      return res.status(200).json(data);
    } catch (err) {
      console.error(`[veo/${action}]`, err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── poll ───────────────────────────────────────────────────
  if (action === 'poll') {
    const { operationName, accessToken } = req.body;

    if (!operationName || !accessToken)
      return res.status(400).json({ error: 'operationName and accessToken are required' });

    try {
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
        return res.status(502).json({
          error:        data?.error?.message || upstream.statusText,
          googleStatus: upstream.status,
          hint: upstream.status === 401 ? 'Access token expired. Run: gcloud auth print-access-token' : undefined,
        });
      }

      return res.status(200).json(data);
    } catch (err) {
      console.error('[veo/poll]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action}. Use generate, extend, or poll.` });
}
