import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Inter } from 'next/font/google';
import { Owl } from '@/components/Owl';

// Font identità JESAP (come nel CRM: crm.jesap.it / JesapIt/Jesap-CRM)
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Bandi × DNA',
  description: 'Valutazione di fattibilità e convenienza dei bandi pubblici rispetto al DNA aziendale.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={inter.variable}>
      <body>
        <div className="aurora" />
        <header className="no-print sticky top-0 z-30 border-b border-brand/10 bg-white/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <Link href="/" className="flex items-center gap-3">
              <Owl className="w-9" motion="float" />
              <div>
                <div className="font-semibold leading-tight tracking-tight">
                  Bandi <span className="brand-text font-bold">×</span> DNA
                </div>
                <div className="text-xs text-slate-500">JESAP · valutazione bandi</div>
              </div>
            </Link>
            <nav className="text-sm text-slate-600 flex gap-5">
              <Link href="/" className="hover:text-brand transition-colors">Dashboard</Link>
              <Link href="/dna" className="hover:text-brand transition-colors">DNA</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        <footer className="no-print mt-16 border-t border-brand/10 bg-white/50">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <Owl className="w-6" />
              <span className="font-semibold brand-text">JESAP</span>
            </div>
            <span>Bandi × DNA — MVP {new Date().getFullYear()}</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
