import { AppNav } from '@/components/app-nav'
import { BandiList } from '@/components/bandi/bandi-list'
import { getCompanyInfo, getGrantsPage, getScartati, getSearchHistory } from '@/app/actions/company'

export const dynamic = 'force-dynamic'

export default async function BandiPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; run?: string }>
}) {
  const { page, run } = await searchParams
  const pageNum = page ? Math.max(1, Number.parseInt(page, 10) || 1) : 1
  const runId = run ? Number.parseInt(run, 10) : undefined

  const [{ company }, paged, history, scartati] = await Promise.all([
    getCompanyInfo(),
    getGrantsPage(pageNum, Number.isFinite(runId) ? runId : undefined),
    getSearchHistory(),
    getScartati(Number.isFinite(runId) ? runId : undefined),
  ])

  return (
    <main className="aurora-bg min-h-screen pb-12">
      <AppNav companyName={company.name} />
      <div className="relative z-10">
        <BandiList
          grants={paged.grants}
          page={paged.page}
          totalPages={paged.totalPages}
          total={paged.total}
          history={history}
          scartati={scartati}
          activeRunId={Number.isFinite(runId) ? runId : undefined}
        />
      </div>
    </main>
  )
}
