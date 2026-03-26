"use client";

import { useState, useEffect } from "react";
import type {
  MailItem,
  MailContext,
  MailType,
  MailStatus,
  MailPriority,
  AiMailAnalysis,
} from "@/types/mail";
import {
  MAIL_TYPE_LABELS,
  MAIL_TYPE_ICONS,
  MAIL_TYPES,
  MAIL_STATUSES,
  MAIL_STATUS_LABELS,
  MAIL_PRIORITY_LABELS,
} from "@/types/mail";
import MailScanUpload from "./MailScanUpload";
import { getAuthHeaders } from "@/lib/auth/clientSession";

interface Props {
  item?: MailItem | null;
  defaultContext?: MailContext;
  onSave: (item: MailItem) => void;
  onCancel: () => void;
}

type Step = "scan" | "form";

export default function MailForm({ item, defaultContext = "pro", onSave, onCancel }: Props) {
  const isEdit = Boolean(item);
  const [step, setStep] = useState<Step>(isEdit ? "form" : "scan");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiDetected, setAiDetected] = useState(false);

  // Champs du formulaire
  const [context, setContext]               = useState<MailContext>(item?.context ?? defaultContext);
  const [mailType, setMailType]             = useState<MailType>(item?.mail_type ?? "autre");
  const [senderName, setSenderName]         = useState(item?.sender_name ?? "");
  const [senderAddress, setSenderAddress]   = useState(item?.sender_address ?? "");
  const [senderEmail, setSenderEmail]       = useState(item?.sender_email ?? "");
  const [subject, setSubject]               = useState(item?.subject ?? "");
  const [reference, setReference]           = useState(item?.reference ?? "");
  const [summary, setSummary]               = useState(item?.summary ?? "");
  const [receivedAt, setReceivedAt]         = useState(
    item?.received_at ?? new Date().toISOString().split("T")[0]
  );
  const [dueDate, setDueDate]               = useState(item?.due_date ?? "");
  const [status, setStatus]                 = useState<MailStatus>(item?.status ?? "recu");
  const [priority, setPriority]             = useState<MailPriority>(item?.priority ?? "normal");
  const [actionRequired, setActionRequired] = useState(item?.action_required ?? false);
  const [actionNote, setActionNote]         = useState(item?.action_note ?? "");
  const [notes, setNotes]                   = useState(item?.notes ?? "");
  const [scanUrl, setScanUrl]               = useState(item?.scan_url ?? "");
  const [scanFileName, setScanFileName]     = useState(item?.scan_file_name ?? "");
  const [scanUrls, setScanUrls]             = useState<string[]>(item?.scan_urls ?? (item?.scan_url ? [item.scan_url] : []));
  const [scanFileNames, setScanFileNames]   = useState<string[]>(item?.scan_file_names ?? (item?.scan_file_name ? [item.scan_file_name] : []));
  const [fullText, setFullText]             = useState(item?.full_text ?? "");
  const [aiTags, setAiTags]                 = useState<string[]>(item?.ai_tags ?? []);
  const [aiAnalyzed, setAiAnalyzed]         = useState(item?.ai_analyzed ?? false);
  const [aiConfidence, setAiConfidence]     = useState<number | null>(item?.ai_confidence ?? null);

  const applyAiAnalysis = (ai: AiMailAnalysis) => {
    if (ai.context === 'pro' || ai.context === 'perso') setContext(ai.context);
    if (ai.subject)         setSubject(ai.subject);
    if (ai.sender_name)     setSenderName(ai.sender_name);
    if (ai.sender_address)  setSenderAddress(ai.sender_address);
    if (ai.sender_email)    setSenderEmail(ai.sender_email);
    if (ai.mail_type)       setMailType(ai.mail_type as MailType);
    if (ai.summary)         setSummary(ai.summary);
    if (ai.action_note)     setActionNote(ai.action_note);
    if (ai.reference)       setReference(ai.reference);
    if (ai.due_date)        setDueDate(ai.due_date);
    if (ai.tags?.length)    setAiTags(ai.tags);
    setActionRequired(Boolean(ai.action_required));
    setPriority(ai.priority as MailPriority);
    setAiAnalyzed(true);
    setAiConfidence(ai.confidence ?? null);
    setAiDetected(true);
  };

  const handleScanComplete = (data: {
    scan_url: string | null;
    scan_file_name: string | null;
    scan_urls: string[];
    scan_file_names: string[];
    full_text: string | null;
    ai_analysis: AiMailAnalysis | null;
  }) => {
    if (data.scan_url)       setScanUrl(data.scan_url);
    if (data.scan_file_name) setScanFileName(data.scan_file_name);
    setScanUrls(Array.isArray(data.scan_urls) ? data.scan_urls.slice(0, 10) : data.scan_url ? [data.scan_url] : []);
    setScanFileNames(Array.isArray(data.scan_file_names) ? data.scan_file_names.slice(0, 10) : data.scan_file_name ? [data.scan_file_name] : []);
    if (data.full_text)      setFullText(data.full_text);
    if (data.ai_analysis)    applyAiAnalysis(data.ai_analysis);
    setStep("form");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      context,
      mail_type: mailType,
      sender_name: senderName || null,
      sender_address: senderAddress || null,
      sender_email: senderEmail || null,
      subject: subject || null,
      reference: reference || null,
      summary: summary || null,
      full_text: fullText || null,
      received_at: receivedAt,
      due_date: dueDate || null,
      status,
      action_required: actionRequired,
      action_note: actionNote || null,
      priority,
      scan_url: scanUrl || null,
      scan_file_name: scanFileName || null,
      scan_urls: scanUrls.length > 0 ? scanUrls : null,
      scan_file_names: scanFileNames.length > 0 ? scanFileNames : null,
      ai_analyzed: aiAnalyzed,
      ai_tags: aiTags.length > 0 ? aiTags : null,
      ai_confidence: aiConfidence,
      notes: notes || null,
    };

    try {
      const headers = await getAuthHeaders();
      const res = isEdit
        ? await fetch(`/api/mail/${item!.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(payload),
          })
        : await fetch("/api/mail", {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erreur sauvegarde");
      onSave(json.item);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  };

  if (step === "scan") {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-white">Scanner le courrier</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Photographiez ou importez le scan — l'IA remplira automatiquement les champs
          </p>
        </div>
        <MailScanUpload
          onComplete={handleScanComplete}
          onCancel={() => setStep("form")}
        />
        <button
          onClick={() => setStep("form")}
          className="w-full rounded-xl border border-white/10 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          Saisir manuellement sans scan →
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Badge IA */}
      {aiDetected && (
        <div className="flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-400/10 px-3 py-2">
          <span className="text-base">✨</span>
          <span className="text-xs text-violet-200">
            Champs pré-remplis par l'IA
            {aiConfidence !== null && (
              <span className="ml-1 text-violet-400">
                (confiance : {Math.round(aiConfidence * 100)}%)
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setStep("scan")}
            className="ml-auto text-xs text-violet-400 hover:text-violet-200 underline"
          >
            Rescanner
          </button>
        </div>
      )}

      {scanUrl && (
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2">
          <span className="text-base">📎</span>
          <span className="truncate text-xs text-slate-300">
            {scanFileNames.length > 1 ? `${scanFileNames.length} pieces jointes` : scanFileName || "scan.jpg"}
          </span>
          <a
            href={scanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs text-cyan-400 hover:underline"
          >
            Voir
          </a>
        </div>
      )}

      {/* Contexte */}
      <div className="grid grid-cols-2 gap-2">
        {(["pro", "perso"] as MailContext[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setContext(c)}
            className={`rounded-xl border py-2 text-sm font-medium transition-all ${
              context === c
                ? c === "pro"
                  ? "border-blue-400/40 bg-blue-400/15 text-blue-300"
                  : "border-fuchsia-400/40 bg-fuchsia-400/15 text-fuchsia-300"
                : "border-white/10 bg-slate-900/40 text-slate-400"
            }`}
          >
            {c === "pro" ? "💼 Pro" : "🎯 Perso"}
          </button>
        ))}
      </div>

      {/* Type */}
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
          Type de courrier
        </label>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {MAIL_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setMailType(t)}
              className={`rounded-lg border px-2 py-1.5 text-xs transition-all ${
                mailType === t
                  ? "border-violet-400/50 bg-violet-400/15 text-violet-200"
                  : "border-white/10 bg-slate-900/40 text-slate-400 hover:border-slate-500"
              }`}
            >
              {MAIL_TYPE_ICONS[t]} {MAIL_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Expéditeur */}
      <div className="space-y-2">
        <label className="block text-xs font-medium uppercase tracking-wide text-slate-400">
          Expéditeur
        </label>
        <input
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          placeholder="Nom / société"
          className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-400/60"
        />
        <input
          value={senderAddress}
          onChange={(e) => setSenderAddress(e.target.value)}
          placeholder="Adresse postale (optionnel)"
          className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-400/60"
        />
        <input
          value={senderEmail}
          onChange={(e) => setSenderEmail(e.target.value)}
          placeholder="Email (optionnel)"
          type="email"
          className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-400/60"
        />
      </div>

      {/* Objet + Référence */}
      <div className="space-y-2">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Objet du courrier"
          className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-400/60"
        />
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Référence / N° dossier (optionnel)"
          className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-400/60"
        />
      </div>

      {/* Résumé IA */}
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
          Résumé
        </label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Résumé du courrier…"
          rows={3}
          className="w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-400/60"
        />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Date de réception</label>
          <input
            type="date"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Date d'échéance</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60"
          />
        </div>
      </div>

      {/* Statut + Priorité */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Statut</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as MailStatus)}
            className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60"
          >
            {MAIL_STATUSES.map((s) => (
              <option key={s} value={s}>{MAIL_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-400">Priorité</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as MailPriority)}
            className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60"
          >
            {(["urgent", "haute", "normal", "basse"] as MailPriority[]).map((p) => (
              <option key={p} value={p}>{MAIL_PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Action requise */}
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={actionRequired}
            onChange={(e) => setActionRequired(e.target.checked)}
            className="h-4 w-4 accent-violet-400 rounded"
          />
          <span className="text-sm text-slate-200 font-medium">⚡ Action requise</span>
        </label>
        {actionRequired && (
          <input
            value={actionNote}
            onChange={(e) => setActionNote(e.target.value)}
            placeholder="Décrire l'action à effectuer…"
            className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-400/60"
          />
        )}
      </div>

      {/* Tags IA */}
      {aiTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {aiTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-xs text-violet-300"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
          Notes internes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes personnelles…"
          rows={2}
          className="w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-400/60"
        />
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          ⚠️ {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-white/10 bg-slate-800 py-2.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
        >
          {saving ? "Sauvegarde…" : isEdit ? "Mettre à jour" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
