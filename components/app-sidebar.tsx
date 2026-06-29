'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Atom, LayoutGrid } from 'lucide-react'
import { Logo } from '@/components/brand'
import { cn } from '@/lib/utils'

const links = [
  { href: '/', label: 'Bandi', icon: LayoutGrid },
  { href: '/dna', label: 'DNA Aziendale', icon: Atom },
]

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || pathname.startsWith('/bandi')
  return pathname === href || pathname.startsWith(href + '/')
}

function NavLinks({ pathname }: { pathname: string }) {
  return (
    <>
      {links.map((l) => {
        const active = isActive(pathname, l.href)
        const Icon = l.icon
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span>{l.label}</span>
          </Link>
        )
      })}
    </>
  )
}

function CompanyBadge({ companyName }: { companyName: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-secondary/40 px-3 py-2">
      <span className="size-2 shrink-0 rounded-full bg-ok" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium leading-tight">{companyName}</span>
        <span className="block text-xs text-muted-foreground">Connesso</span>
      </span>
    </div>
  )
}

export function AppSidebar({ companyName }: { companyName: string }) {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop: sidebar fissa */}
      <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-sidebar px-3 py-4 md:flex">
        <Link href="/" className="flex items-center gap-2.5 px-2 pb-4">
          <Logo size={28} />
          <span className="text-base font-semibold tracking-tight">Jesap</span>
        </Link>

        <nav className="flex flex-1 flex-col gap-1">
          <NavLinks pathname={pathname} />
        </nav>

        <CompanyBadge companyName={companyName} />
      </aside>

      {/* Mobile: barra superiore */}
      <header className="no-print sticky top-0 z-40 flex items-center justify-between border-b border-border bg-sidebar px-4 py-3 md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={26} />
          <span className="text-sm font-semibold tracking-tight">Jesap</span>
        </Link>
        <nav className="flex items-center gap-1">
          <NavLinks pathname={pathname} />
        </nav>
      </header>
    </>
  )
}
