// src/lib/ai/LLMProviderFactory.js
// Crea el provider LLM correcto.
// El DAG nunca instancia providers directamente — siempre usa esta factory.

import { ClaudeProvider }  from './providers/ClaudeProvider';
import { GeminiProvider }  from './providers/GeminiProvider';
import { GPT4Provider }    from './providers/GPT4Provider';

// Mapa de providers disponibles
const PROVIDER_MAP = {
  claude:  ClaudeProvider,
  gemini:  GeminiProvider,
  gpt4:    GPT4Provider,
};

// Provider por defecto si no se especifica
const DEFAULT_PROVIDER = 'gemini';  // Gemini 2.5 Pro — default provider

export class LLMProviderFactory {

  /**
   * Crear provider por nombre
   * @param {string} name  - 'claude' | 'gemini' | 'gpt4'
   * @param {Object} config - override de config (apiKey, modelId, etc.)
   */
  static create(name, config = {}) {
    const ProviderClass = PROVIDER_MAP[name];

    if (!ProviderClass) {
      const available = Object.keys(PROVIDER_MAP).join(', ');
      throw new Error(`LLM provider "${name}" not found. Available: ${available}`);
    }

    return new ProviderClass(config);
  }

  /**
   * Crear provider desde registro de Supabase
   * @param {Object} dbRecord - row de tabla llm_providers
   */
  static createFromDB(dbRecord) {
    if (!dbRecord) throw new Error('LLMProviderFactory: dbRecord is required');

    return LLMProviderFactory.create(dbRecord.name, {
      displayName: dbRecord.display_name,
      modelId: dbRecord.model_id,
      // La API key viene de env, no de DB (seguridad)
    });
  }

  /**
   * Crear provider por defecto (Gemini)
   */
  static createDefault() {
    return LLMProviderFactory.create(DEFAULT_PROVIDER);
  }

  /**
   * Listar providers disponibles
   */
  static getAvailable() {
    return Object.keys(PROVIDER_MAP).map(name => ({
      name,
      class: PROVIDER_MAP[name].name,
    }));
  }

  /**
   * Verificar si un provider está disponible
   */
  static isAvailable(name) {
    return !!PROVIDER_MAP[name];
  }
}

export default LLMProviderFactory;