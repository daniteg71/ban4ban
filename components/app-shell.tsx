import type { ReactNode } from 'react'
import { AppSidebar } from '@/components/app-sidebar'

/**
 * Layout applicativo: sidebar fissa a sinistra (desktop) + area contenuti.
 * `noPadding` per pagine a tutta superficie (es. mappa DNA).
 */
export function AppShell({
  companyName,
  children,
  noPadding = false,
}: {
  companyName: string
  children: ReactNode
  noPadding?: boolean
}) {
  return (
    <div className="min-h-screen bg-background md:pl-60">
      <AppSidebar companyName={companyName} />
      <main className={noPadding ? 'min-h-screen' : 'mx-auto max-w-5xl px-4 py-8 sm:px-6'}>
        {children}
      </main>
    </div>
  )
}
