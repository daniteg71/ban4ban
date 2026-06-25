import { NextResponse } from 'next/server';
import { getScrapingReport } from '@/lib/data-source';

export const dynamic = 'force-dynamic';

// Metriche del funnel (senza i risultati pesanti): quanti bandi sopravvivono a ogni stadio.
export async function GET() {
  try {
    const r = await getScrapingReport();
    return NextResponse.json({
      inputCount: r.inputCount,
      stage1Passed: r.stage1Passed,
      pertinenti: r.pertinenti,
      ammissibili: r.ammissibili,
      compatibili: r.results.length,
      llmCallsUsed: r.llmCallsUsed,
      scartati: r.scartati,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'errore' },
      { status: 502 }
    );
  }
}
