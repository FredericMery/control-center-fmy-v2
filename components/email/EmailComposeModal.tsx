"use client";

import { useMemo, useState } from "react";
import { getAuthHeaders } from "@/lib/auth/clientSession";

type SenderOption = {
  type: "personal" | "professional";
  email: string;
  label: string;
};

interface EmailComposeModalProps {
  personalEmail: string;
  professionalEmail?: string | null;
  userName?: string | null;
  defaultContext?: "pro" | "perso";
  onClose: () => void;
  onSent?: (result: { replyToEmail: string }) => void;
}

export default function EmailComposeModal({
  personalEmail,
  professionalEmail,
  userName,
  defaultContext = "pro",
  onClose,
  onSent,
}: EmailComposeModalProps) {
  const senderOptions = useMemo<SenderOption[]>(() => {
    const options: SenderOption[] = [];
    if (personalEmail) {
      options.push({ type: "personal", email: personalEmail, label: "Perso" });
    }
    if (professionalEmail && professionalEmail !== personalEmail) {
      options.push({ type: "professional", email: professionalEmail, label: "Pro" });
    }
    return options;
  }, [personalEmail, professionalEmail]);

  const initialSenderType = defaultContext === "pro" && senderOptions.some((option) => option.type === "professional")
    ? "professional"
    : "personal";

  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [context, setContext] = useState<"pro" | "perso">(defaultContext);
  const [senderType, setSenderType] = useState<"personal" | "professional">(initialSenderType);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const selectedSender =
    senderOptions.find((option) => option.type === senderType) || senderOptions[0] || null;
  const displayName = userName || selectedSender?.email || personalEmail;

  const handleSend = async () => {
    setError(null);
    if (!to.trim()) {
      setError("Le destinataire est requis.");
      return;
    }
    if (!subject.trim()) {
      setError("L'objet est requis.");
      return;
    }
    if (!body.trim()) {
      setError("Le corps du message est requis.");
      return;
    }
    if (!selectedSender?.email) {
      setError("Aucune adresse d'envoi disponible.");
      return;
    }

    setSending(true);
    try {
      const res = await fetch("/api/email/compose", {
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
          reply_to_email: selectedSender.email,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string; reply_to_email?: string };
      if (!res.ok) {
        setError(json.error || "Erreur lors de l'envoi.");
        return;
      }

      setSent(true);
      onSent?.({ replyToEmail: json.reply_to_email || selectedSender.email });
      setTimeout(() => onClose(), 900);
    } catch {
      setError("Erreur reseau. Verifie ta connexion.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center p-2 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/85 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Nouveau message</h2>
            <p className="text-xs text-slate-400">Module email</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={context}
              onChange={(event) => setContext(event.target.value as "pro" | "perso")}
              className="rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 outline-none"
            >
              <option value="pro">Pro</option>
              <option value="perso">Perso</option>
            </select>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-white"
              title="Fermer"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="divide-y divide-white/5 border-b border-white/5">
            <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <span className="w-14 flex-shrink-0 text-right text-xs text-slate-500">De</span>
              <div className="flex-1 space-y-2">
                <div className="rounded-lg bg-slate-900/60 px-3 py-1.5 text-sm text-slate-300">
                  {displayName} &lt;{selectedSender?.email || personalEmail}&gt;
                </div>
                <div className="flex flex-wrap gap-2">
                  {senderOptions.map((option) => (
                    <button
                      key={option.type}
                      type="button"
                      onClick={() => setSenderType(option.type)}
                      className={`rounded-full border px-3 py-1 text-xs transition ${
                        senderType === option.type
                          ? 'border-cyan-300/40 bg-cyan-500/15 text-cyan-100'
                          : 'border-white/10 bg-slate-900/50 text-slate-400 hover:border-white/20 hover:text-slate-200'
                      }`}
                    >
                      {option.label} · {option.email}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-2">
              <span className="w-14 flex-shrink-0 text-right text-xs text-slate-500">A</span>
              <input
                type="text"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                placeholder="destinataire@email.com"
                autoFocus
                className="flex-1 bg-transparent py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none"
              />
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="whitespace-nowrap text-xs text-slate-600 transition-colors hover:text-cyan-300"
                >
                  + Cc
                </button>
              )}
            </div>

            {showCc && (
              <div className="flex items-center gap-3 px-4 py-2">
                <span className="w-14 flex-shrink-0 text-right text-xs text-slate-500">Cc</span>
                <input
                  type="text"
                  value={cc}
                  onChange={(event) => setCc(event.target.value)}
                  placeholder="copie@email.com, autre@email.com"
                  className="flex-1 bg-transparent py-1.5 text-sm text-white placeholder-slate-600 focus:outline-none"
                />
              </div>
            )}

            <div className="flex items-center gap-3 px-4 py-2">
              <span className="w-14 flex-shrink-0 text-right text-xs text-slate-500">Objet</span>
              <input
                type="text"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Objet du message"
                className="flex-1 bg-transparent py-1.5 text-sm font-medium text-white placeholder-slate-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="p-4">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={"Bonjour,\n\n"}
              rows={10}
              className="w-full resize-none bg-transparent py-2 text-sm leading-relaxed text-white placeholder-slate-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-2 px-4 pb-2">
          <div className="rounded-xl border border-white/5 bg-slate-900/50 px-3 py-2 text-xs leading-relaxed text-slate-500">
            Les emails partent depuis le domaine applicatif, mais les reponses iront sur <span className="text-slate-300">{selectedSender?.email || personalEmail}</span>.
            {!professionalEmail && (
              <span className="block pt-1 text-slate-400">Ajoute ton email pro dans Reglages ou Agenda Preferences pour activer le choix Perso / Pro.</span>
            )}
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
          )}

          {sent && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              Message envoye.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 bg-slate-900/60 px-4 py-3">
          <div className="text-xs text-slate-600">
            {body.length > 0 ? `${body.length.toLocaleString("fr-FR")} car.` : "Pret a envoyer"}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              Annuler
            </button>
            <button
              onClick={handleSend}
              disabled={sending || sent}
              className="rounded-xl bg-cyan-400 px-5 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? 'Envoi...' : sent ? 'Envoye' : 'Envoyer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}