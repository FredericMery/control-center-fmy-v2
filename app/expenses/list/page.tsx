'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { useI18n } from '@/components/providers/LanguageProvider';

type Expense = {
  id: string;
  vendor: string;
  amount_ttc: number;
  invoice_date: string | null;
  payment_method: 'cb_perso' | 'cb_pro';
  status: string;
  created_at: string;
};

export default function ExpensesListPage() {
  const { t, language } = useI18n();
  const user = useAuthStore((state) => state.user);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchExpenses();
  }, [user]);

  const fetchExpenses = async () => {
    try {
      // À implémenter: récupérer les dépenses depuis l'API
      setExpenses([]);
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('expenses.historyTitle')}</h1>
            <p className="text-sm text-slate-600">{t('expenses.manage')}</p>
          </div>
          <Link
            href="/expenses"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + {t('expenses.add')}
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-16">
            <p className="text-slate-600">{t('common.loading')}</p>
          </div>
        ) : expenses.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📋</div>
            <p className="text-slate-600 mb-6">{t('expenses.empty')}</p>
            <Link
              href="/expenses"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t('expenses.addExpense')}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className="bg-white rounded-lg shadow-sm border border-slate-200 p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900">{expense.vendor}</h3>
                    <p className="text-sm text-slate-600">
                      {new Date(expense.created_at).toLocaleDateString(language === 'fr' ? 'fr-FR' : language === 'es' ? 'es-ES' : 'en-US')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">{expense.amount_ttc} €</p>
                    <p className="text-xs text-slate-600">
                      {expense.payment_method === 'cb_perso' ? t('expenses.paymentPersonal') : t('expenses.paymentPro')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
