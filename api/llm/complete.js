// api/llm/complete.js
// Vercel Serverless Function — proxy seguro para LLM providers.
// Reemplaza: POST /api/llm/complete en server.js
// Las claves NUNCA llegan al browser.
//
// Env vars necesarias en Vercel:
//   SUPABASE_URL              (o REACT_APP_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY → leer gemini_api_key desde la tabla api_keys
//   ANTHROPIC_API_KEY         → si usas Claude (opcional)
//   OPENAI_API_KEY            → si usas GPT-4 (opcional)
//   GEMINI_API_KEY            → fallback si no está en Supabase (opcional)

export const config = { maxDuration: 30 };

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ─── Leer Gemini key desde Supabase con fallback a env ────────
async function getGeminiKey() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceKey) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/api_keys?key_name=eq.gemini_api_key&select=key_value`,
        {
          headers: {
            apikey:        serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
        }
      );
      const rows = await res.json().catch(() => []);
      if (rows?.[0]?.key_value) return rows[0].key_value;
    }
  } catch { /* fallback */ }

  return process.env.GEMINI_API_KEY || null;
}

// ─── Gemini ───────────────────────────────────────────────────
async function callGemini({ model, system, prompt, temperature, max_tokens }) {
  const apiKey = await getGeminiKey();
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

  const modelId = model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const expectsJson =
    prompt?.includes('Return JSON') ||
    prompt?.includes('responde SOLO con JSON') ||
    prompt?.includes('SOLO con JSON válido') ||
    prompt?.includes('valid JSON only');

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature:     temperature ?? 0.7,
      maxOutputTokens: max_tokens || 8192,
      ...(expectsJson ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const isTextModel      = !modelId.includes('-image');
  const supportsThinking = isTextModel && (modelId.includes('gemini-2.5') || modelId.includes('gemini-3'));
  if (supportsThinking) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const upstream = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}));
    throw new Error(`Gemini API error ${upstream.status}: ${err?.error?.message || upstream.statusText}`);
  }

  const data      = await upstream.json();
  const allParts  = data.candidates?.[0]?.content?.parts || [];
  const textParts = allParts.filter(p => p.text != null && !p.thought);
  const text      = textParts.length > 0
    ? textParts.map(p => p.text).join('')
    : (allParts.find(p => p.text != null)?.text || '');

  const tokens_input  = data.usageMetadata?.promptTokenCount     || 0;
  const tokens_output = data.usageMetadata?.candidatesTokenCount || 0;

  return {
    text,
    tokens_input,
    tokens_output,
    tokens_total: tokens_input + tokens_output,
    cost_usd: parseFloat(((tokens_input / 1000) * 0.00125 + (tokens_output / 1000) * 0.005).toFixed(6)),
    model: modelId,
    provider: 'gemini',
  };
}

// ─── Claude ───────────────────────────────────────────────────
async function callClaude({ model, system, prompt, temperature, max_tokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured on server');

  const modelId = model || 'claude-sonnet-4-20250514';

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      modelId,
      max_tokens: max_tokens || 4096,
      temperature: temperature ?? 0.7,
      system:     system || '',
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}));
    throw new Error(`Claude API error ${upstream.status}: ${err?.error?.message || upstream.statusText}`);
  }

  const data          = await upstream.json();
  const text          = data.content?.[0]?.text || '';
  const tokens_input  = data.usage?.input_tokens  || 0;
  const tokens_output = data.usage?.output_tokens || 0;

  return {
    text,
    tokens_input,
    tokens_output,
    tokens_total: tokens_input + tokens_output,
    cost_usd: parseFloat(((tokens_input / 1000) * 0.003 + (tokens_output / 1000) * 0.015).toFixed(6)),
    model: modelId,
    provider: 'claude',
  };
}

// ─── GPT-4 ────────────────────────────────────────────────────
async function callGPT4({ model, system, prompt, temperature, max_tokens }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured on server');

  const modelId  = model || 'gpt-4o-mini';
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:       modelId,
      messages,
      max_tokens:  max_tokens || 4096,
      temperature: temperature ?? 0.7,
    }),
  });

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}));
    throw new Error(`GPT-4 API error ${upstream.status}: ${err?.error?.message || upstream.statusText}`);
  }

  const data          = await upstream.json();
  const text          = data.choices?.[0]?.message?.content || '';
  const tokens_input  = data.usage?.prompt_tokens     || 0;
  const tokens_output = data.usage?.completion_tokens || 0;

  return {
    text,
    tokens_input,
    tokens_output,
    tokens_total: tokens_input + tokens_output,
    cost_usd: parseFloat(((tokens_input / 1000) * 0.000150 + (tokens_output / 1000) * 0.000600).toFixed(6)),
    model: modelId,
    provider: 'gpt4',
  };
}

const HANDLERS = { gemini: callGemini, claude: callClaude, gpt4: callGPT4 };

// ─── Handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { provider, model, system, prompt, temperature, max_tokens } = req.body;

  if (!provider || !prompt)
    return res.status(400).json({ error: 'provider and prompt are required' });

  const handle = HANDLERS[provider];
  if (!handle)
    return res.status(400).json({
      error: `Unknown provider: ${provider}. Available: ${Object.keys(HANDLERS).join(', ')}`,
    });

  try {
    const result = await handle({ model, system, prompt, temperature, max_tokens });
    return res.status(200).json(result);
  } catch (err) {
    console.error(`[llm/${provider}]`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
