import type { GenerateInput, GenerateResult, Profile } from '../llm/types.ts';
import { LlmError } from '../llm/types.ts';
import { parseDraftOutput, type DraftOutput } from './compose.ts';

export type GenerateFn = (profile: Profile, input: GenerateInput) => Promise<GenerateResult>;

export type DraftRun = {
  output: DraftOutput;
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
};

const add = (a: number | null, b: number | null) =>
  a === null && b === null ? null : (a ?? 0) + (b ?? 0);

/**
 * Asks for a draft and validates it. A malformed answer gets one retry that tells the model what
 * was wrong; a second failure is reported to the user instead of being papered over.
 */
export async function runDraft(
  generate: GenerateFn,
  profile: Profile,
  input: { system: string; prompt: string },
): Promise<DraftRun> {
  const first = await generate(profile, { ...input, maxTokens: 2500 });
  try {
    return {
      output: parseDraftOutput(first.text),
      model: first.model,
      usage: first.usage ?? { inputTokens: null, outputTokens: null },
    };
  } catch (err) {
    const retry = await generate(profile, {
      system: input.system,
      prompt: `${input.prompt}\n\nLa tua risposta precedente non era valida (${(err as Error).message}). Rispondi di nuovo, SOLO con l'oggetto JSON richiesto.`,
      maxTokens: 2500,
    });
    try {
      const u1 = first.usage;
      const u2 = retry.usage;
      return {
        output: parseDraftOutput(retry.text),
        model: retry.model,
        usage: {
          inputTokens: add(u1?.inputTokens ?? null, u2?.inputTokens ?? null),
          outputTokens: add(u1?.outputTokens ?? null, u2?.outputTokens ?? null),
        },
      };
    } catch (err2) {
      throw new LlmError(
        `Il modello non ha restituito una bozza nel formato atteso, nemmeno al secondo tentativo (${(err2 as Error).message}). Riprova o cambia modello.`,
      );
    }
  }
}
