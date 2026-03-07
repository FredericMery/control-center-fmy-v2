'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/auth/clientSession';
import { useI18n } from '@/components/providers/LanguageProvider';

type ExpenseRow = {
  id: string;
  category: string;
  amount_ht: number;
  amount_tva: number;
  vendor: string;
  amount_ttc: number;
  invoice_date: string | null;
  payment_method: 'cb_perso' | 'cb_pro';
  status: string;
  created_at: string;
};

type ExpenseReportResponse = {
  month: number;
  year: number;
  rows: ExpenseRow[];
  totals: {
    totalHt: number;
    totalTax: number;
    totalTtc: number;
    status: string;
  };
};

export default function ExpensesListPage() {
  const { t, language } = useI18n();
  const [report, setReport] = useState<ExpenseReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/expenses/report', {
        headers: await getAuthHeaders(false),
      });

      const json = (await response.json()) as ExpenseReportResponse & { error?: string };
      if (!response.ok) {
        setError(json.error || 'Erreur chargement report');
        return;
      }

      setReport(json);
    } catch {
      setError('Erreur reseau report depenses');
    } finally {
      setLoading(false);
    }
  };

  const locale = language === 'fr' ? 'fr-FR' : language === 'es' ? 'es-ES' : 'en-US';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-slate-700 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{t('expenses.historyTitle')}</h1>
            <p className="text-sm text-slate-300">{t('expenses.manage')}</p>
          </div>
          <Link
            href="/expenses"
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition-colors"
          >
            + {t('expenses.add')}
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        {error && (
          <div className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16">
            <p className="text-slate-300">{t('common.loading')}</p>
          </div>
        ) : !report || report.rows.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900/70 py-16 text-center">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-slate-300 mb-6">{t('expenses.empty')}</p>
            <Link
              href="/expenses"
              className="inline-block rounded-lg bg-cyan-500 px-6 py-3 font-semibold text-slate-950 hover:bg-cyan-400 transition-colors"
            >
              {t('expenses.addExpense')}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">HT mois en cours</p>
                <p className="mt-1 text-2xl font-semibold text-white">{report.totals.totalHt.toFixed(2)} €</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Taxe mois en cours</p>
                <p className="mt-1 text-2xl font-semibold text-white">{report.totals.totalTax.toFixed(2)} €</p>
              </div>
              <div className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 p-4">
                <p className="text-xs uppercase tracking-wide text-cyan-200">TTC mois en cours</p>
                <p className="mt-1 text-2xl font-semibold text-cyan-100">{report.totals.totalTtc.toFixed(2)} €</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/70">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="bg-slate-800/80 text-slate-300">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Date</th>
                      <th className="px-4 py-3 text-left font-semibold">Type</th>
                      <th className="px-4 py-3 text-right font-semibold">HT</th>
                      <th className="px-4 py-3 text-right font-semibold">Taxe</th>
                      <th className="px-4 py-3 text-right font-semibold">TTC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((expense) => (
                      <tr key={expense.id} className="border-t border-slate-800 text-slate-200">
                        <td className="px-4 py-3">
                          {expense.invoice_date
                            ? new Date(expense.invoice_date).toLocaleDateString(locale)
                            : new Date(expense.created_at).toLocaleDateString(locale)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-white">{expense.category || '-'}</div>
                          <div className="text-xs text-slate-400">{expense.vendor || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-right">{Number(expense.amount_ht || 0).toFixed(2)} €</td>
                        <td className="px-4 py-3 text-right">{Number(expense.amount_tva || 0).toFixed(2)} €</td>
                        <td className="px-4 py-3 text-right font-semibold text-cyan-200">{Number(expense.amount_ttc || 0).toFixed(2)} €</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
