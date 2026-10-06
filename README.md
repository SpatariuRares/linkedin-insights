# Crescita — dashboard per crescere su LinkedIn

Dashboard per far crescere un profilo LinkedIn: obiettivo follower, calendario editoriale, news e bozze di post.
Gira tutta nel browser: legge l'export di analytics di LinkedIn (`AggregateAnalytics_*.xlsx`),
nessun login, nessuna API, nessun dato che lascia il computer.

Fork di [obrenoalvim/linkedin-insights](https://github.com/obrenoalvim/linkedin-insights) (MIT).

## Cosa fa

**Dashboard**

- **Obiettivo follower**: avanzamento verso il target, ritmo a 30 e 90 giorni, data stimata di
  arrivo, ritmo necessario per una data scelta, grafico con proiezione.
- **Storico cumulativo**: ogni export importato si unisce ai precedenti (per giorno e per URL dei
  post), così la crescita resta visibile oltre i 365 giorni che LinkedIn esporta.
- Filtro periodo (30 / 90 giorni, 12 mesi, tutto), impressioni, tasso di engagement, nuovi
  follower a settimana rispetto al ritmo necessario.
- Dal progetto originale: giorno migliore per pubblicare, momentum 7 giorni, post "doppia
  vittoria", temi (hashtag) che funzionano, top post, demografia.

**Calendario editoriale**

- Vista mensile (agenda su mobile), archivio idee con drag & drop sui giorni.
- Stato (idea → bozza → programmato → pubblicato), formato, pilastro di contenuto (max 8, colori
  stabili).
- Obiettivo di post a settimana con contatore per ogni settimana; il giorno migliore dai dati è
  evidenziato.
- Un post pubblicato con il suo link mostra impressioni e interazioni prese dall'export.

**Dati**: elenco degli export importati, backup/ripristino JSON, cancellazione.

## Avvio

```bash
npm install
npm run dev
```

Apri http://localhost:5173 e carica l'export: profilo LinkedIn → Analytics → Contenuti →
Esporta (365 giorni). Ripeti ogni 1–2 settimane.

I dati sono nel `localStorage` del browser: scarica un backup dalla pagina **Dati** ogni tanto.

## Limiti dell'export

- Nessun orario di pubblicazione: si può capire il giorno migliore, non l'ora.
- Solo i 50 migliori post per engagement e per impressioni del periodo.
- Il totale follower è uno solo (a fine periodo): la curva storica è ricostruita all'indietro
  dai nuovi follower giornalieri.

## Stack

Vite, React 19, TypeScript, Tailwind CSS v4, SheetJS (build CDN), Recharts, Zod, Vitest.

| Script          | Uso                 |
| --------------- | ------------------- |
| `npm run dev`   | server di sviluppo  |
| `npm run build` | build di produzione |
| `npm test`      | test (Vitest)       |
| `npm run lint`  | oxlint + Prettier   |

## Struttura

```
src/
  lib/
    linkedin-export.ts   parser dei 5 fogli dell'export (per posizione, indipendente dalla lingua)
    history.ts           unione di più export in uno storico
    goal.ts              obiettivo follower: ritmo, proiezione, data stimata
    calendar.ts          calendario editoriale: griglia mese, pilastri, link post ↔ metriche
    storage.ts           persistenza localStorage + backup
  pages/                 dashboard, calendar, data
  components/            grafici e UI
```
