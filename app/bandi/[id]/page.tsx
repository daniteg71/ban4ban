import { notFound } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { StrategyView } from '@/components/bandi/strategy-view'
import { getCompanyInfo, getStrategy } from '@/app/actions/company'

export const dynamic = 'force-dynamic'

export default async function StrategyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ b?: string }>
}) {
  const { id } = await params
  const { b } = await searchParams
  const grantId = Number.parseInt(id, 10)
  if (!Number.isFinite(grantId)) notFound()

  // `b`: snapshot del bando nell'URL → la pagina si ricostruisce senza lo store in-memory.
  const [{ company, companies, selectedId }, strategy] = await Promise.all([getCompanyInfo(), getStrategy(grantId, b)])
  if (!strategy) notFound()

  return (
    <AppShell companyName={company.name} companies={companies} selectedId={selectedId} noPadding>
      <StrategyView s={strategy} />
    </AppShell>
  )
}
