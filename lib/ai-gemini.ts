import 'server-only'

// Cliente MINIMALE per Google Gemini via REST (stesso spirito "zero dipendenze" di lib/drive.ts).
// Usa la FREE TIER di Google AI Studio: chiave gratuita su https://aistudio.google.com/apikey.
// Per il nostro uso (sintesi DNA solo quando il Drive cambia) le chiamate sono pochissime -> resta gratis.
//
// Env:
//  - GEMINI_API_KEY   (obbligatoria per accendere l'AI; senza, il chiamante usa l'euristica)
//  - GEMINI_MODEL     (opzionale, default gemini-2.5-flash — free tier verificata)
//
// La chiave resta SOLO lato server (env), MAI nel repo e MAI esposta al client.

/** True se l'AI Gemini è configurata (chiave presente). */
export function isAiLive(): boolean {
  return Boolean(process.env.GEMINI_API_KEY)
}

function model(): string {
  return process.env.GEMINI_MODEL || 'gemini-2.5-flash'
}

// Schema di risposta in stile OpenAPI (sottoinsieme accettato da Gemini `responseSchema`).
export type GeminiSchema = Record<string, unknown>

/**
 * Chiama Gemini chiedendo una risposta JSON conforme a `schema`. Ritorna l'oggetto già
 * parseato, oppure `null` su qualunque errore (chiave assente, rete, quota, JSON invalido):
 * il chiamante fa fallback all'euristica. Non lancia mai.
 */
export async function geminiJson<T>(prompt: string, schema: GeminiSchema): Promise<T | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model()}:generateContent?key=${key}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0.2,
        },
      }),
    })
    if (!res.ok) {
      console.log('[gemini] HTTP', res.status, (await res.text()).slice(0, 200))
      return null
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return null
    return JSON.parse(text) as T
  } catch (e) {
    console.log('[gemini] errore:', e instanceof Error ? e.message : e)
    return null
  }
}
