'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { trackApiCall, trackAppUsage } from '@/lib/tracking/analytics';
import { useI18n } from '@/components/providers/LanguageProvider';

type PaymentMethod = 'cb_perso' | 'cb_pro';
type ExpenseStep = 'method' | 'reason' | 'scan' | 'review';

const PERSONAL_REASONS = [
  'Repas',
  'Transport',
  'Hotel',
  'Fournitures',
  'Logiciel',
  'Autre',
];

const PRO_REASONS = [
  'Client / Prospection',
  'Deplacement',
  'Abonnement',
  'Materiel',
  'Formation',
  'Autre',
];

export default function ExpenseForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<ExpenseStep>('method');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [reason, setReason] = useState<string>('');
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [validationCode, setValidationCode] = useState('');
  const [formData, setFormData] = useState({
    vendor: '',
    category: '',
    amount_ht: '',
    amount_tva: '',
    amount_ttc: '',
    invoice_number: '',
    invoice_date: '',
  });

  const reasonOptions = paymentMethod === 'cb_pro' ? PRO_REASONS : PERSONAL_REASONS;

  // Récupérer le token Supabase au chargement
  useEffect(() => {
    const getAuthToken = async () => {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          setAuthToken(session.access_token);
        }
      } catch (err) {
        console.error('Erreur récupération token:', err);
      }
    };
    getAuthToken();
  }, []);

  const handleMethodSelect = (method: PaymentMethod) => {
    setPaymentMethod(method);
    setReason('');
    setStep('reason');
  };

  const handleReasonSelect = (selectedReason: string) => {
    setReason(selectedReason);
    setStep('scan');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setImage(base64);
      handleScan(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleScan = async (base64Image: string) => {
    if (!authToken) {
      setError('Authentication required. Please sign in again.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('🚀 Envoi de la facture à l\'API...');
      const response = await fetch('/api/expenses/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          image: base64Image,
          paymentMethod,
          reason,
          validationCode,
        }),
      });

      const data = await response.json();
      console.log('📦 Réponse API:', data);

      if (!response.ok) {
        const errorMsg = data.error || t('expenses.scanError');
        console.error('❌ Erreur API:', errorMsg);
        setError(errorMsg);
        setImage(null); // Reset l'image pour permettre un nouveau scan
        return;
      }

      // Succès - tracker les événements
      console.log('✅ Dépense créée avec succès');
      
      // Tracker le scan de facture et l'appel Google Vision
      await trackAppUsage('scan_invoice', authToken);
      await trackApiCall('google_vision', authToken);
      
      setStep('review');
      setFormData({
        vendor: data.expense.vendor || '',
        category: data.expense.category || reason || '',
        amount_ht: data.expense.amount_ht?.toString() || '',
        amount_tva: data.expense.amount_tva?.toString() || '',
        amount_ttc: data.expense.amount_ttc?.toString() || '',
        invoice_number: data.expense.invoice_number || '',
        invoice_date: data.expense.invoice_date || '',
      });

      // Rediriger après 2 secondes
      setTimeout(() => {
        router.push('/dashboard/notifications');
      }, 2000);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : t('expenses.processingError');
      setError(errorMsg);
      setImage(null); // Reset l'image pour permettre un nouveau scan
      console.error('❌ Erreur catch:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-slate-900">{t('expenses.captureTitle')}</h1>
          <p className="text-sm text-slate-600">{t('expenses.captureSubtitle')}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        
        {/* ÉTAPE 1 : SÉLECTION MÉTHODE DE PAIEMENT */}
        {step === 'method' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <button
                onClick={() => handleMethodSelect('cb_perso')}
                className="w-full px-6 py-6 text-left hover:bg-blue-50 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="text-4xl">💳</div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">CB Perso</h3>
                    <p className="text-sm text-slate-600">À rembourser via note de frais mensuelle</p>
                  </div>
                </div>
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <button
                onClick={() => handleMethodSelect('cb_pro')}
                className="w-full px-6 py-6 text-left hover:bg-blue-50 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="text-4xl">🏢</div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">CB Pro</h3>
                    <p className="text-sm text-slate-600">À envoyer directement à la comptabilité</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE 2 : CHOIX RAISON */}
        {step === 'reason' && paymentMethod && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h3 className="text-lg font-semibold text-slate-900">Choix de raison</h3>
              <p className="mt-1 text-sm text-slate-600">
                {paymentMethod === 'cb_perso'
                  ? 'Pourquoi cette depense perso doit etre suivie ce mois-ci ?'
                  : 'Quel est le contexte de cette depense pro ?'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {reasonOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleReasonSelect(option)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-left text-sm font-medium text-slate-900 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                >
                  {option}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setStep('method')}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              {t('expenses.back')}
            </button>
          </div>
        )}

        {/* ÉTAPE 3 : SCAN FACTURE */}
        {step === 'scan' && (
          <div className="space-y-4">
            {/* Message */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                {paymentMethod === 'cb_perso' 
                  ? 'Cette dépense sera ajoutée à votre note de frais du mois'
                  : 'Cette facture sera envoyée à la comptabilité automatiquement'}
              </p>
              {reason && (
                <p className="mt-2 text-xs text-blue-800">Raison: <strong>{reason}</strong></p>
              )}
            </div>

            {/* Upload Area */}
            <div className="bg-white rounded-xl shadow-sm border-2 border-dashed border-slate-300 p-12 text-center hover:border-blue-400 transition-colors">
              <div className="max-w-sm mx-auto mb-5">
                <label className="block text-xs font-medium text-slate-700 mb-2">
                  {t('expenses.validationCode')}
                </label>
                <input
                  type="password"
                  value={validationCode}
                  onChange={(e) => setValidationCode(e.target.value)}
                  placeholder={t('expenses.enterCode')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  disabled={isLoading}
                />
              </div>

              {!image ? (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="photo-input"
                    disabled={isLoading || !validationCode.trim()}
                  />
                  <label
                    htmlFor="photo-input"
                    className={`space-y-3 block ${
                      validationCode.trim() ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                    }`}
                  >
                    <div className="text-5xl">📷</div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{t('expenses.choosePhoto')}</h3>
                      <p className="text-sm text-slate-600">{t('expenses.orDrop')}</p>
                    </div>
                  </label>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="text-5xl">✓</div>
                  <p className="text-slate-900 font-semibold">
                    {isLoading ? t('expenses.processing') : t('expenses.scanned')}
                  </p>
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-900">{error}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep('reason');
                  setImage(null);
                  setError(null);
                }}
                className="flex-1 px-4 py-3 rounded-lg border border-slate-300 text-slate-900 font-medium hover:bg-slate-50 transition-colors"
              >
                {t('expenses.back')}
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE 4 : CONFIRMATION */}
        {step === 'review' && (
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 text-center space-y-3">
              <div className="text-5xl">✓</div>
              <h3 className="text-lg font-semibold text-emerald-900">
                {paymentMethod === 'cb_perso'
                  ? 'Dépense enregistrée !'
                  : 'Facture envoyée !'}
              </h3>
              <p className="text-sm text-emerald-800">
                {paymentMethod === 'cb_perso'
                  ? 'Votre dépense sera incluse dans la note de frais de ce mois'
                  : 'Votre facture a été envoyée à la comptabilité'}
              </p>
            </div>

            {/* Détails */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-600 uppercase mb-1">Fournisseur</p>
                  <p className="font-semibold text-slate-900">{formData.vendor || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 uppercase mb-1">Type</p>
                  <p className="font-semibold text-slate-900">{formData.category || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 uppercase mb-1">Montant HT</p>
                  <p className="font-semibold text-slate-900">{formData.amount_ht || '-'} €</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 uppercase mb-1">Taxe</p>
                  <p className="font-semibold text-slate-900">{formData.amount_tva || '-'} €</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 uppercase mb-1">Montant TTC</p>
                  <p className="font-semibold text-slate-900">{formData.amount_ttc || '-'} €</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 uppercase mb-1">N° Facture</p>
                  <p className="font-semibold text-slate-900 text-sm">{formData.invoice_number || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 uppercase mb-1">Date</p>
                  <p className="font-semibold text-slate-900">{formData.invoice_date || '-'}</p>
                </div>
              </div>
            </div>

            <p className="text-sm text-slate-600 text-center">
              Redirection vers l&apos;historique dans 2 secondes...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
