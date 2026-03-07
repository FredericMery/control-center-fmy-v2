'use client';

import { useEffect, useMemo, useState } from 'react';
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
  email_sent?: boolean;
  recipient_name?: string | null;
  recipient_destination?: string | null;
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
  const [selectedRecipient, setSelectedRecipient] = useState<string>('all');

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

  const recipientOptions = useMemo(() => {
    const rows = report?.rows || [];
    const map = new Map<string, string>();

    rows.forEach((row) => {
      const value = row.recipient_name?.trim() || '';
      if (!value) return;
      const label = row.recipient_destination
        ? `${value} (${row.recipient_destination})`
        : value;
      if (!map.has(value)) {
        map.set(value, label);
      }
    });

    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [report]);

  const filteredRows = useMemo(() => {
    const rows = report?.rows || [];
    if (selectedRecipient === 'all') return rows;
    return rows.filter((row) => (row.recipient_name || '').trim() === selectedRecipient);
  }, [report, selectedRecipient]);

  const filteredTotals = useMemo(() => {
    return filteredRows.reduce(
      (acc, expense) => {
        acc.totalHt += Number(expense.amount_ht || 0);
        acc.totalTax += Number(expense.amount_tva || 0);
        acc.totalTtc += Number(expense.amount_ttc || 0);
        return acc;
      },
      { totalHt: 0, totalTax: 0, totalTtc: 0 }
    );
  }, [filteredRows]);

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
            <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-slate-200">Filtre destinataire</p>
                <select
                  value={selectedRecipient}
                  onChange={(e) => setSelectedRecipient(e.target.value)}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
                >
                  <option value="all">Tous les destinataires</option>
                  {recipientOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">HT mois en cours</p>
                <p className="mt-1 text-2xl font-semibold text-white">{filteredTotals.totalHt.toFixed(2)} €</p>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Taxe mois en cours</p>
                <p className="mt-1 text-2xl font-semibold text-white">{filteredTotals.totalTax.toFixed(2)} €</p>
              </div>
              <div className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 p-4">
                <p className="text-xs uppercase tracking-wide text-cyan-200">TTC mois en cours</p>
                <p className="mt-1 text-2xl font-semibold text-cyan-100">{filteredTotals.totalTtc.toFixed(2)} €</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900/70">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-sm">
                  <thead className="bg-slate-800/80 text-slate-300">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Date</th>
                      <th className="px-4 py-3 text-left font-semibold">Type</th>
                      <th className="px-4 py-3 text-center font-semibold">Mail</th>
                      <th className="px-4 py-3 text-right font-semibold">HT</th>
                      <th className="px-4 py-3 text-right font-semibold">Taxe</th>
                      <th className="px-4 py-3 text-right font-semibold">TTC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((expense) => (
                      <tr key={expense.id} className="border-t border-slate-800 text-slate-200">
                        <td className="px-4 py-3">
                          {expense.invoice_date
                            ? new Date(expense.invoice_date).toLocaleDateString(locale)
                            : new Date(expense.created_at).toLocaleDateString(locale)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-white">{expense.category || '-'}</div>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                expense.payment_method === 'cb_pro'
                                  ? 'bg-violet-500/15 text-violet-200 border border-violet-400/30'
                                  : 'bg-cyan-500/15 text-cyan-200 border border-cyan-400/30'
                              }`}
                            >
                              {expense.payment_method === 'cb_pro' ? 'CB PRO' : 'CB PERSO'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">{expense.vendor || '-'}</div>
                          {expense.recipient_name && (
                            <div className="text-[11px] text-slate-500 mt-1">
                              {expense.recipient_name}
                              {expense.recipient_destination ? ` - ${expense.recipient_destination}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            title={expense.email_sent ? 'Facture envoyee par email' : 'Facture non envoyee par email'}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
                              expense.email_sent
                                ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                                : 'border-rose-400/50 bg-rose-500/20 text-rose-200'
                            }`}
                          >
                            ✉
                          </span>
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
