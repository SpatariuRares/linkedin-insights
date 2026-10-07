export type ProfileKind = 'openai-compatible' | 'claude-cli' | 'codex-cli';

export type Profile = {
  id: number;
  name: string;
  kind: ProfileKind;
  baseUrl: string | null;
  model: string;
  apiKeyEnv: string | null;
  timeoutMs: number;
  isDefault: boolean;
};

export type GenerateInput = { system: string; prompt: string; maxTokens?: number };

export type Usage = { inputTokens: number | null; outputTokens: number | null };

export type GenerateResult = { text: string; model: string; usage: Usage | null };

/** An error worth showing to the user as-is (missing key, wrong model, provider down...). */
export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmError';
  }
}
