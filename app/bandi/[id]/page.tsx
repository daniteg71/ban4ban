import { notFound } from 'next/navigation'
import { AppNav } from '@/components/app-nav'
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
    <main className="aurora-bg min-h-screen pb-12">
      <div className="no-print">
        <AppNav companyName={company.name} />
      </div>
      <div className="relative z-10">
        <StrategyView s={strategy} />
      </div>
    </main>
  )
}
