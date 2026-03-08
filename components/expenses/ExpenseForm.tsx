'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { trackApiCall, trackAppUsage } from '@/lib/tracking/analytics';
import { useI18n } from '@/components/providers/LanguageProvider';

type PaymentMethod = 'cb_perso' | 'cb_pro';
type ExpenseStep = 'method' | 'recipient' | 'reason' | 'scan' | 'review';

type ExpenseRecipient = {
  id: string;
  name: string;
  destination: string;
  created_at: string;
};

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

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

const DIRECT_READ_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const CONVERT_TO_JPEG_TYPES = new Set(['image/heic', 'image/heif']);

const MAX_IMAGE_DIMENSION = 2200;

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
  const [recipients, setRecipients] = useState<ExpenseRecipient[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('');
  const [showAddRecipient, setShowAddRecipient] = useState(false);
  const [newRecipientName, setNewRecipientName] = useState('');
  const [newRecipientDestination, setNewRecipientDestination] = useState('');
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [savingRecipient, setSavingRecipient] = useState(false);
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

  useEffect(() => {
    if (!authToken) return;
    loadRecipients(authToken);
  }, [authToken]);

  const handleMethodSelect = (method: PaymentMethod) => {
    setPaymentMethod(method);
    setReason('');
    setSelectedRecipientId('');
    setShowAddRecipient(false);
    setError(null);
    setStep(method === 'cb_perso' ? 'recipient' : 'reason');
  };

  const handleReasonSelect = (selectedReason: string) => {
    setReason(selectedReason);
    setStep('scan');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mimeType = inferMimeType(file);
    if (mimeType && !SUPPORTED_IMAGE_TYPES.has(mimeType)) {
      setError('Format non pris en charge. Utilisez une photo iPhone/Android (JPG, PNG, WEBP, HEIC/HEIF) ou un PDF.');
      setImage(null);
      return;
    }

    setError(null);

    try {
      const isPdf = mimeType === 'application/pdf';

      if (isPdf) {
        const pdfDataUrl = await readFileAsDataUrl(file);
        setImage(pdfDataUrl);
        handleScan(pdfDataUrl);
        return;
      }

      // JPEG/PNG/WEBP sont utilises tels quels pour eviter les transformations inutiles.
      if (DIRECT_READ_IMAGE_TYPES.has(mimeType)) {
        const imageDataUrl = await readFileAsDataUrl(file);
        setImage(imageDataUrl);
        handleScan(imageDataUrl);
        return;
      }

      // HEIC/HEIF (iPhone) sont convertis en JPEG pour compatibilite OCR/API.
      if (CONVERT_TO_JPEG_TYPES.has(mimeType) || mimeType.startsWith('image/')) {
        const jpegDataUrl = await convertImageToJpegDataUrl(file);
        setImage(jpegDataUrl);
        handleScan(jpegDataUrl);
        return;
      }

      const fallbackDataUrl = await readFileAsDataUrl(file);
      setImage(fallbackDataUrl);
      handleScan(fallbackDataUrl);
    } catch {
      setImage(null);
      setError(
        'Impossible de lire ce fichier. Reessayez avec une photo (JPG/PNG/WEBP/HEIC) ou un PDF.'
      );
    }
  };

  const handleScan = async (base64Image: string) => {
    if (!authToken) {
      setError('Authentication required. Please sign in again.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const selectedRecipient = recipients.find((recipient) => recipient.id === selectedRecipientId);

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
          recipientName: selectedRecipient?.name || null,
          recipientDestination: selectedRecipient?.destination || null,
        }),
      });

      const data = await response.json();
      console.log('📦 Réponse API:', data);

      if (!response.ok) {
        const errorMsg = mapUploadError(data.error || t('expenses.scanError'));
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
        router.push('/dashboard/expenses');
      }, 2000);
    } catch (err: unknown) {
      const errorMsg = mapUploadError(err instanceof Error ? err.message : t('expenses.processingError'));
      setError(errorMsg);
      setImage(null); // Reset l'image pour permettre un nouveau scan
      console.error('❌ Erreur catch:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRecipients = async (token: string) => {
    try {
      setRecipientsLoading(true);
      const list = await fetchRecipients(token);
      setRecipients(list);
      if (list.length > 0 && !selectedRecipientId) {
        setSelectedRecipientId(list[0].id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur chargement destinataires';
      setError(message);
    } finally {
      setRecipientsLoading(false);
    }
  };

  const handleCreateRecipient = async () => {
    if (!authToken) {
      setError('Non authentifie. Veuillez vous reconnecter.');
      return;
    }

    const name = newRecipientName.trim();
    const destination = newRecipientDestination.trim();

    if (!name || !destination) {
      setError('Nom destinataire et destinataire sont requis');
      return;
    }

    try {
      setSavingRecipient(true);
      setError(null);

      const response = await fetch('/api/settings/expense-recipients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ name, destination }),
      });

      const json = (await response.json()) as { recipient?: ExpenseRecipient; error?: string };
      if (!response.ok || !json.recipient) {
        setError(json.error || 'Erreur creation destinataire');
        return;
      }

      setRecipients((prev) => [json.recipient!, ...prev]);
      setSelectedRecipientId(json.recipient.id);
      setNewRecipientName('');
      setNewRecipientDestination('');
      setShowAddRecipient(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur creation destinataire';
      setError(message);
    } finally {
      setSavingRecipient(false);
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
              onClick={() => setStep(paymentMethod === 'cb_perso' ? 'recipient' : 'method')}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              {t('expenses.back')}
            </button>
          </div>
        )}

        {/* ETAPE 2 BIS : DESTINATAIRE CB PERSO */}
        {step === 'recipient' && paymentMethod === 'cb_perso' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h3 className="text-lg font-semibold text-slate-900">Destinataire de la depense</h3>
              <p className="mt-1 text-sm text-slate-600">
                Selectionnez l entreprise destinataire avant de scanner la facture.
              </p>
            </div>

            {recipientsLoading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                Chargement des destinataires...
              </div>
            ) : recipients.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Aucun destinataire enregistre. Ajoutez-en un pour continuer.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {recipients.map((recipient) => {
                  const selected = recipient.id === selectedRecipientId;
                  return (
                    <button
                      key={recipient.id}
                      type="button"
                      onClick={() => setSelectedRecipientId(recipient.id)}
                      className={`rounded-xl border px-4 py-4 text-left text-sm transition ${
                        selected
                          ? 'border-blue-400 bg-blue-50 text-blue-900'
                          : 'border-slate-200 bg-white text-slate-900 hover:border-blue-300'
                      }`}
                    >
                      <p className="font-semibold">{recipient.name}</p>
                      <p className="text-xs text-slate-600 mt-1">{recipient.destination}</p>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowAddRecipient((prev) => !prev)}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              + Ajouter un destinataire
            </button>

            {showAddRecipient && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nom destinataire</label>
                  <input
                    type="text"
                    value={newRecipientName}
                    onChange={(e) => setNewRecipientName(e.target.value)}
                    placeholder="Entreprise Alpha"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    disabled={savingRecipient}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Destinataire</label>
                  <input
                    type="text"
                    value={newRecipientDestination}
                    onChange={(e) => setNewRecipientDestination(e.target.value)}
                    placeholder="compta@entreprise.com"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                    disabled={savingRecipient}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateRecipient}
                  disabled={savingRecipient}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingRecipient ? 'Enregistrement...' : 'Enregistrer destinataire'}
                </button>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('method')}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium text-slate-900 hover:bg-slate-50"
              >
                {t('expenses.back')}
              </button>
              <button
                type="button"
                onClick={() => setStep('reason')}
                disabled={!selectedRecipientId}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                Continuer
              </button>
            </div>
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
              {paymentMethod === 'cb_perso' && selectedRecipientId && (
                <p className="mt-1 text-xs text-blue-800">
                  Destinataire: <strong>{recipients.find((r) => r.id === selectedRecipientId)?.name || '-'}</strong>
                </p>
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
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
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
                      <h3 className="font-semibold text-slate-900">Choisir une photo ou un PDF</h3>
                      <p className="text-sm text-slate-600">Formats: image et PDF</p>
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

function inferMimeType(file: File): string {
  const raw = String(file.type || '').toLowerCase().trim();
  if (raw) return raw;

  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.heic')) return 'image/heic';
  if (name.endsWith('.heif')) return 'image/heif';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  return '';
}

function mapUploadError(message: string): string {
  const raw = String(message || '').trim();
  const lower = raw.toLowerCase();

  if (!raw) return 'Erreur lors du traitement du fichier.';

  if (lower.includes('expected pattern') || lower.includes('did not match the expected pattern')) {
    return 'Fichier recu mais non interpretable. Reessayez en JPG/PNG/WEBP/HEIC ou PDF.';
  }

  if (lower.includes('invalid image') || lower.includes('image invalide')) {
    return 'Le fichier ne peut pas etre traite comme justificatif valide.';
  }

  return raw;
}

async function fetchRecipients(token: string): Promise<ExpenseRecipient[]> {
  const response = await fetch('/api/settings/expense-recipients', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const json = (await response.json()) as { recipients?: ExpenseRecipient[]; error?: string };
  if (!response.ok) {
    throw new Error(json.error || 'Erreur chargement destinataires');
  }

  return json.recipients || [];
}


async function convertImageToJpegDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(objectUrl);
    const { width, height } = getScaledDimensions(image.width, image.height, MAX_IMAGE_DIMENSION);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas context unavailable');
    }

    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.9);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = src;
  });
}

function getScaledDimensions(width: number, height: number, maxDimension: number) {
  const largest = Math.max(width, height);
  if (largest <= maxDimension) {
    return { width, height };
  }

  const ratio = maxDimension / largest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}
