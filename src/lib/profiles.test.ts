import { describe, expect, it } from 'vitest';
import { groupModels, modelLabel, nameAfterModelChange, type ModelInfo } from './profiles';

const model = (id: string, extra: Partial<ModelInfo> = {}): ModelInfo => ({
  id,
  name: id,
  contextLength: null,
  price: null,
  ...extra,
});

const MODELS = [
  model('anthropic/claude-sonnet-5.5', {
    name: 'Anthropic: Claude Sonnet 5.5',
    price: { input: 2, output: 10 },
  }),
  model('anthropic/claude-haiku-4.5', { name: 'Anthropic: Claude Haiku 4.5' }),
  model('meta-llama/llama-4:free', {
    name: 'Meta: Llama 4 (free)',
    price: { input: 0, output: 0 },
  }),
  model('llama3.2:latest'),
];

describe('modelLabel', () => {
  it('drops the provider prefix and adds the price per million tokens', () => {
    expect(modelLabel(MODELS[0])).toBe('Claude Sonnet 5.5 · $2 / $10');
    expect(modelLabel(MODELS[2])).toBe('Llama 4 (free) · gratis');
    expect(modelLabel(MODELS[3])).toBe('llama3.2:latest');
  });
});

describe('groupModels', () => {
  it('groups by provider, named from the model name when there is one', () => {
    const groups = groupModels(MODELS, '', '');
    expect(groups.map((g) => g.label)).toEqual(['Altri', 'Anthropic', 'Meta']);
    expect(groups[1].models.map((m) => m.id)).toEqual([
      'anthropic/claude-haiku-4.5',
      'anthropic/claude-sonnet-5.5',
    ]);
  });

  it('filters on id, name and label, but always keeps the current model', () => {
    const groups = groupModels(MODELS, 'GRATIS', 'anthropic/claude-sonnet-5.5');
    expect(groups.flatMap((g) => g.models.map((m) => m.id))).toEqual([
      'anthropic/claude-sonnet-5.5',
      'meta-llama/llama-4:free',
    ]);
  });

  it('lists a current model missing from the provider list on its own, first', () => {
    const groups = groupModels(MODELS, 'sonnet', 'acme/old-model');
    expect(groups[0]).toEqual({ label: 'Attuale', models: [model('acme/old-model')] });
  });
});

describe('nameAfterModelChange', () => {
  const deepseek = model('deepseek/deepseek-v4', { name: 'DeepSeek: DeepSeek V4' });
  const sonnet = MODELS[0];

  it('follows the model while the name is the preset one, empty, or the previous model', () => {
    expect(
      nameAfterModelChange('OpenRouter – Claude Sonnet 5.5', sonnet.id, deepseek, MODELS),
    ).toBe('DeepSeek V4');
    expect(nameAfterModelChange('', '', deepseek, MODELS)).toBe('DeepSeek V4');
    expect(nameAfterModelChange('Claude Sonnet 5.5', sonnet.id, deepseek, MODELS)).toBe(
      'DeepSeek V4',
    );
  });

  it('keeps a name the user wrote', () => {
    expect(nameAfterModelChange('Il mio ghostwriter', sonnet.id, deepseek, MODELS)).toBe(
      'Il mio ghostwriter',
    );
  });
});
