import { Lightbulb } from 'lucide-react';
import { PillarDot } from '../calendar/status-icon';
import type { Pillar } from '../../lib/calendar';
import { formatRelevance, type ArticleScore } from '../../lib/news';

const pct = (p: number | null) => (p === null ? '' : ` ${Math.round(p * 100)}%`);

/** What Rizzo Flow thinks of an article. Probabilities are uncalibrated: shown as hints. */
export function ScoreBadges({ score, pillars }: { score: ArticleScore | null; pillars: Pillar[] }) {
  if (!score) {
    return <span className="text-muted-foreground text-xs">Non ancora valutato</span>;
  }
  const pillar = score.pillarId ? pillars.find((p) => p.id === score.pillarId) : null;
  const level = score.relevance === null ? 0 : Math.round(score.relevance);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="text-muted-foreground inline-flex items-center gap-1.5">
        <PillarDot slot={pillar?.slot ?? null} />
        {pillar ? pillar.name : 'Nessun pilastro'}
        {pillar && <span className="opacity-70">{pct(score.pillarProb)}</span>}
      </span>
      <span
        className="text-muted-foreground inline-flex items-center gap-1.5"
        title="Pertinenza ai tuoi temi, da 0 (fuori tema) a 4"
      >
        <span className="inline-flex gap-0.5" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="h-2.5 w-1 rounded-sm"
              style={{
                background: i < level ? 'var(--series-1)' : 'var(--chart-grid)',
              }}
            />
          ))}
        </span>
        Pertinenza {formatRelevance(score.relevance)}
      </span>
      {score.postWorthy && (
        <span className="text-foreground inline-flex items-center gap-1">
          <Lightbulb className="size-3.5" aria-hidden />
          Spunto per un post
          <span className="text-muted-foreground">{pct(score.postWorthyProb)}</span>
        </span>
      )}
    </div>
  );
}
