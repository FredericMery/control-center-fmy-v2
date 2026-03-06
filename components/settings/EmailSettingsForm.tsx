'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

interface EmailSetting {
  id: string;
  type: 'facture' | 'ndf';
  email: string;
}

export default function EmailSettingsForm() {
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
    };
    getAuthToken();
  }, []);

  // Charger les paramètres
  useEffect(() => {
    if (!authToken) return;

    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/settings/emails', {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
        });

        if (!response.ok) throw new Error('Erreur chargement');

        const data = await response.json();
        setSettings(data.settings);

        // Pré-remplir le formulaire
        const factureEmail = data.settings.find((s: EmailSetting) => s.type === 'facture')?.email || '';
        const ndfEmail = data.settings.find((s: EmailSetting) => s.type === 'ndf')?.email || '';
        setFormData({ facture: factureEmail, ndf: ndfEmail });
      } catch (err) {
        console.error('Erreur:', err);
        setError('Impossible de charger les paramètres');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
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

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/settings/emails', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ type, email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Erreur sauvegarde');
        return;
      }

      setSuccess(data.message);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Erreur lors de la sauvegarde');
      console.error(err);
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
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Emails</h2>
        <p className="text-slate-600 text-sm">
          Configurez où envoyer les factures et les notes de frais
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
            {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
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
            {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>💡 Info:</strong> Ces adresses sont utilisées pour router automatiquement les factures CB Pro et envoyer les notes de frais chaque mois.
        </p>
      </div>
    </div>
  );
}
