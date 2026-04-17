// src/lib/ai/providers/GeminiProvider.js
// Google Gemini — las llamadas se proxean a través del backend para no exponer la API key.

import { BaseLLMProvider } from '../BaseLLMProvider';

export class GeminiProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super({
      name: 'gemini',
      displayName: config.displayName || 'Gemini 2.5 Flash',
      modelId: config.modelId || 'gemini-2.5-flash',
      apiKey: 'server-side',
      maxTokens: config.maxTokens || 8192,
      temperature: config.temperature || 0.7,
    });

    this.costPer1kInput  = 0.00125;
    this.costPer1kOutput = 0.005;
  }

  async complete({ system, prompt, temperature, max_tokens } = {}) {
    const serverUrl = process.env.REACT_APP_SERVER_URL || '';

    const response = await fetch(`${serverUrl}/api/llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'complete',
        provider: 'gemini',
        model: this.modelId,
        system,
        prompt,
        temperature: temperature ?? this.temperature,
        max_tokens: max_tokens || this.maxTokens,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Gemini error ${response.status}: ${err?.error || response.statusText}`);
    }

    return response.json();
  }
}

export default GeminiProvider;