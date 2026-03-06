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
  onTransfer: (email: string) => Promise<void>;
  isLoading: boolean;
}

const SAMPLE_CONTACTS = [
  { email: "john.doe@example.com", name: "John Doe" },
  { email: "jane.smith@example.com", name: "Jane Smith" },
  { email: "team@example.com", name: "Équipe" },
];

export default function TransferModal({
  open,
  taskTitle,
  onClose,
  onTransfer,
  isLoading,
}: TransferModalProps) {
  const [email, setEmail] = useState("");
  const [filtered, setFiltered] = useState<typeof SAMPLE_CONTACTS>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [contactsSupported, setContactsSupported] = useState(false);
  const [contactsEnabled, setContactsEnabled] = useState(false);
  const [isPickingContacts, setIsPickingContacts] = useState(false);

  useEffect(() => {
    setContactsSupported(isContactPickerSupported());
    setContactsEnabled(getContactsPermission());
  }, [open]);

  useEffect(() => {
    if (!email.trim()) {
      setFiltered([]);
      setShowSuggestions(false);
      return;
    }

    const lowerEmail = email.toLowerCase();
    const matches = SAMPLE_CONTACTS.filter(
      (contact) =>
        contact.email.includes(lowerEmail) || contact.name.toLowerCase().includes(lowerEmail)
    );


  const handlePickContact = async () => {
    setIsPickingContacts(true);
    try {
      const contacts = await pickContacts();
      if (contacts.length > 0) {
        // Afficher les contacts dans les suggestions
        const contactSuggestions = contacts
          .filter(c => c.email)
          .map(c => ({
            email: c.email || '',
            name: c.name || 'Sans nom',
          }));
        
        if (contactSuggestions.length > 0) {
          setFiltered(contactSuggestions);
          setShowSuggestions(true);
        }
      }
    } catch (error: any) {
      if (error.message.includes('Accès aux contacts refusé')) {
        alert('Veuillez d\'abord activer l\'accès aux contacts dans les paramètres.');
      } else if (error.name !== 'AbortError') {
        console.error('Erreur accès aux contacts:', error);
        alert('Erreur lors de l\'accès aux contacts');
      }
    } finally {
      setIsPickingContacts(false);
    }
  };
    setFiltered(matches);
    setShowSuggestions(matches.length > 0);
  }, [email]);

  const handleSelectEmail = (selectedEmail: string) => {
    setEmail(selectedEmail);
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
      await onTransfer(email);
      setEmail("");
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

          {/* Suggestions d'emails */}
          {showSuggestions && filtered.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-700 border border-white/10 rounded-xl overflow-hidden shadow-lg z-10">
              {filtered.map((contact, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectEmail(contact.email)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/10 transition border-b border-white/5 last:border-b-0"
                >
                  <div className="font-medium text-white">{contact.name}</div>
                  <div className="text-xs text-gray-400">{contact.email}</div>
                </button>
              ))}
            </div>
          )}
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
