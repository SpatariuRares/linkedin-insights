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
  keyPresent: boolean | null;
};

export type ProfileInput = Pick<Profile, 'name' | 'kind' | 'baseUrl' | 'model' | 'apiKeyEnv'>;

export type ProfileTest =
  { ok: true; text: string; model: string; ms: number } | { ok: false; error: string; ms: number };

export const KIND_LABELS: Record<ProfileKind, string> = {
  'openai-compatible': 'Provider HTTP (OpenRouter, OpenAI, Ollama…)',
  'claude-cli': 'Claude Code (abbonamento)',
  'codex-cli': 'Codex (abbonamento)',
};

/** Kinds whose adapter exists; the others show up disabled until their issue lands. */
export const AVAILABLE_KINDS: ProfileKind[] = ['openai-compatible', 'codex-cli'];

export const PRESETS: { label: string; value: ProfileInput }[] = [
  {
    label: 'OpenRouter',
    value: {
      name: 'OpenRouter – Claude Sonnet 5.5',
      kind: 'openai-compatible',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'anthropic/claude-sonnet-5.5',
      apiKeyEnv: 'OPENROUTER_API_KEY',
    },
  },
  {
    label: 'Codex (abbonamento)',
    value: {
      name: 'Codex',
      kind: 'codex-cli',
      baseUrl: null,
      model: '',
      apiKeyEnv: null,
    },
  },
  {
    label: 'Ollama locale',
    value: {
      name: 'Ollama locale',
      kind: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: '',
      apiKeyEnv: null,
    },
  },
];
