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

/** One entry of a provider's model list; `price` is USD per million tokens, when it is known. */
export type ModelInfo = {
  id: string;
  name: string;
  contextLength: number | null;
  price: { input: number; output: number } | null;
};

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

/** OpenRouter names read "Provider: Model"; inside a provider group the prefix is noise. */
function providerOf(m: ModelInfo): string {
  const fromName = m.name.match(/^([^:]{1,40}):\s/)?.[1];
  if (fromName) return fromName;
  const slash = m.id.indexOf('/');
  return slash > 0 ? m.id.slice(0, slash) : 'Altri';
}

const formatPrice = (n: number) => `$${Number(n.toFixed(3))}`;

/** "DeepSeek: DeepSeek V4" → "DeepSeek V4". */
export const modelName = (m: ModelInfo) => m.name.replace(/^[^:]{1,40}:\s/, '');

export function modelLabel(m: ModelInfo): string {
  const name = modelName(m);
  if (!m.price) return name;
  const { input, output } = m.price;
  if (input === 0 && output === 0) return `${name} · gratis`;
  return `${name} · ${formatPrice(input)} / ${formatPrice(output)}`;
}

export type ModelGroup = { label: string; models: ModelInfo[] };

/**
 * Models grouped by provider for a <select>, narrowed by `query`. The `current` model always stays
 * in the list (in an "Attuale" group if the provider no longer offers it), so the select keeps
 * showing what the profile actually uses.
 */
export function groupModels(models: ModelInfo[], query: string, current: string): ModelGroup[] {
  const q = query.trim().toLowerCase();
  const matches = (m: ModelInfo) =>
    m.id === current ||
    !q ||
    [m.id, m.name, modelLabel(m)].some((s) => s.toLowerCase().includes(q));

  const byProvider = new Map<string, ModelInfo[]>();
  for (const m of models.filter(matches)) {
    const label = providerOf(m);
    byProvider.set(label, [...(byProvider.get(label) ?? []), m]);
  }
  const groups = [...byProvider.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, list]) => ({
      label,
      models: list.sort((a, b) => a.id.localeCompare(b.id)),
    }));

  if (current && !models.some((m) => m.id === current)) {
    groups.unshift({
      label: 'Attuale',
      models: [{ id: current, name: current, contextLength: null, price: null }],
    });
  }
  return groups;
}

/**
 * The profile name follows the chosen model while it is still a generated one (empty, a preset
 * name, or the previous model's name); a name the user wrote stays as it is.
 */
export function nameAfterModelChange(
  name: string,
  previousModelId: string,
  next: ModelInfo,
  models: ModelInfo[],
): string {
  const previous = models.find((m) => m.id === previousModelId);
  const generated = [
    '',
    previousModelId,
    ...(previous ? [modelName(previous), previous.name] : []),
    ...PRESETS.map((p) => p.value.name),
  ];
  return generated.includes(name.trim()) ? modelName(next) : name;
}
