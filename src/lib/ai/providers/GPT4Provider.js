// src/lib/ai/providers/GPT4Provider.js
// OpenAI GPT-4o — las llamadas se proxean a través del backend para no exponer la API key.

import { BaseLLMProvider } from '../BaseLLMProvider';

export class GPT4Provider extends BaseLLMProvider {
  constructor(config = {}) {
    super({
      name: 'gpt4',
      displayName: config.displayName || 'GPT-4o-mini',
      modelId: config.modelId || 'gpt-4o-mini',
      apiKey: 'server-side',
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature || 0.7,
    });

    this.costPer1kInput = 0.000150;
    this.costPer1kOutput = 0.000600;
  }

  async complete({ system, prompt, temperature, max_tokens } = {}) {
    const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:4000';

    const response = await fetch(`${serverUrl}/api/llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'complete',
        provider: 'gpt4',
        model: this.modelId,
        system,
        prompt,
        temperature: temperature ?? this.temperature,
        max_tokens: max_tokens || this.maxTokens,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`GPT-4 error ${response.status}: ${err?.error || response.statusText}`);
    }

    return response.json();
  }
}

export default GPT4Provider;