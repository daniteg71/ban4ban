import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { DnaExplorer } from '@/components/dna/dna-explorer'
import { Button } from '@/components/ui/button'
import { getCompanyInfo } from '@/app/actions/company'

export const dynamic = 'force-dynamic'

export default async function DnaPage() {
  const { company, drive, dna } = await getCompanyInfo()

  if (!drive.connected || !dna) {
    return (
      <AppShell companyName={company.name}>
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-24 text-center">
          <div className="rounded-xl bg-warn/10 p-4">
            <TriangleAlert className="size-8 text-warn" />
          </div>
          <h1 className="text-xl font-semibold">DNA non disponibile</h1>
          <p className="text-sm text-muted-foreground">{drive.error ?? 'Drive non connesso.'}</p>
          <Link href="/">
            <Button variant="outline" className="bg-transparent">Torna alla home</Button>
          </Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell companyName={company.name} noPadding>
      <DnaExplorer dna={dna} companyName={company.name} />
    </AppShell>
  )
}
