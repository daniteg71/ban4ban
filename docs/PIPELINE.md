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
| 1 — Connessione Drive + DNA | 🟡 Drive **reale** OK; estrazione `Corporate DNA` da fare | `lib/drive.ts` (connessione reale via service account). Sintesi DNA: hook `rewriteDnaFromDrive` in `lib/company-config.ts` → **Gustavo** |
| 2 — Modifica DNA (incrementale) | 🔴 Da fare | bottone + parsing incrementale → **Gustavo** |
| 3 — Scraping bandi ufficiali | 🟢 **Fatto** (MIMIT + Invitalia reali, indipendente dal DNA) | `lib/scrape.ts`. EU/altri = nota sotto. Da fare: normalizzazione campi (ATECO/scadenze/budget) |
| 4 — Filtro requisiti minimi | 🟡 Hook pass-through | `filterCompatible()` in `lib/company-config.ts` → **algoritmo del team** |
| 5 — Scoring 1–10 | 🔴 Volutamente assente | in attesa del modulo di valutazione del team |
| 6 — Strategia scaricabile | 🔴 Volutamente assente | in attesa del modulo strategia del team |

**Legenda:** 🟢 fatto · 🟡 parziale/hook · 🔴 in attesa dei moduli del team.

### Nota fonti bandi (Italia vs UE)
- **Attive (scrapate a ogni ricerca):** MIMIT (RSS + elenco) e **Invitalia** — entrambe nazionali e
  server-rendered, scrapabili con `fetch`+`cheerio` (zero token, zero browser headless).
- **Non scrapabili con fetch semplice:** `incentivi.gov.it` e i portali **regionali** sono app
  JavaScript (caricano i dati lato client) → servirebbe un headless browser (più pesante/costoso).
- **Bandi europei (UE):** stanno su un portale diverso (**EU Funding & Tenders**), con struttura e
  logica molto diverse dall'Italia (consorzi multi-paese, niente codice ATECO, budget/scadenze in
  formato proprio). L'API ufficiale (SEDIA) va integrata a parte con la sua key; dal nostro ambiente
  di test risponde 500, quindi va collegata e provata dall'ambiente di produzione. La normalizzazione
  UE → JSON uniforme e il filtro di compatibilità UE sono un modulo dedicato (diverso da quello italiano).

### Regole d'oro (sempre valide)
1. **Token zero finché possibile:** lo scraping (Step 3) e il filtro requisiti minimi (Step 4) NON usano AI. L'AI parte solo allo Step 5, sui pochi bandi sopravvissuti.
2. **Scraping indipendente dal DNA:** prima si cerca tutto, poi dal DNA si filtra/score.
3. **Chiavi contratte** nel DNA per risparmiare token nelle chiamate API.
4. **La chiave del service account non entra mai nel repo** (solo env: `.env.local` / Vercel).
