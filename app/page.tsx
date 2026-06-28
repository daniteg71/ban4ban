import Link from 'next/link'
import { Atom, Check, FileText, FolderOpen, TriangleAlert } from 'lucide-react'
import { AppNav } from '@/components/app-nav'
import { BandiList } from '@/components/bandi/bandi-list'
import { Button } from '@/components/ui/button'
import {
  getCompanyInfo,
  getGrantsPage,
  getScartati,
  getSearchHistory,
} from '@/app/actions/company'

export const dynamic = 'force-dynamic'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; run?: string; q?: string }>
}) {
  const { page, run, q } = await searchParams
  const pageNum = page ? Math.max(1, Number.parseInt(page, 10) || 1) : 1
  const runId = run ? Number.parseInt(run, 10) : undefined
  const validRun = Number.isFinite(runId) ? runId : undefined

  const [{ company, drive }, paged, history, scartati] = await Promise.all([
    getCompanyInfo(),
    getGrantsPage(pageNum, validRun, q),
    getSearchHistory(),
    getScartati(validRun),
  ])

  return (
    <main className="aurora-bg min-h-screen pb-16">
      <AppNav companyName={company.name} />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Bandi e incentivi per <span className="text-accent">{company.name}</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          La piattaforma legge i documenti aziendali dal Drive e cerca i bandi dai portali ufficiali.
        </p>

        {/* Stato connessione Drive (reale) */}
        <div className="glass-strong mt-6 rounded-3xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2.5">
                <FolderOpen className="size-5 text-accent" />
              </div>
              <div>
                <h2 className="font-semibold">Cartella Google Drive</h2>
                <a href={company.driveFolderUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground">
                  {company.driveFolderId}
                </a>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {drive.connected ? (
                <span className="flex items-center gap-1.5 rounded-full bg-ok/15 px-3 py-1 text-sm font-medium text-ok">
                  <Check className="size-4" /> Connesso
                </span>
              ) : (
                <span className="flex items-center gap-1.5 rounded-full bg-warn/15 px-3 py-1 text-sm font-medium text-warn">
                  <TriangleAlert className="size-4" /> Non connesso
                </span>
              )}
              <Link href="/dna" className="no-print">
                <Button variant="outline" size="sm" className="bg-transparent">
                  <Atom className="size-4" /> DNA
                </Button>
              </Link>
            </div>
          </div>

          {drive.connected ? (
            <div className="mt-4">
              <p className="mb-2 text-xs text-muted-foreground">{drive.fileCount} documenti letti dal Drive:</p>
              <div className="flex flex-wrap gap-2">
                {drive.files.map((f) => (
                  <span key={f.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-2.5 py-1 text-xs">
                    <FileText className="size-3.5 text-accent" />
                    {f.name}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">{drive.error}</p>
          )}
        </div>

        {/* Ricerca + risultati bandi (qui in home) */}
        <BandiList
          grants={paged.grants}
          page={paged.page}
          totalPages={paged.totalPages}
          total={paged.total}
          query={paged.query}
          unfilteredTotal={paged.unfilteredTotal}
          history={history}
          scartati={scartati}
          activeRunId={validRun}
        />
      </div>
    </main>
  )
}
