import { useEffect, useState } from 'react';
import { Bookmark, Check, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui';
import { api } from '../../lib/api';
import { formatRelative, type Article, type ArticleState } from '../../lib/news';

const STATE_LABELS: Record<ArticleState, string> = {
  inbox: 'da leggere',
  saved: 'selezionato',
  discarded: 'scartato',
  archived: 'archiviato',
};

/** Other articles on the same story, from any feed and from the archive too. */
export function RelatedArticles({
  articleId,
  onSaved,
}: {
  articleId: number;
  onSaved: () => void;
}) {
  const [related, setRelated] = useState<(Article & { similarity?: number })[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    api.relatedArticles(articleId).then(
      (list) => !stale && setRelated(list),
      (err: unknown) => !stale && setError(err instanceof Error ? err.message : String(err)),
    );
    return () => {
      stale = true;
    };
  }, [articleId]);

  const save = async (article: Article) => {
    try {
      await api.setArticleState(article.id, 'saved');
      setRelated((list) =>
        list ? list.map((a) => (a.id === article.id ? { ...a, state: 'saved' } : a)) : list,
      );
      toast('Salvato nei Selezionati', { description: article.title });
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="border-border mt-3 space-y-2 border-t pt-3">
      <p className="text-foreground text-xs font-medium">News collegate</p>
      {error && <p className="text-destructive text-xs">{error}</p>}
      {!error && related === null && <p className="text-muted-foreground text-xs">Cerco…</p>}
      {related?.length === 0 && (
        <p className="text-muted-foreground text-xs">
          Nessun'altra news sullo stesso tema, nemmeno in archivio.
        </p>
      )}
      {related && related.length > 0 && (
        <ul className="space-y-2">
          {related.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-muted-foreground text-xs">
                  {r.source} · {formatRelative(r.publishedAt)} · {STATE_LABELS[r.state]}
                  {r.similarity !== undefined && ` · affinità ${Math.round(r.similarity * 100)}%`}
                </p>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground inline-flex items-start gap-1.5 text-sm hover:underline"
                >
                  {r.title}
                  <ExternalLink className="text-muted-foreground mt-1 size-3 shrink-0" />
                </a>
              </div>
              {r.state === 'saved' ? (
                <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 pt-4 text-xs">
                  <Check className="size-3.5" />
                  Salvato
                </span>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 shrink-0"
                  onClick={() => save(r)}
                  aria-label={`Salva: ${r.title}`}
                >
                  <Bookmark className="size-3.5" />
                  <span className="hidden sm:inline">Salva</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
