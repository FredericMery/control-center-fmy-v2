"use client";

import { useState, useEffect } from "react";
import {
  isContactPickerSupported,
  getContactsPermission,
  pickContacts,
} from "@/lib/contacts/contactPicker";

interface TransferModalProps {
  open: boolean;
  taskTitle: string;
  onClose: () => void;
  onTransfer: (email: string, customMessage: string) => Promise<void>;
  isLoading: boolean;
}

type RecipientSuggestion = {
  email: string;
  name: string;
  source?: "history" | "contacts";
  lastUsedAt?: string;
};

const RECIPIENT_HISTORY_KEY = "transfer_recipients_history_v1";

export default function TransferModal({
  open,
  taskTitle,
  onClose,
  onTransfer,
  isLoading,
}: TransferModalProps) {
  const [email, setEmail] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [historySuggestions, setHistorySuggestions] = useState<RecipientSuggestion[]>([]);
  const [contactSuggestions, setContactSuggestions] = useState<RecipientSuggestion[]>([]);
  const [filtered, setFiltered] = useState<RecipientSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [contactsSupported, setContactsSupported] = useState(false);
  const [isPickingContacts, setIsPickingContacts] = useState(false);

  useEffect(() => {
    if (!open) return;

    setContactsSupported(isContactPickerSupported());
    loadRecipientHistory();
  }, [open]);

  useEffect(() => {
    if (!email.trim()) {
      setFiltered([]);
      setShowSuggestions(false);
      return;
    }

    const query = email.toLowerCase();
    const merged = dedupeSuggestions([...historySuggestions, ...contactSuggestions]);
    const matches = merged.filter(
      (contact) =>
        contact.email.toLowerCase().includes(query) || contact.name.toLowerCase().includes(query)
    );

    setFiltered(matches.slice(0, 8));
    setShowSuggestions(matches.length > 0);
  }, [email, historySuggestions, contactSuggestions]);

  const loadRecipientHistory = () => {
    try {
      const raw = localStorage.getItem(RECIPIENT_HISTORY_KEY);
      if (!raw) {
        setHistorySuggestions([]);
        return;
      }

      const parsed = JSON.parse(raw) as RecipientSuggestion[];
      const normalized = Array.isArray(parsed)
        ? parsed
            .filter((entry) => Boolean(entry?.email))
            .map((entry) => ({
              email: String(entry.email || "").trim().toLowerCase(),
              name: String(entry.name || "").trim() || String(entry.email || "").trim().toLowerCase(),
              source: "history" as const,
              lastUsedAt: entry.lastUsedAt || undefined,
            }))
            .filter((entry) => Boolean(entry.email))
        : [];

      setHistorySuggestions(normalized);
    } catch {
      setHistorySuggestions([]);
    }
  };

  const persistRecipientInHistory = (recipientEmail: string, recipientName?: string) => {
    const normalizedEmail = String(recipientEmail || "").trim().toLowerCase();
    if (!normalizedEmail) return;

    const normalizedName = String(recipientName || "").trim() || normalizedEmail;
    const nowIso = new Date().toISOString();

    const updated = dedupeSuggestions([
      {
        email: normalizedEmail,
        name: normalizedName,
        source: "history",
        lastUsedAt: nowIso,
      },
      ...historySuggestions,
    ])
      .sort((a, b) => {
        const aTs = new Date(a.lastUsedAt || 0).getTime();
        const bTs = new Date(b.lastUsedAt || 0).getTime();
        return bTs - aTs;
      })
      .slice(0, 30);

    setHistorySuggestions(updated);
    localStorage.setItem(RECIPIENT_HISTORY_KEY, JSON.stringify(updated));
  };

  const handlePickContact = async () => {
    setIsPickingContacts(true);
    try {
      const contacts = await pickContacts();
      if (contacts.length === 0) return;

      const picked = contacts
        .filter((contact) => Boolean(contact.email))
        .map((contact) => ({
          email: String(contact.email || "").trim().toLowerCase(),
          name: String(contact.name || "").trim() || "Sans nom",
          source: "contacts" as const,
        }))
        .filter((contact) => Boolean(contact.email));

      if (picked.length > 0) {
        setContactSuggestions((prev) => dedupeSuggestions([...picked, ...prev]).slice(0, 50));
        setFiltered(dedupeSuggestions([...picked, ...historySuggestions]).slice(0, 8));
        setShowSuggestions(true);
      }
    } catch (error: any) {
      if (String(error?.message || "").includes("Accès aux contacts refusé")) {
        alert("Veuillez d'abord activer l'accès aux contacts dans les paramètres.");
      } else if (error?.name !== "AbortError") {
        console.error("Erreur accès aux contacts:", error);
        alert("Erreur lors de l'accès aux contacts");
      }
    } finally {
      setIsPickingContacts(false);
    }
  };

  const handleSelectEmail = (selectedEmail: string, selectedName?: string) => {
    setEmail(selectedEmail);
    if (selectedEmail) {
      persistRecipientInHistory(selectedEmail, selectedName);
    }
    setShowSuggestions(false);
  };

  const handleSubmit = async () => {
    if (!email.trim()) return;

    // Valider l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return alert("Veuillez entrer une adresse email valide");
    }

    try {
      await onTransfer(email, customMessage);
      persistRecipientInHistory(email, email);
      setEmail("");
      setCustomMessage("");
      setFiltered([]);
      setShowSuggestions(false);
      onClose();
    } catch (error) {
      console.error("Erreur transfert:", error);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gradient-to-b from-slate-800 to-slate-900 p-8 rounded-3xl w-full max-w-md border border-white/10 shadow-2xl animate-in zoom-in-95">
        
        <h2 className="text-2xl font-bold mb-2">Transférer la tâche</h2>
        <p className="text-sm text-gray-400 mb-6">
          "{taskTitle}"
        </p>

        <div className="relative mb-6">
          <label className="text-sm font-medium text-gray-300 block mb-2">
            Adresse email du destinataire
          </label>
          
          <input
            type="email"
            placeholder="Ex: john@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => email && setShowSuggestions(true)}
            onKeyPress={(e) => e.key === "Enter" && handleSubmit()}
            autoFocus
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white placeholder-gray-500 transition"
          />

          {contactsSupported && getContactsPermission() && (
            <button
              type="button"
              onClick={handlePickContact}
              disabled={isPickingContacts}
              className="mt-2 rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-50"
            >
              {isPickingContacts ? "Chargement contacts..." : "Importer depuis mes contacts"}
            </button>
          )}

          {/* Suggestions d'emails */}
          {showSuggestions && filtered.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-700 border border-white/10 rounded-xl overflow-hidden shadow-lg z-10">
              {filtered.map((contact, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectEmail(contact.email, contact.name)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/10 transition border-b border-white/5 last:border-b-0"
                >
                  <div className="font-medium text-white">{contact.name}</div>
                  <div className="text-xs text-gray-400">
                    {contact.email}
                    {contact.source === "history" ? " · historique" : ""}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-6">
          <label className="text-sm font-medium text-gray-300 block mb-2">
            Message personnalisé (optionnel)
          </label>
          <textarea
            placeholder="Ex: Merci de prioriser cette tâche aujourd'hui."
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white placeholder-gray-500 transition resize-y"
          />
        </div>

        {/* Note d'info */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-6">
          <p className="text-xs text-blue-300 leading-relaxed">
            📧 Un email professionnel sera envoyé au destinataire avec les détails de la tâche.<br/>
            ✅ La tâche sera marquée comme terminée.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-6 py-2.5 text-gray-400 hover:text-gray-300 font-medium transition disabled:opacity-50"
          >
            Annuler
          </button>

          <button
            onClick={handleSubmit}
            disabled={!email.trim() || isLoading}
            className="flex-1 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/30"
          >
            {isLoading ? "Envoi..." : "Transférer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function dedupeSuggestions(items: RecipientSuggestion[]): RecipientSuggestion[] {
  const byEmail = new Map<string, RecipientSuggestion>();
  for (const item of items) {
    const email = String(item.email || "").trim().toLowerCase();
    if (!email) continue;

    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, {
        ...item,
        email,
      });
      continue;
    }

    const existingTs = new Date(existing.lastUsedAt || 0).getTime();
    const nextTs = new Date(item.lastUsedAt || 0).getTime();
    const newer = nextTs >= existingTs ? item : existing;

    byEmail.set(email, {
      ...newer,
      email,
      name: String(newer.name || existing.name || email).trim() || email,
    });
  }

  return Array.from(byEmail.values());
}
