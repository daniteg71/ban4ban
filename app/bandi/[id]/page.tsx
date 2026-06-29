import { notFound } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { StrategyView } from '@/components/bandi/strategy-view'
import { getCompanyInfo, getStrategy } from '@/app/actions/company'

export const dynamic = 'force-dynamic'

export default async function StrategyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const grantId = Number.parseInt(id, 10)
  if (!Number.isFinite(grantId)) notFound()

  const [{ company }, strategy] = await Promise.all([getCompanyInfo(), getStrategy(grantId)])
  if (!strategy) notFound()

  return (
    <AppShell companyName={company.name} noPadding>
      <StrategyView s={strategy} />
    </AppShell>
  )
}
