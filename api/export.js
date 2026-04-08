// api/export.js
// Vercel Serverless Function — wrapper que delega en la Supabase Edge Function
// `export-video`. Mantiene la misma URL (/api/export) que ya usa el frontend.
//
// Por qué este wrapper:
//   - FFmpeg no está disponible en Vercel.
//   - La Edge Function de Supabase puede tardar varios minutos.
//   - Este wrapper acepta la misma solicitud del frontend y la retransmite.
//   - maxDuration: 60 cubre la mayoría de exports (< 10 shots cortos).
//     Para proyectos largos el cliente recibirá un 504 de Vercel pero
//     la Edge Function seguirá corriendo — en ese caso llama directo a
//     la Edge Function usando supabase.functions.invoke('export-video').
//
// Env vars necesarias en Vercel:
//   SUPABASE_URL              (o REACT_APP_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY

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

  const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey)
    return res.status(500).json({ error: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required' });

  // Derivar project ref del URL: https://XXXX.supabase.co
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1];
  if (!projectRef)
    return res.status(500).json({ error: 'Cannot derive Supabase project ref from SUPABASE_URL' });

  const edgeFnUrl = `https://${projectRef}.supabase.co/functions/v1/export-video`;

  try {
    const upstream = await fetch(edgeFnUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error('[api/export]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
