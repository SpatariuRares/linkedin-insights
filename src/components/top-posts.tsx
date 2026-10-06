import { ExternalLink } from 'lucide-react';
import { ChartCard } from './chart-card';
import { Table } from './ui';
import { formatDateShort, formatNumber } from '../lib/format';
import type { TopPost } from '../lib/linkedin-export';

type Row = { rank: string; date: string; value: string; url: string };

function toRows(posts: TopPost[]): Row[] {
  return posts.map((p, i) => ({
    rank: String(i + 1),
    date: formatDateShort(p.date),
    value: formatNumber(p.value),
    url: p.url,
  }));
}

function PostsTable({
  title,
  description,
  posts,
  metricLabel,
}: {
  title: string;
  description: string;
  posts: TopPost[];
  metricLabel: string;
}) {
  const rows = toRows(posts);
  return (
    <ChartCard title={title} description={description}>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Dati insufficienti in questo periodo.</p>
      ) : (
        <Table
          columns={[
            { key: 'rank', label: '#' },
            { key: 'date', label: 'Pubblicato il' },
            { key: 'value', label: metricLabel },
          ]}
          rows={rows}
          pageSize={10}
          rowActions={(row) => (
            <a
              href={row.url}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
            >
              Apri <ExternalLink className="size-3" />
            </a>
          )}
        />
      )}
    </ChartCard>
  );
}

export function TopPosts({
  byEngagement,
  byImpressions,
}: {
  byEngagement: TopPost[];
  byImpressions: TopPost[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <PostsTable
        title="Top post per engagement"
        description="Reazioni, commenti e condivisioni"
        posts={byEngagement}
        metricLabel="Interazioni"
      />
      <PostsTable
        title="Top post per impressioni"
        description="Volte in cui sono apparsi nel feed"
        posts={byImpressions}
        metricLabel="Impressioni"
      />
    </div>
  );
}
