// Embedding per la similarità semantica.
// - mock/dev: vettore pseudo-deterministico dal testo (gratis, zero rete) -> il funnel gira subito.
// - live: Gemini "text-embedding-004" (economico, niente transformer locale da caricare).
// Cosine su vettori normalizzati.

const MODE = (process.env.DATA_MODE ?? 'mock').toLowerCase();
const DIM = 64;

// hash deterministico -> vettore (bag-of-words proiettato). Cattura overlap lessicale come proxy.
function pseudoEmbedding(text: string): number[] {
  const v = new Array(DIM).fill(0);
  for (const w of text.split(/\s+/)) {
    if (!w) continue;
    let h = 0;
    for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) | 0;
    v[Math.abs(h) % DIM] += 1;
  }
  return normalize(v);
}

function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

export function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return Math.max(0, Math.min(1, dot));
}

export async function embed(text: string): Promise<number[]> {
  if (MODE === 'live') {
    // Implementazione live (Backend Dev): chiamata batchabile e cacheabile.
    // const { GoogleGenerativeAI } = await import('@google/generative-ai');
    // const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    // const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    // const res = await model.embedContent(text);
    // return normalize(res.embedding.values);
    throw new Error('[embeddings.embed] live non implementato — usare Gemini text-embedding-004 (cacheare i risultati).');
  }
  return pseudoEmbedding(text);
}
