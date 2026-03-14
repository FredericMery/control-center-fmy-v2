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
  const [companyName, setCompanyName] = useState('');
  const [companyNdfEmail, setCompanyNdfEmail] = useState('');
  const [companyPaymentEmail, setCompanyPaymentEmail] = useState('');
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [editingRecipientId, setEditingRecipientId] = useState<string | null>(null);
  const [companyExtraNdfEmails, setCompanyExtraNdfEmails] = useState<string[]>([]);
  const [companyExtraJustifEmails, setCompanyExtraJustifEmails] = useState<string[]>([]);
  const [companyExtraNdfDraft, setCompanyExtraNdfDraft] = useState('');
  const [companyExtraJustifDraft, setCompanyExtraJustifDraft] = useState('');
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
      const response = await fetch('/api/settings/emails', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ type, email: payloadEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur sauvegarde');
      }

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

  const handleCreateCompany = async () => {
    if (!authToken) {
      setError('Non authentifie. Veuillez vous reconnecter.');
      return;
    }

    const name = companyName.trim();
    const ndfEmail = companyNdfEmail.trim();
    const paymentEmail = companyPaymentEmail.trim();

    if (!name || !ndfEmail || !paymentEmail) {
      setError('Nom societe, email NDF et email justificatif sont requis');
      return;
    }

    if (!isValidEmail(ndfEmail) || !isValidEmail(paymentEmail)) {
      setError('Email NDF ou justificatif invalide');
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
        body: JSON.stringify({
          name,
          destination: paymentEmail,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erreur creation destinataire');
      }

      const allNdfEmails = [ndfEmail, ...companyExtraNdfEmails].filter((e) => isValidEmail(e));
      const allJustifEmails = [paymentEmail, ...companyExtraJustifEmails].filter((e) => isValidEmail(e));
      const updatedNdfEmails = uniqueEmails([...normalizeEmails(formData.ndf), ...allNdfEmails]);
      const updatedPaymentEmails = uniqueEmails([...normalizeEmails(formData.facture), ...allJustifEmails]);

      const [saveNdfRes, saveFactureRes] = await Promise.all([
        fetch('/api/settings/emails', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ type: 'ndf', email: formatEmails(updatedNdfEmails) }),
        }),
        fetch('/api/settings/emails', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ type: 'facture', email: formatEmails(updatedPaymentEmails) }),
        }),
      ]);

      const saveNdfJson = await saveNdfRes.json();
      const saveFactureJson = await saveFactureRes.json();
      if (!saveNdfRes.ok) {
        throw new Error(saveNdfJson.error || 'Erreur sauvegarde destinataire NDF');
      }
      if (!saveFactureRes.ok) {
        throw new Error(saveFactureJson.error || 'Erreur sauvegarde destinataire justificatif');
      }

      if (data.recipient) {
        setRecipients((prev) => [data.recipient, ...prev]);
        setNdfProfile((prev) => ({
          ...prev,
          companyRecipientId: prev.companyRecipientId || data.recipient.id,
        }));
      }

      setFormData({
        ndf: formatEmails(updatedNdfEmails),
        facture: formatEmails(updatedPaymentEmails),
      });
      setCompanyName('');
      setCompanyNdfEmail('');
      setCompanyPaymentEmail('');
      setCompanyExtraNdfEmails([]);
      setCompanyExtraJustifEmails([]);
      setCompanyExtraNdfDraft('');
      setCompanyExtraJustifDraft('');
      setShowCompanyForm(false);
      setEditingRecipientId(null);
      setSuccess('Societe creee avec destinataires NDF et justificatif');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Erreur creation societe');
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
      setSelectedRecipientId((prev) => (prev === id ? null : prev));
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

  const handleAddExtraEmail = (type: 'ndf' | 'justif') => {
    const draft = (type === 'ndf' ? companyExtraNdfDraft : companyExtraJustifDraft).trim();
    if (!draft) {
      setError('Veuillez saisir une adresse email');
      return;
    }
    if (!isValidEmail(draft)) {
      setError('Email invalide');
      return;
    }
    if (type === 'ndf') {
      if (companyExtraNdfEmails.some((e) => e.toLowerCase() === draft.toLowerCase())) {
        setError('Email deja ajoute');
        return;
      }
      setCompanyExtraNdfEmails((prev) => [...prev, draft]);
      setCompanyExtraNdfDraft('');
    } else {
      if (companyExtraJustifEmails.some((e) => e.toLowerCase() === draft.toLowerCase())) {
        setError('Email deja ajoute');
        return;
      }
      setCompanyExtraJustifEmails((prev) => [...prev, draft]);
      setCompanyExtraJustifDraft('');
    }
    setError(null);
  };

  const handleRemoveExtraEmail = (type: 'ndf' | 'justif', email: string) => {
    if (type === 'ndf') {
      setCompanyExtraNdfEmails((prev) => prev.filter((e) => e.toLowerCase() !== email.toLowerCase()));
    } else {
      setCompanyExtraJustifEmails((prev) => prev.filter((e) => e.toLowerCase() !== email.toLowerCase()));
    }
  };

  const handleStartAdd = () => {
    setCompanyName('');
    setCompanyNdfEmail('');
    setCompanyPaymentEmail('');
    setCompanyExtraNdfEmails([]);
    setCompanyExtraJustifEmails([]);
    setCompanyExtraNdfDraft('');
    setCompanyExtraJustifDraft('');
    setEditingRecipientId(null);
    setShowCompanyForm(true);
    setError(null);
  };

  const handleStartEdit = () => {
    if (!selectedRecipientId) return;
    const recipient = recipients.find((r) => r.id === selectedRecipientId);
    if (!recipient) return;
    setCompanyName(recipient.name);
    setCompanyPaymentEmail(recipient.destination);
    setCompanyNdfEmail('');
    setCompanyExtraNdfEmails([]);
    setCompanyExtraJustifEmails([]);
    setCompanyExtraNdfDraft('');
    setCompanyExtraJustifDraft('');
    setEditingRecipientId(recipient.id);
    setShowCompanyForm(true);
    setError(null);
  };

  const handleCancelCompanyForm = () => {
    setShowCompanyForm(false);
    setEditingRecipientId(null);
    setCompanyName('');
    setCompanyNdfEmail('');
    setCompanyPaymentEmail('');
    setCompanyExtraNdfEmails([]);
    setCompanyExtraJustifEmails([]);
    setCompanyExtraNdfDraft('');
    setCompanyExtraJustifDraft('');
    setError(null);
  };

  const handleUpdateRecipient = async () => {
    if (!authToken || !editingRecipientId) return;

    const name = companyName.trim();
    const paymentEmail = companyPaymentEmail.trim();

    if (!name || !paymentEmail) {
      setError('Nom et email justificatif requis');
      return;
    }
    if (!isValidEmail(paymentEmail)) {
      setError('Email justificatif invalide');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const delRes = await fetch(
        `/api/settings/expense-recipients?id=${encodeURIComponent(editingRecipientId)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${authToken}` } }
      );
      if (!delRes.ok) {
        const delData = await delRes.json();
        throw new Error(delData.error || 'Erreur suppression');
      }

      const createRes = await fetch('/api/settings/expense-recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ name, destination: paymentEmail }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || 'Erreur creation');

      const ndfEmail = companyNdfEmail.trim();
      const allNewNdfEmails = [
        ...(ndfEmail && isValidEmail(ndfEmail) ? [ndfEmail] : []),
        ...companyExtraNdfEmails,
      ];
      const allNewJustifEmails = [...companyExtraJustifEmails];

      const promises: Promise<Response>[] = [];
      if (allNewNdfEmails.length > 0) {
        const updated = uniqueEmails([...normalizeEmails(formData.ndf), ...allNewNdfEmails]);
        setFormData((prev) => ({ ...prev, ndf: formatEmails(updated) }));
        promises.push(
          fetch('/api/settings/emails', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ type: 'ndf', email: formatEmails(updated) }),
          })
        );
      }
      if (allNewJustifEmails.length > 0) {
        const updated = uniqueEmails([...normalizeEmails(formData.facture), paymentEmail, ...allNewJustifEmails]);
        setFormData((prev) => ({ ...prev, facture: formatEmails(updated) }));
        promises.push(
          fetch('/api/settings/emails', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
            body: JSON.stringify({ type: 'facture', email: formatEmails(updated) }),
          })
        );
      }
      await Promise.all(promises);

      setRecipients((prev) => {
        const filtered = prev.filter((r) => r.id !== editingRecipientId);
        return createData.recipient ? [createData.recipient, ...filtered] : filtered;
      });
      if (ndfProfile.companyRecipientId === editingRecipientId && createData.recipient) {
        setNdfProfile((prev) => ({ ...prev, companyRecipientId: createData.recipient.id }));
      }
      setSelectedRecipientId((prev) =>
        prev === editingRecipientId && createData.recipient ? createData.recipient.id : prev
      );

      handleCancelCompanyForm();
      setSuccess('Societe mise a jour');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err?.message || 'Erreur mise a jour societe');
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

  const ndfEmails = normalizeEmails(formData.ndf);
  const paymentProofEmails = normalizeEmails(formData.facture);

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header */}
      <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-r from-slate-900/80 via-slate-900/75 to-cyan-950/60 p-4 sm:p-5">
        <h2 className="text-2xl font-semibold tracking-tight text-white">Parametrage Depenses</h2>
        <p className="mt-1 text-sm text-slate-300">
          Gerez vos societes et leurs destinataires de mails (NDF et justificatifs).
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300/30 bg-rose-500/10 p-4">
          <p className="text-sm text-rose-100">{error}</p>
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-4">
          <p className="text-sm text-emerald-100">{success}</p>
        </div>
      )}

      {/* ── SOCIETES ── */}
      <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-xl shadow-slate-950/25 sm:p-5">
        <h3 className="mb-4 text-lg font-semibold text-white">Societes</h3>

        {/* Form: create or edit */}
        {showCompanyForm && (
          <div className="mb-5 rounded-xl border border-cyan-300/20 bg-slate-900/70 p-4">
            <p className="mb-3 text-sm font-semibold text-white">
              {editingRecipientId ? 'Modifier la societe' : 'Nouvelle societe'}
            </p>

            {/* Main fields */}
            <div className="grid gap-3 md:grid-cols-3">
              <input
                type="text"
                placeholder="Nom societe"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-cyan-400"
              />
              <input
                type="email"
                placeholder="Email NDF (ex: rh@abc.com)"
                value={companyNdfEmail}
                onChange={(e) => setCompanyNdfEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-violet-400"
              />
              <input
                type="email"
                placeholder="Email justificatif (ex: compta@abc.com)"
                value={companyPaymentEmail}
                onChange={(e) => setCompanyPaymentEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-emerald-400"
              />
            </div>

            {/* Accumulated extra emails */}
            {(companyExtraNdfEmails.length > 0 || companyExtraJustifEmails.length > 0) && (
              <div className="mt-3 space-y-2">
                {companyExtraNdfEmails.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">
                      NDF supplementaires
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {companyExtraNdfEmails.map((email) => (
                        <div
                          key={email}
                          className="flex items-center gap-1 rounded-full border border-violet-300/30 bg-violet-500/10 px-3 py-0.5"
                        >
                          <span className="text-xs text-violet-100">{email}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveExtraEmail('ndf', email)}
                            className="ml-1 text-xs text-violet-300 hover:text-white"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {companyExtraJustifEmails.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">
                      Justificatifs supplementaires
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {companyExtraJustifEmails.map((email) => (
                        <div
                          key={email}
                          className="flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-0.5"
                        >
                          <span className="text-xs text-emerald-100">{email}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveExtraEmail('justif', email)}
                            className="ml-1 text-xs text-emerald-300 hover:text-white"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Add extra email inputs — BEFORE the save button */}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Email NDF supplementaire"
                  value={companyExtraNdfDraft}
                  onChange={(e) => setCompanyExtraNdfDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddExtraEmail('ndf')}
                  className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-violet-400"
                />
                <button
                  type="button"
                  onClick={() => handleAddExtraEmail('ndf')}
                  className="shrink-0 rounded-lg border border-violet-300/35 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/20"
                >
                  + NDF
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Email justificatif suppl."
                  value={companyExtraJustifDraft}
                  onChange={(e) => setCompanyExtraJustifDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddExtraEmail('justif')}
                  className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => handleAddExtraEmail('justif')}
                  className="shrink-0 rounded-lg border border-emerald-300/35 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20"
                >
                  + Justificatif
                </button>
              </div>
            </div>

            {/* Save / Cancel */}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={editingRecipientId ? handleUpdateRecipient : handleCreateCompany}
                disabled={isSaving}
                className="flex-1 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-60"
              >
                {isSaving
                  ? t('common.loading')
                  : editingRecipientId
                  ? 'Mettre a jour la societe'
                  : 'Sauvegarder la societe'}
              </button>
              <button
                type="button"
                onClick={handleCancelCompanyForm}
                className="rounded-lg border border-slate-600 px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-800"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Company list */}
        {recipientsLoading ? (
          <p className="text-sm text-slate-300">Chargement des societes...</p>
        ) : recipients.length === 0 ? (
          <p className="mb-4 rounded-lg border border-dashed border-slate-600 p-4 text-center text-sm text-slate-400">
            Aucune societe. Cliquez sur &ldquo;+ Ajouter une societe&rdquo;.
          </p>
        ) : (
          <div className="mb-4 space-y-2">
            {recipients.map((recipient) => {
              const isSelected = selectedRecipientId === recipient.id;
              const isDefault = ndfProfile.companyRecipientId === recipient.id;
              return (
                <div
                  key={recipient.id}
                  onClick={() => setSelectedRecipientId(isSelected ? null : recipient.id)}
                  className={`cursor-pointer rounded-xl border px-4 py-3 transition-colors ${
                    isSelected
                      ? 'border-cyan-400/60 bg-cyan-500/10'
                      : 'border-slate-700 bg-slate-900/60 hover:border-slate-500 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                        isSelected ? 'border-cyan-400 bg-cyan-400' : 'border-slate-500'
                      }`}
                    >
                      {isSelected && <div className="h-2 w-2 rounded-full bg-slate-950" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">{recipient.name}</p>
                      <p className="text-xs text-slate-400">{recipient.destination}</p>
                    </div>
                    {isDefault && (
                      <span className="rounded-full border border-cyan-300/35 bg-cyan-500/15 px-2 py-0.5 text-[11px] text-cyan-100">
                        Defaut NDF
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 3 action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleStartEdit}
            disabled={!selectedRecipientId}
            className="rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Modifier societe
          </button>
          <button
            type="button"
            onClick={handleStartAdd}
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
          >
            + Ajouter une societe
          </button>
          <button
            type="button"
            onClick={() => selectedRecipientId && handleDeleteRecipient(selectedRecipientId)}
            disabled={!selectedRecipientId || isSaving}
            className="rounded-lg border border-rose-300/35 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Supprimer societe
          </button>
        </div>
      </section>

      {/* ── PROFIL NDF ── */}
      <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-xl shadow-slate-950/25 sm:p-5">
        <h3 className="mb-1 text-lg font-semibold text-white">Profil NDF</h3>
        <p className="mb-4 text-xs text-slate-300">
          Informations du valideur affichees dans le PDF de note de frais.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            type="text"
            placeholder="Valideur - Prenom"
            value={ndfProfile.validatorFirstName}
            onChange={(e) =>
              setNdfProfile((prev) => ({ ...prev, validatorFirstName: e.target.value }))
            }
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-cyan-400"
          />
          <input
            type="text"
            placeholder="Valideur - Nom"
            value={ndfProfile.validatorLastName}
            onChange={(e) =>
              setNdfProfile((prev) => ({ ...prev, validatorLastName: e.target.value }))
            }
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-cyan-400"
          />
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-xs font-medium text-slate-300">
            Societe par defaut pour la NDF
          </label>
          <select
            value={ndfProfile.companyRecipientId || ''}
            onChange={(e) =>
              setNdfProfile((prev) => ({
                ...prev,
                companyRecipientId: e.target.value ? e.target.value : null,
              }))
            }
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400"
          >
            <option value="">Aucune societe selectionnee</option>
            {recipients.map((recipient) => (
              <option key={recipient.id} value={recipient.id}>
                {recipient.name} ({recipient.destination})
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleSaveNdfProfile}
          disabled={isSaving}
          className="mt-3 w-full rounded-lg border border-cyan-300/30 bg-cyan-500/15 px-4 py-2.5 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-500/25 disabled:opacity-60"
        >
          {isSaving ? t('common.loading') : 'Sauvegarder profil NDF'}
        </button>
      </section>

      {/* ── DESTINATAIRES NDF GLOBAUX ── */}
      <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-xl shadow-slate-950/25 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-violet-500/20 px-2 py-1 text-xs font-semibold text-violet-100">
            NDF
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Destinataires NDF</h3>
            <p className="text-xs text-slate-300">
              Toutes les adresses qui recoivent les notes de frais.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="rh@entreprise.com"
              value={emailDrafts.ndf}
              onChange={(e) => setEmailDrafts((prev) => ({ ...prev, ndf: e.target.value }))}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-violet-400"
            />
            <button
              type="button"
              onClick={() => handleAddEmail('ndf')}
              disabled={isSaving}
              className="rounded-lg border border-violet-300/35 bg-violet-500/10 px-4 py-2 text-violet-100 hover:bg-violet-500/20 disabled:opacity-50"
            >
              +
            </button>
          </div>
          {ndfEmails.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {ndfEmails.map((email) => (
                <div
                  key={email}
                  className="flex items-center gap-2 rounded-full border border-violet-300/30 bg-violet-500/10 px-3 py-1"
                >
                  <span className="text-xs text-violet-100">{email}</span>
                  <button
                    onClick={() => handleRemoveEmail('ndf', email)}
                    className="text-xs text-violet-200 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Aucun email NDF configure.</p>
          )}
          <button
            type="button"
            onClick={() => handleSave('ndf')}
            disabled={isSaving}
            className="w-full rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-400 disabled:opacity-50"
          >
            {isSaving ? t('common.loading') : 'Sauvegarder destinataires NDF'}
          </button>
        </div>
      </section>

      {/* ── DESTINATAIRES JUSTIFICATIFS GLOBAUX ── */}
      <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-xl shadow-slate-950/25 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-100">
            Justificatif
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Destinataires justificatif</h3>
            <p className="text-xs text-slate-300">
              Toutes les adresses qui recoivent les justificatifs de paiement.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="comptabilite@entreprise.com"
              value={emailDrafts.facture}
              onChange={(e) => setEmailDrafts((prev) => ({ ...prev, facture: e.target.value }))}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-emerald-400"
            />
            <button
              type="button"
              onClick={() => handleAddEmail('facture')}
              disabled={isSaving}
              className="rounded-lg border border-emerald-300/35 bg-emerald-500/10 px-4 py-2 text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              +
            </button>
          </div>
          {paymentProofEmails.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {paymentProofEmails.map((email) => (
                <div
                  key={email}
                  className="flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1"
                >
                  <span className="text-xs text-emerald-100">{email}</span>
                  <button
                    onClick={() => handleRemoveEmail('facture', email)}
                    className="text-xs text-emerald-200 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Aucun email justificatif configure.</p>
          )}
          <button
            type="button"
            onClick={() => handleSave('facture')}
            disabled={isSaving}
            className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
          >
            {isSaving ? t('common.loading') : 'Sauvegarder destinataires justificatifs'}
          </button>
        </div>
      </section>

      {contactsSupported && (
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-xl shadow-slate-950/25 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="text-2xl">📱</div>
            <div>
              <h3 className="font-semibold text-white">Acces aux contacts</h3>
              <p className="text-xs text-slate-300">Autoriser l acces a votre carnet de contacts</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const newState = !contactsEnabled;
                setContactsPermission(newState);
                setContactsEnabled(newState);
              }}
              className={`rounded-lg px-4 py-2 font-medium transition-colors ${
                contactsEnabled
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-700 text-slate-100 hover:bg-slate-600'
              }`}
            >
              {contactsEnabled ? `✓ ${t('common.enabled')}` : t('common.disabled')}
            </button>
            <p className="text-sm text-slate-300">
              {contactsEnabled
                ? 'Vous pouvez selectionner des contacts lors du transfert de taches.'
                : 'Desactive pour le moment.'}
            </p>
          </div>
          <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-500/10 p-3">
            <p className="text-xs text-amber-100">
              <strong>Confidentialite:</strong> vos contacts ne sont pas envoyes a nos serveurs. Ils
              restent locaux au navigateur.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

    <div className="space-y-6 text-slate-100">
      <div className="rounded-2xl border border-cyan-300/20 bg-gradient-to-r from-slate-900/80 via-slate-900/75 to-cyan-950/60 p-4 sm:p-5">
        <h2 className="text-2xl font-semibold tracking-tight text-white">Parametrage Depenses</h2>
        <p className="mt-1 text-sm text-slate-300">
          Flux simple: creez une societe (avec 1 email NDF + 1 email justificatif), puis ajoutez autant de destinataires que vous voulez.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-cyan-300/25 bg-cyan-500/15 px-3 py-1">1. Creer societe</span>
          <span className="rounded-full border border-violet-300/25 bg-violet-500/15 px-3 py-1">2. Ajouter des destinataires NDF</span>
          <span className="rounded-full border border-emerald-300/25 bg-emerald-500/15 px-3 py-1">3. Ajouter des destinataires justificatifs</span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300/30 bg-rose-500/10 p-4">
          <p className="text-sm text-rose-100">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-4">
          <p className="text-sm text-emerald-100">{success}</p>
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-xl shadow-slate-950/25 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-cyan-500/20 px-2 py-1 text-xs font-semibold text-cyan-100">ETAPE 1</div>
          <div>
            <h3 className="text-lg font-semibold text-white">Creer une societe</h3>
            <p className="text-xs text-slate-300">
              Cette action cree la societe et ajoute automatiquement 1 destinataire NDF + 1 destinataire justificatif.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input
            type="text"
            placeholder="Nom societe (ex: Entreprise ABC)"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-cyan-400"
          />
          <input
            type="email"
            placeholder="Email NDF (ex: rh@abc.com)"
            value={companyNdfEmail}
            onChange={(e) => setCompanyNdfEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-violet-400"
          />
          <input
            type="email"
            placeholder="Email justificatif (ex: compta@abc.com)"
            value={companyPaymentEmail}
            onChange={(e) => setCompanyPaymentEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-cyan-400"
          />
        </div>

        <button
          onClick={handleCreateCompany}
          disabled={isSaving}
          className="mt-3 w-full rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-60"
        >
          {isSaving ? t('common.loading') : '+ Creer la societe et ses 2 destinataires'}
        </button>

        <div className="mt-5 rounded-xl border border-white/10 bg-slate-900/70 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-white">Valideur NDF et societe par defaut</p>
            <span className="text-xs text-slate-400">Utilise pour le PDF NDF</span>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="text"
              placeholder="Valideur - Prenom"
              value={ndfProfile.validatorFirstName}
              onChange={(e) =>
                setNdfProfile((prev) => ({ ...prev, validatorFirstName: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-cyan-400"
            />
            <input
              type="text"
              placeholder="Valideur - Nom"
              value={ndfProfile.validatorLastName}
              onChange={(e) =>
                setNdfProfile((prev) => ({ ...prev, validatorLastName: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-cyan-400"
            />
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-slate-300">Societe par defaut pour la NDF</label>
            <select
              value={ndfProfile.companyRecipientId || ''}
              onChange={(e) =>
                setNdfProfile((prev) => ({
                  ...prev,
                  companyRecipientId: e.target.value ? e.target.value : null,
                }))
              }
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400"
            >
              <option value="">Aucune societe selectionnee</option>
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
            className="mt-3 w-full rounded-lg border border-cyan-300/30 bg-cyan-500/15 px-4 py-2.5 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-500/25 disabled:opacity-60"
          >
            {isSaving ? t('common.loading') : 'Sauvegarder profil NDF'}
          </button>
        </div>

        <div className="mt-4">
          {recipientsLoading ? (
            <p className="text-sm text-slate-300">Chargement des societes...</p>
          ) : recipients.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-600 p-3 text-sm text-slate-300">Aucune societe enregistree pour le moment.</p>
          ) : (
            <div className="space-y-2">
              {recipients.map((recipient) => {
                const isDefault = ndfProfile.companyRecipientId === recipient.id;
                return (
                  <div
                    key={recipient.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">{recipient.name}</p>
                      <p className="text-xs text-slate-300">{recipient.destination}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isDefault && (
                        <span className="rounded-full border border-cyan-300/35 bg-cyan-500/15 px-2 py-0.5 text-[11px] text-cyan-100">Defaut NDF</span>
                      )}
                      <button
                        onClick={() => handleDeleteRecipient(recipient.id)}
                        className="rounded-lg border border-rose-300/35 px-3 py-1 text-xs text-rose-200 hover:bg-rose-500/15"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-xl shadow-slate-950/25 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-violet-500/20 px-2 py-1 text-xs font-semibold text-violet-100">ETAPE 2</div>
          <div>
            <h3 className="text-lg font-semibold text-white">Ajouter des destinataires NDF</h3>
            <p className="text-xs text-slate-300">
              Ajoutez autant d emails que necessaire pour les notes de frais.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="rh@entreprise.com"
              value={emailDrafts.ndf}
              onChange={(e) =>
                setEmailDrafts((prev) => ({ ...prev, ndf: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-violet-400"
            />
            <button
              onClick={() => handleAddEmail('ndf')}
              disabled={isSaving}
              className="rounded-lg border border-violet-300/35 bg-violet-500/10 px-4 py-2 text-violet-100 hover:bg-violet-500/20 disabled:opacity-50"
            >
              +
            </button>
          </div>

          {ndfEmails.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {ndfEmails.map((email) => (
                <div key={email} className="flex items-center gap-2 rounded-full border border-violet-300/30 bg-violet-500/10 px-3 py-1">
                  <span className="text-xs text-violet-100">{email}</span>
                  <button
                    onClick={() => handleRemoveEmail('ndf', email)}
                    className="text-xs text-violet-200 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Aucun email NDF configure.</p>
          )}

          <p className="text-xs text-slate-400">Vous pouvez ajouter plusieurs adresses email.</p>
          <button
            onClick={() => handleSave('ndf')}
            disabled={isSaving}
            className="w-full rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-400 disabled:opacity-50"
          >
            {isSaving ? t('common.loading') : 'Sauvegarder destinataires NDF'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-xl shadow-slate-950/25 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-100">ETAPE 3</div>
          <div>
            <h3 className="text-lg font-semibold text-white">Ajouter des destinataires justificatif</h3>
            <p className="text-xs text-slate-300">
              Ajoutez autant d emails que necessaire pour les justificatifs de paiement.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="comptabilite@entreprise.com"
              value={emailDrafts.facture}
              onChange={(e) =>
                setEmailDrafts((prev) => ({ ...prev, facture: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-emerald-400"
            />
            <button
              onClick={() => handleAddEmail('facture')}
              disabled={isSaving}
              className="rounded-lg border border-emerald-300/35 bg-emerald-500/10 px-4 py-2 text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              +
            </button>
          </div>

          {paymentProofEmails.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {paymentProofEmails.map((email) => (
                <div key={email} className="flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1">
                  <span className="text-xs text-emerald-100">{email}</span>
                  <button
                    onClick={() => handleRemoveEmail('facture', email)}
                    className="text-xs text-emerald-200 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Aucun email justificatif configure.</p>
          )}

          <p className="text-xs text-slate-400">Vous pouvez ajouter plusieurs adresses email.</p>
          <button
            onClick={() => handleSave('facture')}
            disabled={isSaving}
            className="w-full rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
          >
            {isSaving ? t('common.loading') : 'Sauvegarder destinataires justificatifs'}
          </button>
        </div>
      </section>

      {contactsSupported && (
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-xl shadow-slate-950/25 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="text-2xl">📱</div>
            <div>
              <h3 className="font-semibold text-white">Acces aux contacts</h3>
              <p className="text-xs text-slate-300">Autoriser l acces a votre carnet de contacts</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                const newState = !contactsEnabled;
                setContactsPermission(newState);
                setContactsEnabled(newState);
              }}
              className={`rounded-lg px-4 py-2 font-medium transition-colors ${
                contactsEnabled
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-700 text-slate-100 hover:bg-slate-600'
              }`}
            >
              {contactsEnabled ? `✓ ${t('common.enabled')}` : t('common.disabled')}
            </button>

            <p className="text-sm text-slate-300">
              {contactsEnabled
                ? 'Vous pouvez selectionner des contacts lors du transfert de taches.'
                : 'Desactive pour le moment.'}
            </p>
          </div>

          <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-500/10 p-3">
            <p className="text-xs text-amber-100">
              <strong>Confidentialite:</strong> vos contacts ne sont pas envoyes a nos serveurs. Ils restent locaux au navigateur.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
