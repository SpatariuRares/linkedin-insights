import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli, stderrTail } from './cli.ts';
import {
  LlmError,
  type GenerateInput,
  type GenerateResult,
  type Profile,
  type Usage,
} from './types.ts';

type CodexEvent =
  | { type: 'item.completed'; item: { type: string; text?: string; message?: string } }
  | { type: 'turn.completed'; usage?: { input_tokens?: number; output_tokens?: number } }
  | { type: 'turn.failed'; error?: { message?: string } }
  | { type: 'error'; message?: string }
  | { type: string };

/** Pulls the final answer and the token usage out of `codex exec --json` events. */
export function parseCodexEvents(jsonl: string): {
  text: string | null;
  usage: Usage | null;
  error: string | null;
} {
  let text: string | null = null;
  let usage: Usage | null = null;
  let error: string | null = null;
  for (const line of jsonl.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    let event: CodexEvent;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'item.completed' && 'item' in event && event.item.type === 'agent_message') {
      text = event.item.text ?? text;
    } else if (event.type === 'turn.completed' && 'usage' in event && event.usage) {
      usage = {
        inputTokens: event.usage.input_tokens ?? null,
        outputTokens: event.usage.output_tokens ?? null,
      };
    } else if (event.type === 'turn.failed' && 'error' in event) {
      error = event.error?.message ?? 'Codex ha interrotto la risposta.';
    } else if (event.type === 'error' && 'message' in event) {
      error = event.message ?? error;
    }
  }
  return { text, usage, error };
}

/**
 * Codex has no separate system prompt in exec mode, so instructions lead the input. It runs in a
 * throwaway folder with a read-only sandbox and without the user's config (skills, MCP servers):
 * here it only has to write text.
 */
export async function generateCodexCli(
  profile: Profile,
  input: GenerateInput,
  deps: { bin?: string } = {},
): Promise<GenerateResult> {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'crescita-codex-'));
  try {
    const args = [
      'exec',
      '--json',
      '--ephemeral',
      '--skip-git-repo-check',
      '--ignore-user-config',
      '--sandbox',
      'read-only',
      '-C',
      workdir,
      ...(profile.model ? ['-m', profile.model] : []),
      '-',
    ];
    const stdin = `ISTRUZIONI:\n${input.system}\n\n---\n\n${input.prompt}`;
    const res = await runCli(deps.bin ?? 'codex', args, {
      stdin,
      timeoutMs: profile.timeoutMs,
      cwd: workdir,
      label: 'Codex',
    });
    const parsed = parseCodexEvents(res.stdout);
    if (parsed.error) throw new LlmError(`Codex: ${parsed.error}`);
    if (res.code !== 0 || !parsed.text) {
      const tail = stderrTail(res.stderr);
      if (/login|auth|unauthori[sz]ed/i.test(tail)) {
        throw new LlmError('Codex non è autenticato: esegui «codex login» nel terminale.');
      }
      throw new LlmError(`Codex non ha restituito una risposta${tail ? `: ${tail}` : '.'}`);
    }
    return { text: parsed.text, model: profile.model || 'codex', usage: parsed.usage };
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}
