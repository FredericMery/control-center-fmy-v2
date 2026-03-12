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

interface NdfProfile {
  validatorFirstName: string;
  validatorLastName: string;
  companyRecipientId: string | null;
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
  const [emailDrafts, setEmailDrafts] = useState({
    facture: '',
    ndf: '',
  });
  const [contactsSupported, setContactsSupported] = useState(false);
  const [contactsEnabled, setContactsEnabled] = useState(false);
  const [recipients, setRecipients] = useState<ExpenseRecipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [recipientDestination, setRecipientDestination] = useState('');
  const [ndfProfile, setNdfProfile] = useState<NdfProfile>({
    validatorFirstName: '',
    validatorLastName: '',
    companyRecipientId: null,
  });

  const parseEmailEntries = (raw: string) =>
    String(raw || '')
      .split(/[;,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const uniqueEmails = (emails: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];

    for (const email of emails) {
      const key = email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(email);
    }

    return out;
  };

  const normalizeEmails = (raw: string) => uniqueEmails(parseEmailEntries(raw));

  const formatEmails = (emails: string[]) => emails.join(', ');

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
        const factureEmail = formatEmails(
          normalizeEmails(data.settings.find((s: EmailSetting) => s.type === 'facture')?.email || '')
        );
        const ndfEmail = formatEmails(
          normalizeEmails(data.settings.find((s: EmailSetting) => s.type === 'ndf')?.email || '')
        );
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

  useEffect(() => {
    if (!authToken) return;

    const fetchNdfProfile = async () => {
      try {
        const response = await fetch('/api/settings/ndf-profile', {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Erreur chargement profil NDF');
        }

        const profile = data.profile || {};
        setNdfProfile({
          validatorFirstName: String(profile.validatorFirstName || ''),
          validatorLastName: String(profile.validatorLastName || ''),
          companyRecipientId: profile.companyRecipientId || null,
        });
      } catch (err: any) {
        setError(err?.message || 'Erreur chargement profil NDF');
      }
    };

    fetchNdfProfile();
  }, [authToken]);

  const handleSave = async (type: 'facture' | 'ndf') => {
    const rawEntries = parseEmailEntries(formData[type]);
    const invalidEmails = rawEntries.filter((entry) => !isValidEmail(entry));
    const emails = uniqueEmails(rawEntries);

    if (emails.length === 0) {
      setError(`Au moins un email pour ${type} est requis`);
      return;
    }

    if (invalidEmails.length > 0) {
      setError(`Email(s) invalide(s): ${invalidEmails.join(', ')}`);
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
      const payloadEmail = formatEmails(emails);
      console.log('💾 Sauvegarde des emails', type, ':', payloadEmail);
      const response = await fetch('/api/settings/emails', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ type, email: payloadEmail }),
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
      setFormData((prev) => ({ ...prev, [type]: payloadEmail }));
      setSuccess(data.message);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('❌ Erreur catch:', err);
      setError(err?.message || 'Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddEmail = (type: 'facture' | 'ndf') => {
    const draft = String(emailDrafts[type] || '').trim();

    if (!draft) {
      setError('Veuillez saisir une adresse email');
      return;
    }

    if (!isValidEmail(draft)) {
      setError('Email invalide');
      return;
    }

    const current = normalizeEmails(formData[type]);
    const alreadyExists = current.some((email) => email.toLowerCase() === draft.toLowerCase());
    if (alreadyExists) {
      setError('Cette adresse est deja ajoutee');
      return;
    }

    const updated = [...current, draft];
    setFormData((prev) => ({ ...prev, [type]: formatEmails(updated) }));
    setEmailDrafts((prev) => ({ ...prev, [type]: '' }));
    setError(null);
  };

  const handleRemoveEmail = (type: 'facture' | 'ndf', emailToRemove: string) => {
    const updated = normalizeEmails(formData[type]).filter(
      (email) => email.toLowerCase() !== emailToRemove.toLowerCase()
    );

    setFormData((prev) => ({ ...prev, [type]: formatEmails(updated) }));
    setError(null);
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
        setNdfProfile((prev) => ({
          ...prev,
          companyRecipientId: prev.companyRecipientId || data.recipient.id,
        }));
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
      setNdfProfile((prev) => ({
        ...prev,
        companyRecipientId: prev.companyRecipientId === id ? null : prev.companyRecipientId,
      }));
    } catch (err: any) {
      setError(err?.message || 'Erreur suppression destinataire');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNdfProfile = async () => {
    if (!authToken) {
      setError('Non authentifie. Veuillez vous reconnecter.');
      return;
    }

    const firstName = ndfProfile.validatorFirstName.trim();
    const lastName = ndfProfile.validatorLastName.trim();
    if (!firstName || !lastName) {
      setError('Nom et prenom du valideur requis');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/settings/ndf-profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          validatorFirstName: firstName,
          validatorLastName: lastName,
          companyRecipientId: ndfProfile.companyRecipientId,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erreur sauvegarde profil NDF');
      }

      setSuccess(data.message || 'Profil NDF sauvegarde');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Erreur sauvegarde profil NDF');
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
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="comptabilite@company.com"
              value={emailDrafts.facture}
              onChange={(e) =>
                setEmailDrafts((prev) => ({ ...prev, facture: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-300 px-4 py-2 text-black placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => handleAddEmail('facture')}
              disabled={isSaving}
              className="rounded-lg border border-blue-200 px-4 py-2 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              +
            </button>
          </div>

          {normalizeEmails(formData.facture).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {normalizeEmails(formData.facture).map((email) => (
                <div key={email} className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1">
                  <span className="text-xs text-slate-800">{email}</span>
                  <button
                    onClick={() => handleRemoveEmail('facture', email)}
                    className="text-xs text-slate-500 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Aucune adresse configuree.</p>
          )}

          <p className="text-xs text-slate-500">Ajoutez plusieurs emails avec le bouton +, puis cliquez sur Sauvegarder.</p>
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
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="rh@company.com"
              value={emailDrafts.ndf}
              onChange={(e) =>
                setEmailDrafts((prev) => ({ ...prev, ndf: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-300 px-4 py-2 text-black placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={() => handleAddEmail('ndf')}
              disabled={isSaving}
              className="rounded-lg border border-blue-200 px-4 py-2 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              +
            </button>
          </div>

          {normalizeEmails(formData.ndf).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {normalizeEmails(formData.ndf).map((email) => (
                <div key={email} className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1">
                  <span className="text-xs text-slate-800">{email}</span>
                  <button
                    onClick={() => handleRemoveEmail('ndf', email)}
                    className="text-xs text-slate-500 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Aucune adresse configuree.</p>
          )}

          <p className="text-xs text-slate-500">Ajoutez plusieurs emails avec le bouton +, puis cliquez sur Sauvegarder.</p>
          <button
            onClick={() => handleSave('ndf')}
            disabled={isSaving}
            className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {isSaving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>

      {/* Profil NDF */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl">✅</div>
          <div>
            <h3 className="font-semibold text-slate-900">Profil NDF</h3>
            <p className="text-xs text-slate-600">
              Valideur de la NDF et entreprise par defaut utilises pour le PDF.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            type="text"
            placeholder="Valideur - Prenom"
            value={ndfProfile.validatorFirstName}
            onChange={(e) =>
              setNdfProfile((prev) => ({ ...prev, validatorFirstName: e.target.value }))
            }
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-black placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Valideur - Nom"
            value={ndfProfile.validatorLastName}
            onChange={(e) =>
              setNdfProfile((prev) => ({ ...prev, validatorLastName: e.target.value }))
            }
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-black placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Entreprise</label>
          <select
            value={ndfProfile.companyRecipientId || ''}
            onChange={(e) =>
              setNdfProfile((prev) => ({
                ...prev,
                companyRecipientId: e.target.value ? e.target.value : null,
              }))
            }
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-black outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Aucune entreprise selectionnee</option>
            {recipients.map((recipient) => (
              <option key={recipient.id} value={recipient.id}>
                {recipient.name} ({recipient.destination})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSaveNdfProfile}
          disabled={isSaving}
          className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isSaving ? t('common.loading') : t('common.save')}
        </button>
      </div>

      {/* Entreprises (depenses CB Perso) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🏢</div>
          <div>
            <h3 className="font-semibold text-slate-900">Entreprises (depenses CB Perso)</h3>
            <p className="text-xs text-slate-600">
              Ces entreprises sont proposees dans le workflow depense perso et la NDF.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            type="text"
            placeholder="Nom destinataire (ex: Entreprise ABC)"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-black placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Destinataire (ex: compta@abc.com)"
            value={recipientDestination}
            onChange={(e) => setRecipientDestination(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-black placeholder:text-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <button
          onClick={handleAddRecipient}
          disabled={isSaving}
          className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isSaving ? t('common.loading') : '+ Ajouter une entreprise'}
        </button>

        {recipientsLoading ? (
          <p className="text-sm text-slate-600">Chargement des destinataires...</p>
        ) : recipients.length === 0 ? (
          <p className="text-sm text-slate-600">Aucune entreprise enregistree.</p>
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
