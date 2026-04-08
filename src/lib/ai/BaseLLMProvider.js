// src/lib/ai/BaseLLMProvider.js
// Clase base que TODOS los LLM providers deben implementar

export class BaseLLMProvider {
  constructor(config = {}) {
    this.name = config.name || 'base';
    this.displayName = config.displayName || 'Base Provider';
    this.modelId = config.modelId || '';
    this.apiKey = config.apiKey || '';
    this.maxTokens = config.maxTokens || 4096;
    this.temperature = config.temperature || 0.7;
  }

  // ============================================================
  // MÉTODO PRINCIPAL — todos los providers lo implementan
  // ============================================================

  /**
   * Enviar un mensaje al LLM
   * @param {Object} params
   * @param {string} params.system     - System prompt
   * @param {string} params.prompt     - User prompt
   * @param {number} params.temperature
   * @param {number} params.max_tokens
   * @returns {Promise<{text, tokens_input, tokens_output, tokens_total, cost_usd, model}>}
   */
  async complete(params) {
    throw new Error(`${this.name}.complete() must be implemented`);
  }

  // ============================================================
  // MÉTODOS UTILITARIOS (heredados por todos)
  // ============================================================

  /**
   * Completar con JSON garantizado
   * Reintenta hasta 2 veces si el JSON está malformado
   */
  async completeJSON(params) {
    const systemWithJSON = `${params.system || ''}

CRITICAL: Respond ONLY with valid JSON. No markdown, no backticks, no explanation. Just the JSON object.`;

    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await this.complete({
          ...params,
          system: systemWithJSON,
          temperature: params.temperature ?? 0.3,
        });

        // Limpiar posibles backticks que algunos modelos agregan
        const clean = result.text
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        const parsed = JSON.parse(clean);
        return { ...result, json: parsed };
      } catch (err) {
        lastError = err;
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 500 * attempt));
        }
      }
    }

    throw new Error(`${this.name} JSON parse failed after 3 attempts: ${lastError.message}`);
  }

  /**
   * Calcular costo estimado
   */
  estimateCost(tokensInput, tokensOutput, costPer1kTokens = 0.003) {
    const total = tokensInput + tokensOutput;
    return parseFloat(((total / 1000) * costPer1kTokens).toFixed(6));
  }

  /**
   * Validar que el provider está configurado
   */
  validate() {
    if (!this.modelId) {
      throw new Error(`${this.name}: model ID not configured`);
    }
    return true;
  }

  /**
   * Info del provider para logs
   */
  getInfo() {
    return {
      name: this.name,
      displayName: this.displayName,
      modelId: this.modelId,
      hasApiKey: !!this.apiKey,
    };
  }
}

export default BaseLLMProvider;