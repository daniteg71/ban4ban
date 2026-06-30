import { notFound } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { StrategyView } from '@/components/bandi/strategy-view'
import { getCompanyInfo, getStrategy } from '@/app/actions/company'

export const dynamic = 'force-dynamic'

export default async function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) notFound()

  const [{ company, companies, selectedId }, strategy] = await Promise.all([getCompanyInfo(), getStrategy(id)])
  if (!strategy) notFound()

  return (
    <AppShell companyName={company.name} companies={companies} selectedId={selectedId} noPadding>
      <StrategyView s={strategy} />
    </AppShell>
  )
}
