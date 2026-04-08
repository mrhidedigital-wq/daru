// src/lib/ai/providers/ClaudeProvider.js
// Anthropic Claude — las llamadas se proxean a través del backend para no exponer la API key.

import { BaseLLMProvider } from '../BaseLLMProvider';

export class ClaudeProvider extends BaseLLMProvider {
  constructor(config = {}) {
    super({
      name: 'claude',
      displayName: config.displayName || 'Claude Sonnet 4',
      modelId: config.modelId || 'claude-sonnet-4-20250514',
      apiKey: 'server-side',
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature || 0.7,
    });

    this.costPer1kInput = 0.003;
    this.costPer1kOutput = 0.015;
  }

  async complete({ system, prompt, temperature, max_tokens } = {}) {
    const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:4000';

    const response = await fetch(`${serverUrl}/api/llm/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'claude',
        model: this.modelId,
        system,
        prompt,
        temperature: temperature ?? this.temperature,
        max_tokens: max_tokens || this.maxTokens,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(`Claude error ${response.status}: ${err?.error || response.statusText}`);
    }

    return response.json();
  }
}

export default ClaudeProvider;