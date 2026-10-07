import type { Fetcher } from '../http.ts';
import { generateOpenAiCompatible } from './openai-compatible.ts';
import { generateCodexCli } from './codex-cli.ts';
import { LlmError, type GenerateInput, type GenerateResult, type Profile } from './types.ts';

export type LlmDeps = { fetcher: Fetcher; env: Record<string, string | undefined> };

/** The single entry point for text generation: the profile decides which adapter runs. */
export async function generate(
  profile: Profile,
  input: GenerateInput,
  deps: LlmDeps,
): Promise<GenerateResult> {
  switch (profile.kind) {
    case 'openai-compatible':
      return generateOpenAiCompatible(profile, input, deps);
    case 'codex-cli':
      return generateCodexCli(profile, input, { bin: deps.env.CODEX_BIN });
    case 'claude-cli':
      throw new LlmError('Questo tipo di profilo non è ancora disponibile.');
  }
}
