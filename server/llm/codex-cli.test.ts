// @vitest-environment node
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateCodexCli, parseCodexEvents } from './codex-cli.ts';
import type { Profile } from './types.ts';

const FAKE = path.join(import.meta.dirname, '__fixtures__', 'fake-codex.mjs');
const profile: Profile = {
  id: 1,
  name: 'Codex',
  kind: 'codex-cli',
  baseUrl: null,
  model: 'gpt-5.6-terra',
  apiKeyEnv: null,
  timeoutMs: 10_000,
  isDefault: true,
};

afterEach(() => {
  delete process.env.FAKE_CODEX_MODE;
});

describe('parseCodexEvents', () => {
  it('takes the last agent message and the usage, ignoring warning items', () => {
    const jsonl = [
      '{"type":"thread.started"}',
      '{"type":"item.completed","item":{"type":"error","message":"warning"}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"ciao"}}',
      'riga non json',
      '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2}}',
    ].join('\n');
    expect(parseCodexEvents(jsonl)).toEqual({
      text: 'ciao',
      usage: { inputTokens: 10, outputTokens: 2 },
      error: null,
    });
  });

  it('reports a failed turn', () => {
    expect(parseCodexEvents('{"type":"turn.failed","error":{"message":"quota"}}').error).toBe(
      'quota',
    );
  });
});

describe('generateCodexCli', () => {
  it('runs codex exec read-only, without user config, with the model and the prompt on stdin', async () => {
    const res = await generateCodexCli(profile, { system: 'SYS', prompt: 'USER' }, { bin: FAKE });
    expect(res.text).toContain(
      'exec --json --ephemeral --skip-git-repo-check --ignore-user-config --sandbox read-only',
    );
    expect(res.text).toContain('-m gpt-5.6-terra -');
    expect(res.text).toContain('stdin=ISTRUZIONI:\nSYS');
    expect(res.usage).toEqual({ inputTokens: 321, outputTokens: 12 });
  });

  it('explains a missing login', async () => {
    process.env.FAKE_CODEX_MODE = 'auth';
    await expect(
      generateCodexCli(profile, { system: 's', prompt: 'p' }, { bin: FAKE }),
    ).rejects.toThrow(/codex login/);
  });

  it('explains a missing binary', async () => {
    await expect(
      generateCodexCli(profile, { system: 's', prompt: 'p' }, { bin: '/non/esiste/codex' }),
    ).rejects.toThrow(/Non trovo il comando/);
  });

  it('kills the process after the timeout', async () => {
    process.env.FAKE_CODEX_MODE = 'slow';
    await expect(
      generateCodexCli({ ...profile, timeoutMs: 500 }, { system: 's', prompt: 'p' }, { bin: FAKE }),
    ).rejects.toThrow(/entro 1 s/);
  });
});
