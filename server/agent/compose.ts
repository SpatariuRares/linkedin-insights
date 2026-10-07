import { z } from 'zod';
import type { ArticleText } from '../articles/text.ts';
import type { Voice } from '../store/voice.ts';

export type DraftOutput = { variants: { angle: string; text: string }[]; hooks: string[] };

export const draftOutputSchema = z.object({
  variants: z
    .array(z.object({ angle: z.string().default(''), text: z.string().trim().min(40) }))
    .length(2),
  hooks: z.array(z.string().trim().min(5)).length(3),
});

const OUTPUT_FORMAT = `Rispondi SOLO con un oggetto JSON, senza testo prima o dopo e senza blocchi di codice:
{
  "variants": [
    { "angle": "personale", "text": "<post completo>" },
    { "angle": "informativo", "text": "<post completo>" }
  ],
  "hooks": ["<prima riga alternativa 1>", "<prima riga alternativa 2>", "<prima riga alternativa 3>"]
}`;

function section(tag: string, body: string) {
  return `<${tag}>\n${body.trim() || '(non indicato)'}\n</${tag}>`;
}

export function systemPrompt(voice: Voice): string {
  return [
    `Sei il ghostwriter LinkedIn della persona descritta in <voce>. Scrivi post in ${voice.language || 'italiano'} che sembrano scritti da lei, non da un'AI.`,
    'Regole:',
    '- Usa SOLO fatti, numeri e citazioni presenti nelle <fonti>. Se un dettaglio non c’è, non inventarlo.',
    '- Il <pensiero> della persona è l’angolo del post: costruisci il post attorno a quello, non riassumere la notizia.',
    '- Testo semplice: niente markdown, niente grassetti con asterischi. LinkedIn non li mostra.',
    '- Niente link nel testo: il link alla fonte va nel primo commento.',
    '- Rispetta le regole di stile della persona; se mancano, frasi brevi, righe corte, al massimo 3 hashtag in fondo.',
    '- Evita le formule da post generico ("Ecco 5 lezioni", "game changer", "Non è X, è Y", domande retoriche finali vuote).',
    '- Variante "personale": parte dall’esperienza o dall’opinione della persona. Variante "informativo": parte dal fatto e da cosa significa per il pubblico.',
    '- Gli hook sono prime righe alternative, diverse tra loro, che fanno venire voglia di cliccare "altro".',
    '',
    OUTPUT_FORMAT,
  ].join('\n');
}

export function draftPrompt(input: {
  voice: Voice;
  articles: ArticleText[];
  thought: string;
}): string {
  const { voice, articles, thought } = input;
  const examples = voice.examples.filter((e) => e.trim());
  const sources = articles
    .map(
      (a, i) =>
        `<fonte n="${i + 1}" titolo="${a.title.replace(/"/g, "'")}" sito="${a.source}" url="${a.url}" testo="${a.fullText ? 'completo' : 'solo riassunto'}">\n${a.text}\n</fonte>`,
    )
    .join('\n\n');
  return [
    section(
      'voce',
      [
        `Chi è: ${voice.about || '(non indicato)'}`,
        `Per chi scrive: ${voice.audience || '(non indicato)'}`,
        `Regole di stile: ${voice.styleRules || '(non indicate)'}`,
      ].join('\n'),
    ),
    examples.length
      ? section(
          'esempi',
          `Post scritti dalla persona: imitane il tono e il ritmo, non il contenuto.\n\n${examples
            .map((e, i) => `--- esempio ${i + 1} ---\n${e.trim()}`)
            .join('\n\n')}`,
        )
      : '',
    section('fonti', sources),
    section('pensiero', thought),
    'Scrivi le 2 varianti e i 3 hook.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * A revision starts from the text as it is now, hand edits included, so the model changes what
 * was asked and keeps the rest.
 */
export function revisionPrompt(input: {
  voice: Voice;
  articles: ArticleText[];
  thought: string;
  currentText: string;
  instruction: string;
}): string {
  return [
    draftPrompt(input).replace(/\n\nScrivi le 2 varianti e i 3 hook\.$/, ''),
    section('testo_attuale', input.currentText),
    section('richiesta', input.instruction),
    [
      'Riscrivi il <testo_attuale> applicando la <richiesta>. Mantieni tutto ciò che la richiesta non tocca, comprese le modifiche fatte a mano.',
      'Variante 1: applica la richiesta in modo fedele. Variante 2: applicala in modo più deciso.',
      'Gli hook sono 3 nuove prime righe coerenti con il testo riscritto.',
    ].join('\n'),
  ].join('\n\n');
}

/**
 * Models wrap JSON in prose or code fences often enough that a strict JSON.parse would fail
 * needlessly: take the outermost object and validate its shape.
 */
export function parseDraftOutput(raw: string): DraftOutput {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('La risposta non contiene un oggetto JSON.');
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch (err) {
    throw new Error(`JSON non valido: ${(err as Error).message}`);
  }
  const result = draftOutputSchema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `Formato inatteso: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return result.data;
}
