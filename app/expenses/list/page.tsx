'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/auth/clientSession';
import { useI18n } from '@/components/providers/LanguageProvider';

type ExpenseRow = {
  id: string;
  invoice_number: string | null;
  category: string;
  amount_ht: number;
  amount_tva: number;
  vendor: string;
  amount_ttc: number;
  invoice_date: string | null;
  payment_method: 'cb_perso' | 'cb_pro';
  photo_url?: string | null;
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
  const now = new Date();
  const [report, setReport] = useState<ExpenseReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState<string>('all');
  const [selectedCardType, setSelectedCardType] = useState<'all' | 'cb_perso' | 'cb_pro'>('all');
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRow | null>(null);
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [showNdfModal, setShowNdfModal] = useState(false);
  const [ndfToEmail, setNdfToEmail] = useState('');
  const [ndfSubject, setNdfSubject] = useState('');
  const [ndfBody, setNdfBody] = useState('');
  const [ndfPreviewExpenses, setNdfPreviewExpenses] = useState<ExpenseRow[]>([]);
  const [ndfPreviewTotals, setNdfPreviewTotals] = useState<{ totalHt: number; totalTax: number; totalTtc: number } | null>(null);
  const [isPreviewingNdf, setIsPreviewingNdf] = useState(false);
  const [isSendingNdf, setIsSendingNdf] = useState(false);
  const [ndfMessage, setNdfMessage] = useState<string | null>(null);
  const [selectedNdfExpenseIds, setSelectedNdfExpenseIds] = useState<string[]>([]);
  const [reimbursedFullName, setReimbursedFullName] = useState('');
  const [ndfValidatorFullName, setNdfValidatorFullName] = useState('');
  const [ndfCompanyName, setNdfCompanyName] = useState('');

  useEffect(() => {
    fetchExpenses();
  }, [selectedMonth, selectedYear]);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/expenses/report?month=${selectedMonth}&year=${selectedYear}`, {
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

  const selectedCompanyDestination = useMemo(() => {
    if (selectedRecipient === 'all') return '';
    const row = (report?.rows || []).find(
      (item) =>
        (item.recipient_name || '').trim() === selectedRecipient &&
        String(item.recipient_destination || '').trim()
    );

    return String(row?.recipient_destination || '').trim();
  }, [report, selectedRecipient]);

  const filteredRows = useMemo(() => {
    const rows = report?.rows || [];
    return rows.filter((row) => {
      const recipientOk =
        selectedRecipient === 'all' || (row.recipient_name || '').trim() === selectedRecipient;
      const cardOk = selectedCardType === 'all' || row.payment_method === selectedCardType;
      return recipientOk && cardOk;
    });
  }, [report, selectedRecipient, selectedCardType]);

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

  const companyNdfEligibleRows = useMemo(() => {
    const rows = report?.rows || [];
    return rows.filter((row) => {
      const companyOk =
        selectedRecipient === 'all' || (row.recipient_name || '').trim() === selectedRecipient;
      return (
        companyOk &&
        row.payment_method === 'cb_perso' &&
        ['pending', 'pending_ndf'].includes(String(row.status || '').toLowerCase())
      );
    });
  }, [report, selectedRecipient]);

  const companyNdfEligibleIds = useMemo(
    () => companyNdfEligibleRows.map((row) => row.id),
    [companyNdfEligibleRows]
  );

  const closeModal = () => {
    setSelectedExpense(null);
    setModalMessage(null);
  };

  const handleResendEmail = async () => {
    if (!selectedExpense) return;

    try {
      setIsResendingEmail(true);
      setModalMessage(null);

      const response = await fetch('/api/expenses/resend', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ expenseId: selectedExpense.id }),
      });

      const json = (await response.json()) as { success?: boolean; error?: string; message?: string };
      if (!response.ok) {
        setModalMessage(json.error || 'Erreur renvoi email');
        return;
      }

      setModalMessage(json.message || 'Email renvoye avec succes');

      setSelectedExpense((prev) => (prev ? { ...prev, email_sent: true } : prev));
      setReport((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((row) =>
            row.id === selectedExpense.id ? { ...row, email_sent: true } : row
          ),
        };
      });
    } catch {
      setModalMessage('Erreur reseau renvoi email');
    } finally {
      setIsResendingEmail(false);
    }
  };

  const previewNdf = async (expenseIdsOverride?: string[], emailOverride?: string) => {
    const expenseIds =
      Array.isArray(expenseIdsOverride) && expenseIdsOverride.length > 0
        ? expenseIdsOverride
        : selectedNdfExpenseIds;

    if (expenseIds.length === 0) {
      setNdfMessage('Selectionnez au moins une ligne CB Perso a inclure dans la NDF.');
      return;
    }

    try {
      setIsPreviewingNdf(true);
      setNdfMessage(null);
      const response = await fetch('/api/expenses/ndf-preview', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
          email: emailOverride ?? ndfToEmail,
          expenseIds,
          companyName: selectedRecipient === 'all' ? '' : selectedRecipient,
          companyDestination: selectedCompanyDestination,
        }),
      });

      const json = (await response.json()) as {
        success?: boolean;
        error?: string;
        draft?: { to: string; subject: string; bodyText: string };
        expenses?: ExpenseRow[];
        totals?: { totalHt: number; totalTax: number; totalTtc: number };
        ndfProfile?: {
          validatorFirstName?: string;
          validatorLastName?: string;
          companyName?: string | null;
        };
      };

      if (!response.ok || !json.draft) {
        setNdfMessage(json.error || 'Erreur preview NDF');
        return;
      }

      setNdfToEmail(json.draft.to || ndfToEmail);
      setNdfSubject(json.draft.subject || '');
      setNdfBody(json.draft.bodyText || '');
      setNdfPreviewExpenses(json.expenses || []);
      setNdfPreviewTotals(json.totals || null);
      const validatorFirst = String(json.ndfProfile?.validatorFirstName || '').trim();
      const validatorLast = String(json.ndfProfile?.validatorLastName || '').trim();
      setNdfValidatorFullName(`${validatorFirst} ${validatorLast}`.trim());
      setNdfCompanyName(String(json.ndfProfile?.companyName || ''));
      setNdfMessage('PDF prepare. Verifiez le mail puis envoyez.');
    } catch {
      setNdfMessage('Erreur reseau preview NDF');
    } finally {
      setIsPreviewingNdf(false);
    }
  };

  const handleCreateMyNdf = async () => {
    if (selectedRecipient === 'all') {
      setNdfMessage('Selectionnez d abord une entreprise dans le filtre Destinataire.');
      setShowNdfModal(true);
      return;
    }

    if (companyNdfEligibleIds.length === 0) {
      setNdfMessage('Aucune ligne NDF non envoyee pour cette entreprise sur le mois selectionne.');
      setShowNdfModal(true);
      return;
    }

    setShowNdfModal(true);
    setNdfMessage(null);
    setSelectedNdfExpenseIds(companyNdfEligibleIds);
    setNdfToEmail('');
    if (!ndfSubject) {
      setNdfSubject(`Note de frais ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`);
    }

    await previewNdf(companyNdfEligibleIds, '');
  };

  const sendNdf = async () => {
    if (!reimbursedFullName.trim()) {
      setNdfMessage('Saisissez le nom et prenom de la personne remboursee.');
      return;
    }

    try {
      setIsSendingNdf(true);
      setNdfMessage(null);

      const response = await fetch('/api/expenses/ndf-send', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
          email: ndfToEmail,
          subject: ndfSubject,
          bodyText: ndfBody,
          expenseIds: selectedNdfExpenseIds,
          reimbursedFullName,
          companyName: selectedRecipient === 'all' ? '' : selectedRecipient,
          companyDestination: selectedCompanyDestination,
        }),
      });

      const json = (await response.json()) as { success?: boolean; error?: string; message?: string };
      if (!response.ok) {
        setNdfMessage(json.error || 'Erreur envoi NDF');
        return;
      }

      setNdfMessage(json.message || 'NDF envoyee');
      setSelectedNdfExpenseIds([]);
      await fetchExpenses();
    } catch {
      setNdfMessage('Erreur reseau envoi NDF');
    } finally {
      setIsSendingNdf(false);
    }
  };

  const yearOptions = useMemo(() => {
    const current = now.getFullYear();
    return [current - 1, current, current + 1];
  }, [now]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-slate-700 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">{t('expenses.historyTitle')}</h1>
            <p className="text-sm text-slate-300">{t('expenses.manage')}</p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-600 bg-slate-900/70 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-slate-500 hover:bg-slate-800"
            >
              {t('common.home')}
            </Link>
            <Link
              href="/expenses"
              className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
            >
              + {t('expenses.add')}
            </Link>
          </div>
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
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-300">Type de carte</p>
                  <select
                    value={selectedCardType}
                    onChange={(e) => setSelectedCardType(e.target.value as 'all' | 'cb_perso' | 'cb_pro')}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
                  >
                    <option value="all">Toutes</option>
                    <option value="cb_perso">CB PERSO</option>
                    <option value="cb_pro">CB PRO</option>
                  </select>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-300">Destinataire</p>
                  <select
                    value={selectedRecipient}
                    onChange={(e) => setSelectedRecipient(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
                  >
                    <option value="all">Tous</option>
                    {recipientOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-300">Mois</p>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-300">Annee</p>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleCreateMyNdf}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              >
                Creer ma note de frais
              </button>
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-3">
              <p className="text-xs text-slate-300">
                <strong className="text-white">NDF automatique:</strong> {companyNdfEligibleIds.length} ligne(s) CB Perso non envoyee(s) trouvee(s)
                {selectedRecipient === 'all' ? ' (choisissez une entreprise pour generer la NDF).' : ' pour l entreprise selectionnee.'}
              </p>
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
                      <tr
                        key={expense.id}
                        className={`cursor-pointer border-t border-slate-800 text-slate-200 transition hover:bg-slate-800/40 ${
                          expense.status === 'submitted' ? 'bg-slate-700/40 text-slate-400' : ''
                        }`}
                        onClick={() => setSelectedExpense(expense)}
                      >
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

      {selectedExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-700 bg-slate-900/95 px-4 py-3">
              <div>
                <h3 className="text-base font-semibold text-white">Detail depense</h3>
                <p className="text-xs text-slate-400">{selectedExpense.vendor || 'Sans fournisseur'}</p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Date</p>
                  <p className="text-sm text-slate-100">
                    {selectedExpense.invoice_date
                      ? new Date(selectedExpense.invoice_date).toLocaleDateString(locale)
                      : new Date(selectedExpense.created_at).toLocaleDateString(locale)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">No facture</p>
                  <p className="text-sm text-slate-100">{selectedExpense.invoice_number || '-'}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Type</p>
                  <p className="text-sm text-slate-100">{selectedExpense.category || '-'}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Paiement</p>
                  <p className="text-sm text-slate-100">
                    {selectedExpense.payment_method === 'cb_pro' ? 'CB PRO' : 'CB PERSO'}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">HT / Taxe / TTC</p>
                  <p className="text-sm text-slate-100">
                    {Number(selectedExpense.amount_ht || 0).toFixed(2)} / {Number(selectedExpense.amount_tva || 0).toFixed(2)} / {Number(selectedExpense.amount_ttc || 0).toFixed(2)} EUR
                  </p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Mail</p>
                  <p className={`text-sm ${selectedExpense.email_sent ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {selectedExpense.email_sent ? 'Envoye' : 'Non envoye'}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-3">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">Photo facture/ticket</p>
                {selectedExpense.photo_url ? (
                  <div className="space-y-2">
                    <img
                      src={selectedExpense.photo_url}
                      alt="Photo facture"
                      className="max-h-80 w-full rounded-lg object-contain bg-slate-900"
                    />
                    <a
                      href={selectedExpense.photo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs text-cyan-300 hover:text-cyan-200"
                    >
                      Ouvrir la photo en grand
                    </a>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">Aucune photo disponible.</p>
                )}
              </div>

              {modalMessage && (
                <div className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
                  {modalMessage}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleResendEmail}
                  disabled={selectedExpense.payment_method !== 'cb_pro' || isResendingEmail}
                  className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isResendingEmail ? 'Renvoi en cours...' : 'Renvoyer email'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Fermer
                </button>
              </div>

              {selectedExpense.payment_method !== 'cb_pro' && (
                <p className="text-xs text-slate-400">
                  Le renvoi email est disponible uniquement pour les depenses CB Pro.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {showNdfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-700 bg-slate-900/95 px-4 py-3">
              <h3 className="text-base font-semibold text-white">Creation NDF</h3>
              <button
                type="button"
                onClick={() => setShowNdfModal(false)}
                className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs text-slate-300">Mois</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-300">Annee</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs text-slate-300">Personne remboursee (Nom Prenom)</label>
                  <input
                    value={reimbursedFullName}
                    onChange={(e) => setReimbursedFullName(e.target.value)}
                    placeholder="Nom Prenom"
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-4 text-xs text-slate-300">
                <p className="font-semibold text-slate-100">Cartouche NDF (parametres)</p>
                <p className="mt-1">Valideur: {ndfValidatorFullName || '-'}</p>
                <p>Entreprise: {ndfCompanyName || '-'}</p>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-4 space-y-3">
                <p className="text-xs uppercase tracking-wide text-slate-400">Boite mail - brouillon</p>
                <div>
                  <label className="mb-1 block text-xs text-slate-300">A</label>
                  <input
                    value={ndfToEmail}
                    onChange={(e) => setNdfToEmail(e.target.value)}
                    placeholder="destinataire@entreprise.com"
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-300">Objet</label>
                  <input
                    value={ndfSubject}
                    onChange={(e) => setNdfSubject(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-300">Message</label>
                  <textarea
                    value={ndfBody}
                    onChange={(e) => setNdfBody(e.target.value)}
                    rows={6}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => previewNdf()}
                    disabled={isPreviewingNdf}
                    className="flex-1 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
                  >
                    {isPreviewingNdf ? 'Preparation...' : 'Creer le PDF'}
                  </button>
                  <button
                    type="button"
                    onClick={sendNdf}
                    disabled={isSendingNdf || selectedNdfExpenseIds.length === 0}
                    className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {isSendingNdf ? 'Envoi en cours...' : 'Envoyer la NDF'}
                  </button>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
                  <p>Pieces jointes prevues:</p>
                  <p>- PDF NDF ({String(selectedMonth).padStart(2, '0')}/{selectedYear})</p>
                  <p>- {ndfPreviewExpenses.length} justificatif(s) photo/PDF</p>
                  {ndfPreviewTotals && (
                    <p className="mt-2">
                      Totaux: HT {ndfPreviewTotals.totalHt.toFixed(2)} / Taxe {ndfPreviewTotals.totalTax.toFixed(2)} / TTC {ndfPreviewTotals.totalTtc.toFixed(2)} EUR
                    </p>
                  )}
                </div>

                {ndfMessage && (
                  <div className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100">
                    {ndfMessage}
                  </div>
                )}
              </div>

              {ndfPreviewExpenses.length > 0 && (
                <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                  <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Apercu PDF NDF</p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-xs">
                      <thead className="bg-slate-800 text-slate-300">
                        <tr>
                          <th className="px-2 py-2 text-left">Ligne</th>
                          <th className="px-2 py-2 text-left">No facture</th>
                          <th className="px-2 py-2 text-left">Raison</th>
                          <th className="px-2 py-2 text-left">Fournisseur</th>
                          <th className="px-2 py-2 text-right">Montant HT</th>
                          <th className="px-2 py-2 text-right">Montant Taxes</th>
                          <th className="px-2 py-2 text-right">Montant TTC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ndfPreviewExpenses.map((expense, index) => (
                          <tr key={expense.id} className="border-t border-slate-800 text-slate-200">
                            <td className="px-2 py-2">{index + 1}</td>
                            <td className="px-2 py-2">{expense.invoice_number || '-'}</td>
                            <td className="px-2 py-2">{expense.category || '-'}</td>
                            <td className="px-2 py-2">{expense.vendor || '-'}</td>
                            <td className="px-2 py-2 text-right">{Number(expense.amount_ht || 0).toFixed(2)} EUR</td>
                            <td className="px-2 py-2 text-right">{Number(expense.amount_tva || 0).toFixed(2)} EUR</td>
                            <td className="px-2 py-2 text-right">{Number(expense.amount_ttc || 0).toFixed(2)} EUR</td>
                          </tr>
                        ))}
                      </tbody>
                      {ndfPreviewTotals && (
                        <tfoot className="border-t border-slate-700 bg-slate-800/70 text-slate-100">
                          <tr>
                            <td className="px-2 py-2 font-semibold" colSpan={4}>Totaux</td>
                            <td className="px-2 py-2 text-right font-semibold">{ndfPreviewTotals.totalHt.toFixed(2)} EUR</td>
                            <td className="px-2 py-2 text-right font-semibold">{ndfPreviewTotals.totalTax.toFixed(2)} EUR</td>
                            <td className="px-2 py-2 text-right font-semibold">{ndfPreviewTotals.totalTtc.toFixed(2)} EUR</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
