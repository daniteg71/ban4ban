import 'server-only'
import crypto from 'node:crypto'
import mammoth from 'mammoth'
import type { DriveFile } from '@/lib/db/schema'

// Connessione REALE a Google Drive tramite service account (lettore-drive@jesap-bandi).
// Zero dipendenze: firmiamo a mano un JWT e otteniamo un access token.
// La chiave sta in GOOGLE_SERVICE_ACCOUNT_JSON (env), MAI nel repo.

export type { DriveFile }

type ServiceAccount = { client_email: string; private_key: string }

function getServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    const sa = JSON.parse(raw)
    if (sa.client_email && sa.private_key) return sa
    return null
  } catch {
    return null
  }
}

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')

let tokenCache: { token: string; exp: number } | null = null

async function getAccessToken(): Promise<string | null> {
  const sa = getServiceAccount()
  if (!sa) return null

  const now = Math.floor(Date.now() / 1000)
  if (tokenCache && tokenCache.exp > now + 60) return tokenCache.token

  const unsigned =
    b64url({ alg: 'RS256', typ: 'JWT' }) +
    '.' +
    b64url({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  const jwt = unsigned + '.' + signer.sign(sa.private_key).toString('base64url')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    cache: 'no-store',
  })
  if (!res.ok) return null
  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) return null
  tokenCache = { token: data.access_token, exp: now + (data.expires_in ?? 3600) }
  return data.access_token
}

// Elenco dei file nella cartella DNA del Drive aziendale.
export async function listDriveFiles(folderId?: string): Promise<DriveFile[]> {
  const id = folderId ?? process.env.DRIVE_BANDI_FOLDER_ID
  if (!id) return []
  const token = await getAccessToken()
  if (!token) return []
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${id}' in parents and trashed=false`,
  )}&fields=files(id,name,mimeType,modifiedTime)&pageSize=200`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (!res.ok) return []
  const data = (await res.json()) as { files?: DriveFile[] }
  return data.files ?? []
}

// ----------------------------------------------------------------------------
// Estrazione del TESTO dai file (Step 1 — sintesi DNA). Riusa lo stesso access
// token del service account: ZERO nuove dipendenze di auth. Solo `mammoth` per i .docx.
// ----------------------------------------------------------------------------

export type DriveDoc = { name: string; text: string }

// Tronchiamo per file: protegge il serverless e il budget di token dell'AI (Step 5/6).
const MAX_CHARS_PER_FILE = 8000

const MIME = {
  sheet: 'application/vnd.google-apps.spreadsheet',
  gdoc: 'application/vnd.google-apps.document',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const

function normalize(text: string): string {
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

// Scarica/esporta il testo di UN file. Formati non supportati (es. PDF, .doc) -> ''.
async function extractOne(token: string, file: DriveFile): Promise<string> {
  const auth = { Authorization: `Bearer ${token}` }

  // Google Sheets -> export CSV (solo il primo foglio: sufficiente per l'MVP).
  if (file.mimeType === MIME.sheet) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/csv`,
      { headers: auth, cache: 'no-store' },
    )
    return res.ok ? normalize(await res.text()) : ''
  }

  // Google Docs -> export testo semplice.
  if (file.mimeType === MIME.gdoc) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`,
      { headers: auth, cache: 'no-store' },
    )
    return res.ok ? normalize(await res.text()) : ''
  }

  // .docx -> scarica i byte ed estrai il testo con mammoth.
  if (file.mimeType === MIME.docx) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
      { headers: auth, cache: 'no-store' },
    )
    if (!res.ok) return ''
    const buffer = Buffer.from(await res.arrayBuffer())
    const { value } = await mammoth.extractRawText({ buffer })
    return normalize(value)
  }

  return ''
}

// Estrae il testo dai file supportati. I non supportati e gli errori vengono ignorati.
export async function readDriveTexts(files: DriveFile[]): Promise<DriveDoc[]> {
  const token = await getAccessToken()
  if (!token) return []
  const out: DriveDoc[] = []
  for (const file of files) {
    try {
      const text = await extractOne(token, file)
      if (text) out.push({ name: file.name, text: text.slice(0, MAX_CHARS_PER_FILE) })
    } catch (e) {
      console.log(`[drive] estrazione fallita per "${file.name}":`, e instanceof Error ? e.message : e)
    }
  }
  return out
}

export type DriveStatus = {
  configured: boolean
  connected: boolean
  fileCount: number
  files: DriveFile[]
  error: string | null
}

// Verifica REALE che il Drive sia connesso (credenziali valide + cartella leggibile).
export async function checkDriveConnection(folderId?: string): Promise<DriveStatus> {
  const configured = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON && !!(folderId ?? process.env.DRIVE_BANDI_FOLDER_ID)
  if (!configured) {
    return {
      configured: false,
      connected: false,
      fileCount: 0,
      files: [],
      error: 'Service account o cartella non configurati (env GOOGLE_SERVICE_ACCOUNT_JSON / DRIVE_BANDI_FOLDER_ID).',
    }
  }
  try {
    const token = await getAccessToken()
    if (!token) {
      return { configured: true, connected: false, fileCount: 0, files: [], error: 'Autenticazione service account fallita.' }
    }
    const files = await listDriveFiles(folderId)
    if (files.length === 0) {
      return {
        configured: true,
        connected: false,
        fileCount: 0,
        files: [],
        error: 'Connesso ma nessun file: condividi la cartella con il service account (lettore-drive@jesap-bandi.iam.gserviceaccount.com).',
      }
    }
    return { configured: true, connected: true, fileCount: files.length, files, error: null }
  } catch (e) {
    return { configured: true, connected: false, fileCount: 0, files: [], error: e instanceof Error ? e.message : 'Errore Drive' }
  }
}
