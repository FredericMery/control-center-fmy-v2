'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

type PaymentMethod = 'cb_perso' | 'cb_pro';

export default function ExpenseForm() {
  const router = useRouter();
  const [step, setStep] = useState<'method' | 'scan' | 'review'>('method');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    vendor: '',
    amount_ttc: '',
    invoice_number: '',
    invoice_date: '',
  });

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
      setError('Authentification requise. Veuillez vous reconnecter.');
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
        }),
      });

      const data = await response.json();
      console.log('📦 Réponse API:', data);

      if (!response.ok) {
        const errorMsg = data.error || 'Erreur lors du scan';
        console.error('❌ Erreur API:', errorMsg);
        setError(errorMsg);
        setImage(null); // Reset l'image pour permettre un nouveau scan
        return;
      }

      // Succès
      console.log('✅ Dépense créée avec succès');
      setStep('review');
      setFormData({
        vendor: data.expense.vendor || '',
        amount_ttc: data.expense.amount_ttc?.toString() || '',
        invoice_number: data.expense.invoice_number || '',
        invoice_date: data.expense.invoice_date || '',
      });

      // Rediriger après 2 secondes
      setTimeout(() => {
        router.push('/dashboard/notifications');
      }, 2000);
    } catch (err: any) {
      const errorMsg = err?.message || 'Erreur lors du traitement de la facture';
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
          <h1 className="text-2xl font-bold text-slate-900">Saisir une dépense</h1>
          <p className="text-sm text-slate-600">Scannez votre facture pour extraire les données</p>
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

        {/* ÉTAPE 2 : SCAN FACTURE */}
        {step === 'scan' && (
          <div className="space-y-4">
            {/* Message */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                {paymentMethod === 'cb_perso' 
                  ? 'Cette dépense sera ajoutée à votre note de frais du mois'
                  : 'Cette facture sera envoyée à la comptabilité automatiquement'}
              </p>
            </div>

            {/* Upload Area */}
            <div className="bg-white rounded-xl shadow-sm border-2 border-dashed border-slate-300 p-12 text-center hover:border-blue-400 transition-colors">
              {!image ? (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="photo-input"
                    disabled={isLoading}
                  />
                  <label
                    htmlFor="photo-input"
                    className="cursor-pointer space-y-3 block"
                  >
                    <div className="text-5xl">📷</div>
                    <div>
                      <h3 className="font-semibold text-slate-900">Choisir une photo</h3>
                      <p className="text-sm text-slate-600">ou glissez-la ici</p>
                    </div>
                  </label>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="text-5xl">✓</div>
                  <p className="text-slate-900 font-semibold">
                    {isLoading ? 'Analyse en cours...' : 'Facture scannée'}
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
                  setStep('method');
                  setImage(null);
                  setError(null);
                }}
                className="flex-1 px-4 py-3 rounded-lg border border-slate-300 text-slate-900 font-medium hover:bg-slate-50 transition-colors"
              >
                Retour
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE 3 : CONFIRMATION */}
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
              Redirection vers l'historique dans 2 secondes...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
