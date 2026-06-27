# Pipeline Jesap — Specifica canonica

> Questo è il **riferimento ufficiale** della pipeline dell'applicazione. Ogni modifica al codice
> deve rispettare questi 6 step e lo schema del `Corporate DNA`. Da usare sempre come fonte di verità.

## Panoramica della pipeline (6 step)

### Step 1 — Connessione a Google Drive & Estrazione del "Corporate DNA"
L'app si connette alla cartella Drive aziendale protetta (Visura, Bilanci, Certificazioni ISO,
Portfolio Progetti). Un modulo di estrazione legge i file e sintetizza le informazioni chiave in
un unico oggetto JSON strutturato: il **`Corporate DNA`** (schema sotto).
- **Output richiesto:** lo schema JSON standardizzato del DNA (`dna_schema.json`).

### Step 2 — Feature "Modifica DNA"
Un pulsante dedicato aggiorna il DNA in modo dinamico. Se il team carica un nuovo bilancio o una
nuova certificazione su Drive, il sistema rileva la modifica, fa **parsing incrementale** e aggiorna
l'oggetto JSON del DNA **senza** rieseguire l'estrazione da zero.

### Step 3 — Aggregazione e Scraping dei Bandi Ufficiali
Al click del **Tasto Cerca**, l'app interroga crawler e feed dei principali siti ufficiali di bandi
pubblici. I dati di ogni bando vengono **normalizzati** in un JSON uniforme: requisiti di
ammissibilità, budget, scadenze, codice ATECO richiesto. *(Indipendente dal DNA.)*

### Step 4 — Filtro dei Requisiti Minimi (Hard Constraints)
**Prima** di invocare qualsiasi AI (zero spreco di token su bandi non accessibili), un filtro
booleano confronta i requisiti minimi del bando col JSON del DNA.
- *Esempio:* bando richiede ISO 27001 e l'azienda non ce l'ha → bando **scartato**.
- A schermo: **solo i bandi compatibili** con i requisiti minimi.

### Step 5 — Algoritmo di Valutazione e Scoring (1–10)
Solo sui bandi che superano lo Step 4 gira l'algoritmo di scoring quantitativo+qualitativo. L'AI
analizza metriche sfumate (coerenza progetti passati, solidità finanziaria vs budget del bando) e
restituisce un **punteggio intero 1–10** = probabilità matematica e strategica di aggiudicarsi il bando.

### Step 6 — Generazione della Strategia di Execution Scaricabile
Per i bandi con score elevato, il sistema genera un **piano d'azione** (Execution Strategy) in
Markdown **scaricabile**: milestone di sottomissione, documenti mancanti da preparare, punti di forza
da evidenziare nella proposta.

---

## Corporate DNA — schema JSON

Identità dell'azienda estratta dai documenti reali su Drive. **Chiavi contratte** per risparmiare
token nelle chiamate API. (Vedi anche `docs/dna_schema.json`.)

```json
{
  "p_iva": "01234567890",
  "rag_soc": "Innovazione Digitale S.R.L.",
  "ateco": ["62.01.0", "62.02.0"],
  "fin": {
    "ult_bilancio_anno": 2025,
    "fatturato": 1500000,
    "cap_sociale": 50000,
    "utile_netto": 120000
  },
  "cert": ["ISO-9001", "ISO-27001"],
  "comp": [
    "Sviluppo Software Cloud",
    "Intelligenza Artificiale",
    "Machine Learning",
    "Automazione CRM"
  ],
  "esperienze": [
    {
      "id": "EXP01",
      "tag": "CRM",
      "valore": 80000,
      "desc": "Sviluppo di un sistema CRM e Corporate DNA proprietario per ottimizzazione flussi aziendali."
    }
  ]
}
```

| Chiave | Significato |
|---|---|
| `p_iva` | Partita IVA |
| `rag_soc` | Ragione sociale |
| `ateco` | Codici ATECO dell'azienda |
| `fin` | Dati finanziari (anno ultimo bilancio, fatturato, capitale sociale, utile netto) |
| `cert` | Certificazioni possedute (ISO, ecc.) |
| `comp` | Competenze chiave |
| `esperienze` | Portfolio progetti (id, tag, valore €, descrizione) |

---

## Stato implementazione (mappa step → codice)

