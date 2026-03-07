'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  isContactPickerSupported,
  getContactsPermission,
  setContactsPermission,
} from '@/lib/contacts/contactPicker';
import { useI18n } from '@/components/providers/LanguageProvider';

interface EmailSetting {
  id: string;
  type: 'facture' | 'ndf';
  email: string;
}

interface ExpenseRecipient {
  id: string;
  name: string;
  destination: string;
  created_at: string;
}

export default function EmailSettingsForm() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<EmailSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    facture: '',
    ndf: '',
  });
  const [contactsSupported, setContactsSupported] = useState(false);
  const [contactsEnabled, setContactsEnabled] = useState(false);
  const [recipients, setRecipients] = useState<ExpenseRecipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [recipientDestination, setRecipientDestination] = useState('');

  // Récupérer le token Supabase
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

    // Vérifier si Contact Picker est supportée
    setContactsSupported(isContactPickerSupported());
    setContactsEnabled(getContactsPermission());
    };
    getAuthToken();
  }, []);

  // Charger les paramètres
  useEffect(() => {
    if (!authToken) return;

    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        console.log('🔍 Chargement des paramètres email...');
        const response = await fetch('/api/settings/emails', {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        });

        const data = await response.json();
        console.log('📦 Réponse API:', data);

        if (!response.ok) {
          console.error('❌ Erreur:', data.error);
          throw new Error(data.error || 'Erreur chargement');
        }

        setSettings(data.settings);

        // Pré-remplir le formulaire
        const factureEmail = data.settings.find((s: EmailSetting) => s.type === 'facture')?.email || '';
        const ndfEmail = data.settings.find((s: EmailSetting) => s.type === 'ndf')?.email || '';
        setFormData({ facture: factureEmail, ndf: ndfEmail });
        console.log('✅ Paramètres chargés avec succès');
      } catch (err: any) {
        console.error('❌ Erreur fetch:', err);
        setError(err?.message || 'Impossible de charger les paramètres');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [authToken]);

  useEffect(() => {
    if (!authToken) return;

    const fetchRecipients = async () => {
      try {
        setRecipientsLoading(true);
        const response = await fetch('/api/settings/expense-recipients', {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Erreur chargement destinataires');
        }

        setRecipients(data.recipients || []);
      } catch (err: any) {
        setError(err?.message || 'Erreur chargement destinataires');
      } finally {
        setRecipientsLoading(false);
      }
    };

    fetchRecipients();
  }, [authToken]);

  const handleSave = async (type: 'facture' | 'ndf') => {
    const email = formData[type];

    if (!email) {
      setError(`L'email pour ${type} est requis`);
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Email invalide');
      return;
    }

    if (!authToken) {
      setError('Non authentifié. Veuillez vous reconnecter.');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      console.log('💾 Sauvegarde de l\'email', type, ':', email);
      const response = await fetch('/api/settings/emails', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ type, email }),
      });

      const data = await response.json();
      console.log('📦 Réponse:', data);

      if (!response.ok) {
        const errorMsg = data.error || 'Erreur sauvegarde';
        console.error('❌ Erreur:', errorMsg);
        setError(errorMsg);
        return;
      }

      console.log('✅ Sauvegardé avec succès');
      setSuccess(data.message);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('❌ Erreur catch:', err);
      setError(err?.message || 'Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddRecipient = async () => {
    if (!authToken) {
      setError('Non authentifie. Veuillez vous reconnecter.');
      return;
    }

    const name = recipientName.trim();
    const destination = recipientDestination.trim();
    if (!name || !destination) {
      setError('Nom destinataire et destinataire requis');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      const response = await fetch('/api/settings/expense-recipients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ name, destination }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erreur creation destinataire');
      }

      if (data.recipient) {
        setRecipients((prev) => [data.recipient, ...prev]);
      }
      setRecipientName('');
      setRecipientDestination('');
      setSuccess('Destinataire ajoute');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Erreur creation destinataire');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRecipient = async (id: string) => {
    if (!authToken) {
      setError('Non authentifie. Veuillez vous reconnecter.');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      const response = await fetch(`/api/settings/expense-recipients?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erreur suppression destinataire');
      }

      setRecipients((prev) => prev.filter((recipient) => recipient.id !== id));
    } catch (err: any) {
      setError(err?.message || 'Erreur suppression destinataire');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-slate-200 rounded-lg animate-pulse"></div>
        <div className="h-32 bg-slate-200 rounded-lg animate-pulse"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('emails.title')}</h2>
        <p className="text-slate-600 text-sm">
          {t('emails.subtitle')}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-900">{error}</p>
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <p className="text-sm text-emerald-900">✓ {success}</p>
        </div>
      )}

      {/* Email Factures */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="text-2xl">📧</div>
          <div>
            <h3 className="font-semibold text-slate-900">Email Factures CB Pro</h3>
            <p className="text-xs text-slate-600">
              Les factures CB Pro seront envoyées à cette adresse
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            placeholder="comptabilite@company.com"
            value={formData.facture}
            onChange={(e) =>
              setFormData({ ...formData, facture: e.target.value })
            }
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
          <button
            onClick={() => handleSave('facture')}
            disabled={isSaving}
            className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isSaving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>

      {/* Email NDF */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="text-2xl">📄</div>
          <div>
            <h3 className="font-semibold text-slate-900">Email Notes de Frais</h3>
            <p className="text-xs text-slate-600">
              Les notes de frais seront envoyées à cette adresse
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <input
            type="email"
            placeholder="rh@company.com"
            value={formData.ndf}
            onChange={(e) =>
              setFormData({ ...formData, ndf: e.target.value })
            }
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
          <button
            onClick={() => handleSave('ndf')}
            disabled={isSaving}
            className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isSaving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>

      {/* Destinataires depenses CB Perso */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🏢</div>
          <div>
            <h3 className="font-semibold text-slate-900">Destinataires depenses CB Perso</h3>
            <p className="text-xs text-slate-600">
              Ces destinataires sont proposes dans le workflow depense perso.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            type="text"
            placeholder="Nom destinataire (ex: Entreprise ABC)"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
          <input
            type="text"
            placeholder="Destinataire (ex: compta@abc.com)"
            value={recipientDestination}
            onChange={(e) => setRecipientDestination(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>

        <button
          onClick={handleAddRecipient}
          disabled={isSaving}
          className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isSaving ? t('common.loading') : '+ Ajouter un destinataire'}
        </button>

        {recipientsLoading ? (
          <p className="text-sm text-slate-600">Chargement des destinataires...</p>
        ) : recipients.length === 0 ? (
          <p className="text-sm text-slate-600">Aucun destinataire enregistre.</p>
        ) : (
          <div className="space-y-2">
            {recipients.map((recipient) => (
              <div
                key={recipient.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{recipient.name}</p>
                  <p className="text-xs text-slate-600">{recipient.destination}</p>
                </div>
                <button
                  onClick={() => handleDeleteRecipient(recipient.id)}
                  className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">

      {/* Contacts Settings */}
      {contactsSupported && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl">📱</div>
              <div>
                <h3 className="font-semibold text-slate-900">Accès aux contacts</h3>
                <p className="text-xs text-slate-600">
                  Autoriser l'accès à votre carnet de contacts
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const newState = !contactsEnabled;
                setContactsPermission(newState);
                setContactsEnabled(newState);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                contactsEnabled
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-200 text-slate-900 hover:bg-slate-300'
              }`}
            >
              {contactsEnabled ? `✓ ${t('common.enabled')}` : t('common.disabled')}
            </button>
            
            <p className="text-sm text-slate-600">
              {contactsEnabled
                ? '✓ Vous pouvez sélectionner des contacts lors du transfert de tâches'
                : '❌ Désactivé pour l\'instant'}
            </p>
          </div>

          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-900">
              <strong>🔒 Confidentialité:</strong> Vos contacts ne sont jamais envoyés à nos serveurs. Ils sont stockés localement sur votre navigateur.
            </p>
          </div>
        </div>
      )}
        <p className="text-sm text-blue-900">
          <strong>💡 Info:</strong> Ces adresses sont utilisées pour router automatiquement les factures CB Pro et envoyer les notes de frais chaque mois.
        </p>
      </div>
    </div>
  );
}
