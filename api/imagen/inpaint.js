// api/imagen/inpaint.js
// Vercel Serverless Function — proxy para Imagen 3 Inpainting via Vertex AI.
// El frontend llama POST /api/imagen/inpaint
//
// Body esperado: { imageBase64, maskBase64, projectId, accessToken }
// Respuesta:     { base64 } — PNG resultado del inpainting
// Mismo patrón que /api/veo/generate — el frontend pasa projectId y accessToken.

export const config = { maxDuration: 60 };

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

  // Mismo patrón que /api/veo/generate — projectId y accessToken vienen del body
  const { imageBase64, maskBase64, projectId, accessToken } = req.body;

  if (!imageBase64 || !maskBase64 || !projectId || !accessToken)
    return res.status(400).json({ error: 'imageBase64, maskBase64, projectId y accessToken son requeridos' });

  const endpoint =
    `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}` +
    `/locations/us-central1/publishers/google/models/imagen-3.0-capability-001:predict`;

  const body = {
    instances: [{
      prompt: '',
      referenceImages: [
        {
          referenceType: 'REFERENCE_TYPE_RAW',
          referenceId: 1,
          referenceImage: { bytesBase64Encoded: imageBase64 },
        },
        {
          referenceType: 'REFERENCE_TYPE_MASK',
          referenceId: 2,
          referenceImage: { bytesBase64Encoded: maskBase64 },
          maskImageConfig: {
            maskMode: 'MASK_MODE_USER_PROVIDED',
            dilation: 0.01,
          },
        },
      ],
    }],
    parameters: {
      editMode:   'EDIT_MODE_INPAINT_REMOVAL',
      editConfig: { baseSteps: 12 },
      sampleCount: 1,
    },
  };

  try {
    const upstream = await fetch(endpoint, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const msg = data?.error?.message || upstream.statusText;
      console.error('[imagen/inpaint] Vertex error:', msg);
      return res.status(upstream.status).json({
        error: msg,
        hint: upstream.status === 401 ? 'Token expirado. Actualizar VERTEX_ACCESS_TOKEN con: gcloud auth print-access-token' : undefined,
      });
    }

    const base64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!base64) {
      return res.status(500).json({ error: 'Imagen 3 no devolvió imagen en la respuesta' });
    }

    return res.status(200).json({ base64 });
  } catch (err) {
    console.error('[imagen/inpaint]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