| Step | Stato | Dove nel codice |
|---|---|---|
| 1 — Connessione Drive + DNA | 🟢 **Fatto** (AI Gemini + fallback euristico) | `lib/drive.ts` (`readDriveTexts`: Sheets/Docs/.docx). Sintesi in `lib/dna-from-drive.ts` (`getDnaFromDrive` → `CompanyDna` galassia + `CorporateDna`). Con `GEMINI_API_KEY` la sintesi la fa **Gemini** (`lib/ai-gemini.ts`, free tier); senza chiave usa l'euristica regex. In entrambi i casi: niente dati inventati |
| 2 — Modifica DNA (incrementale) | 🟢 **Fatto** (rilevamento automatico) | `getDnaFromDrive`: impronta `id+modifiedTime` (nessun download); se invariata riusa la cache, altrimenti ri-sintetizza. Manca solo il **bottone** UI di refresh manuale |
| 3 — Scraping bandi ufficiali | 🟢 **Fatto** (MIMIT + Invitalia reali, indipendente dal DNA) | `lib/scrape.ts`. EU/altri = nota sotto. Da fare: normalizzazione campi (ATECO/scadenze/budget) |
| 4 — Filtro requisiti minimi | 🟡 **Attivo** (regola placeholder) | `filterCompatible()` in `lib/company-config.ts`: split compatibili/non-ammissibili (booleano, 0 token). I non ammissibili compaiono in sezione dedicata col motivo. Regola placeholder per settore → la sostituisce l'**algoritmo del team** (requisiti ↔ DNA) |
| 5 — Scoring 1–10 | 🔴 Volutamente assente | in attesa del modulo del team. Cache pronta: `withScoreCache()` |
| 6 — Strategia scaricabile | 🟡 **Scheletro + PDF fatti**; i campi AI li riempie il team | contratto `lib/strategy.ts` (`ExecutionStrategy`), vista stampabile `components/bandi/strategy-view.tsx` (`/bandi/[id]` + "Scarica PDF" via print). Il team riempie `score`/`probabilita`/`matching` |

**Legenda:** 🟢 fatto · 🟡 parziale/hook · 🔴 in attesa dei moduli del team.

### Fonti bandi attive (`lib/scrape.ts`, scrapate a ogni ricerca, zero token)
- **Nazionali:** **MIMIT** (RSS + elenco) e **Invitalia** — catalogo strutturato.
- **Regionali** (bandi che spesso NON stanno nei portali nazionali), RSS filtrati per parole-chiave bando:
  **Lazio Innova**, **Sviluppo Toscana**, **Sardegna Impresa**.
- **Esclusi per scelta/tecnica:** `incentivi.gov.it` e molti portali regionali sono **app JavaScript**
  (servirebbe headless browser). I **bandi UE** (EU Funding & Tenders) sono **fuori scope**.

### Meccanismo ANTI-SPRECO token (`lib/token-cache.ts`)
La parte cara è l'AI (Step 5/6). Per spendere il minimo man mano che l'app si usa:
1. ogni bando ha un **hash** stabile (`source+link`); ogni DNA una **versione** (`dnaVersion`).
2. i risultati AI si memorizzano per chiave **`hash:versioneDNA`** (`withScoreCache`).
3. a ogni ricerca solo i bandi **NUOVI** andrebbero all'AI; i **già noti** riusano la cache (0 token).
→ Più si usa l'app, più bandi sono in cache: il costo per ricerca tende a **zero** (finché il DNA non
cambia: al cambio cambia la versione e si ricalcola solo allora). La UI mostra "X nuovi · Y già noti".
*(Cache in-memory: per risparmio permanente cross-sessione spostarla su KV/DB.)*

### Regole d'oro (sempre valide)
1. **Token zero finché possibile:** lo scraping (Step 3) e il filtro requisiti minimi (Step 4) NON usano AI. L'AI parte solo allo Step 5, sui pochi bandi sopravvissuti.
2. **Scraping indipendente dal DNA:** prima si cerca tutto, poi dal DNA si filtra/score.
3. **Chiavi contratte** nel DNA per risparmiare token nelle chiamate API.
4. **Le chiavi non entrano mai nel repo** (solo env: `.env.local` / Vercel): `GOOGLE_SERVICE_ACCOUNT_JSON` + `DRIVE_BANDI_FOLDER_ID` (Drive) e `GEMINI_API_KEY` (AI Step 1; opzionale, `GEMINI_MODEL` default `gemini-2.5-flash`). Senza `GEMINI_API_KEY` il DNA usa l'euristica: l'app non si rompe.
