"use client";

import { useState, useRef } from "react";
import { getAuthHeaders } from "@/lib/auth/clientSession";

interface ComposeModalProps {
  userEmail: string;
  userName?: string | null;
  defaultContext?: "pro" | "perso";
  onClose: () => void;
  onSent?: () => void;
}

export default function ComposeModal({
  userEmail,
  userName,
  defaultContext = "pro",
  onClose,
  onSent,
}: ComposeModalProps) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [context, setContext] = useState<"pro" | "perso">(defaultContext);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const displayName = userName || userEmail;
  const fromLabel = userName ? `${userName} <${userEmail}>` : userEmail;

  const handleSend = async () => {
    setError(null);
    if (!to.trim()) { setError("Le destinataire est requis."); return; }
    if (!subject.trim()) { setError("L'objet est requis."); return; }
    if (!body.trim()) { setError("Le corps du message est requis."); return; }

    setSending(true);
    try {
      const res = await fetch("/api/mail/compose", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders(false)),
        },
        body: JSON.stringify({
          to: to.trim(),
          cc: cc.trim() || undefined,
          subject: subject.trim(),
          body: body.trim(),
          context,
          from_name: userName || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Erreur lors de l'envoi.");
        return;
      }
      setSent(true);
      onSent?.();
      setTimeout(onClose, 1800);
    } catch {
      setError("Erreur réseau. Vérifiez votre connexion.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSend();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 flex w-full max-w-2xl flex-col max-h-[92vh] rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-slate-800/60 px-4 py-3 flex-shrink-0">
          <h2 className="text-sm font-semibold text-white">✉️ Nouveau message</h2>
          <div className="flex items-center gap-2">
            <select
              value={context}
              onChange={(e) => setContext(e.target.value as "pro" | "perso")}
              className="rounded-lg bg-slate-700/60 border border-white/10 px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:border-violet-500/50"
            >
              <option value="pro">💼 Pro</option>
              <option value="perso">🎯 Perso</option>
            </select>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-700 hover:text-white transition-colors"
              title="Fermer (Échap)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Form fields */}
        <div className="flex-1 overflow-y-auto">
          <div className="divide-y divide-white/5 border-b border-white/5">

            {/* De */}
            <div className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-14 flex-shrink-0 text-right text-xs text-slate-500">De</span>
              <div className="flex-1 rounded-lg bg-slate-800/40 px-3 py-1.5 text-sm text-slate-400 truncate select-none">
                {fromLabel}
              </div>
            </div>

            {/* À */}
            <div className="flex items-center gap-3 px-4 py-2">
              <span className="w-14 flex-shrink-0 text-right text-xs text-slate-500">À</span>
              <input
                type="email"
                multiple
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="destinataire@email.com"
                autoFocus
                className="flex-1 bg-transparent py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none"
              />
              {!showCc && (
                <button
                  onClick={() => setShowCc(true)}
                  className="text-xs text-slate-600 hover:text-violet-400 transition-colors whitespace-nowrap"
                >
                  + Cc
                </button>
              )}
            </div>

            {/* CC */}
            {showCc && (
              <div className="flex items-center gap-3 px-4 py-2">
                <span className="w-14 flex-shrink-0 text-right text-xs text-slate-500">Cc</span>
                <input
                  type="text"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="copie@email.com, autre@email.com"
                  className="flex-1 bg-transparent py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none"
                />
              </div>
            )}

            {/* Objet */}
            <div className="flex items-center gap-3 px-4 py-2">
              <span className="w-14 flex-shrink-0 text-right text-xs text-slate-500">Objet</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Objet du message"
                className="flex-1 bg-transparent py-1.5 text-sm font-medium text-white placeholder-slate-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Corps */}
          <div className="p-4">
            <textarea
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={`Bonjour,\n\n`}
              rows={10}
              className="w-full bg-transparent py-2 text-sm leading-relaxed text-white placeholder-slate-600 focus:outline-none resize-none"
            />
          </div>
        </div>

        {/* Info + erreurs */}
        <div className="flex-shrink-0 px-4 space-y-2 pb-2">
          <div className="rounded-xl border border-white/5 bg-slate-800/40 px-3 py-2 text-xs text-slate-500 leading-relaxed">
            💡 Le mail part depuis les serveurs de l'application avec <span className="text-slate-400">reply-to: {userEmail}</span> — vos destinataires vous répondront bien à votre adresse.
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              ⚠️ {error}
            </div>
          )}

          {sent && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
              ✓ Message envoyé avec succès
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 bg-slate-800/30 px-4 py-3 flex-shrink-0">
          <div className="text-xs text-slate-600">
            {body.length > 0 && `${body.length.toLocaleString("fr-FR")} car.`}
            <span className="ml-2 hidden sm:inline">⌘↵ pour envoyer</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSend}
              disabled={sending || sent}
              className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {sending ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Envoi…
                </>
              ) : sent ? (
                "✓ Envoyé"
              ) : (
                "✉️ Envoyer"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
