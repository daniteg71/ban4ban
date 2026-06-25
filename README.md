# Bandi × DNA — MVP

Valutazione automatica della fattibilità e convenienza di un bando pubblico rispetto al "DNA" aziendale (Formulario servizi + Bilanci + Visura + CV).

## Due fonti per i bandi

La dashboard ha due tasti:

- **🔍 Cerca bandi online** — scraping sui portali appalti pubblici. In live, `lib/scraper.ts`
  restituisce i bandi GREZZI (`RawTender[]`); a valutarli è il motore di matching (sotto).
  Ogni risultato ha un link al bando originale.
- **📁 Bandi da Drive** — i 4-5 PDF pre-caricati nella cartella Drive (path già esistente).

L'API è `/api/bandi?source=scraping|drive`. In mock entrambe restituiscono dati finti.

## Motore di matching — funnel a 3 stadi (`lib/pipeline/`)

Il cuore "AI a consumo minimo": spende compute proporzionale alla promessa di ogni bando.
È l'adattamento serverless del design Python (spaCy/KeyBERT/sentence-transformers/Redis), che NON
gira su Vercel. Stesso principio, costo quasi nullo:

| Stage | Cosa fa | Costo |
|---|---|---|
| 1 — `stage1-filters` | filtri rigidi (scadenza/budget/qualità parse) | €0 |
| 2 — `stage2-scoring` | pre-score lessicale + embedding → **gate** → scoring completo a 5 dimensioni | ~€0 |
| 3 — `stage3-llm` | LLM (la parte cara) **solo sui top-N**, con cost-guard | minimo |

Le 5 dimensioni, i pesi, i tier e i bonus/malus sono in `lib/pipeline/scoring-rules.ts`
(l'unico file da toccare per calibrare). I parser italiani (date/budget/regioni) sono in `parsers.ts`.
La similarità semantica usa: in mock un proxy lessicale gratis, in live **Gemini `text-embedding-004`**
(economico) — non un transformer locale. Il funnel è osservabile in dashboard: vedi quanti bandi
sopravvivono a ogni stadio e quante chiamate LLM sono servite (`/api/match-report`).

## Come si aggiorna il DNA (decisione architetturale)

Il DNA (info incrociate dell'azienda: Formulario + Bilanci + Visura + CV) usa il modello
**rebuild-on-demand con cache** (`lib/dna-cache.ts`):

- Si ricostruisce dal Drive alla prima richiesta e resta in cache (default 10 min, `DNA_CACHE_TTL_MS`).
- Le ricerche successive sono istantanee.
- Il bottone **↻ Aggiorna DNA** (o `POST /api/dna/refresh`) forza il rebuild.

Perché non il webhook "Drive sempre connesso"? Perché i watch channel di Drive scadono ogni ~7gg
e richiedono cron di rinnovo + storage: troppo per un MVP con pochi file. Il path push è però già
predisposto: `drive.watchDrive()` (stub) + endpoint `POST /api/drive/webhook` che chiama `refreshDna()`.
Per attivarlo in futuro basta implementare quei due punti, senza toccare il resto.

## Stato attuale

Lo scheletro è completo e gira in **modalità mock**: il frontend mostra 4 bandi finti con punteggio 0–10, dashboard, analisi dettagliata (10 criteri, match table, analisi critica, checklist) ed export PDF (via `window.print`).

Quando il Drive sarà popolato e il Prompt validato, basterà:
1. Compilare `.env.local` con le chiavi reali
2. Mettere `DATA_MODE=live`
3. Implementare i tre stub in `lib/drive.ts` e `lib/gemini.ts` (le `throw new Error(...)` spiegano cosa fare)

Nessuna modifica al frontend richiesta.

## Struttura

```
app/
  page.tsx                  Dashboard: lista bandi ordinati per punteggio
  bandi/[id]/page.tsx       Analisi dettagliata + export PDF
  dna/page.tsx              Snapshot DNA aziendale
  api/bandi                 GET lista bandi
  api/bandi/[id]            GET analisi singola
  api/dna                   GET snapshot DNA
lib/
  types.ts                  Tipi condivisi (Bando, DNA, Analisi)
  data-source.ts            Entry point: switcha tra mock e live in base a DATA_MODE
  mock-data.ts              4 bandi + 1 DNA + 1 analisi completa (Flusso 2)
  drive.ts                  Stub Google Drive (Backend Dev)
  gemini.ts                 Stub Gemini + prompt (Prompt Engineering)
  scoring.ts                Logica punteggio 10 criteri → 0–10
components/                 BandoCard, ScoreGauge, CriteriaTable, MatchTable, DnaStatus, ExportButton
```

## Avvio locale

```bash
npm install
npm run dev
# http://localhost:3000
```

## Deploy Vercel

1. Push del repo su GitHub
2. Su vercel.com → New Project → importa la repo
3. Aggiungere le variabili d'ambiente da `.env.example` (per ora basta `DATA_MODE=mock`)
4. Deploy

## Divisione lavoro (riferimento)

| Flusso | Chi | Cosa | Blocca? |
|---|---|---|---|
| 1A | Risorse A+B | Popolare Drive (Formulario, Bilanci, Visura, CV, 4 PDF bandi) | No |
| 1B | Risorse C+D | Tarare il prompt su AI Studio fino a ottenere il JSON descritto in `lib/gemini.ts` | No |
| 2A | Dev Frontend | UI completa su mock (questo repo) | No |
| 2B | Dev Backend | Implementare `lib/drive.ts` + `lib/gemini.ts` | Aspetta 1B per il prompt definitivo |
| 3 | Tutti | Switch a `DATA_MODE=live`, test end-to-end | Aspetta 1A + 1B + 2B |
