"use client";

import type {
  MailItem,
  MailContext,
  MailType,
  MailStatus,
  MailPriority,
} from "@/types/mail";
import {
  MAIL_STATUSES,
  MAIL_STATUS_LABELS,
  MAIL_TYPES,
  MAIL_TYPE_LABELS,
  MAIL_TYPE_ICONS,
} from "@/types/mail";

interface Props {
  context: MailContext | "all";
  status: MailStatus | "all";
  mailType: MailType | "all";
  priority: MailPriority | "all";
  search: string;
  dateFrom: string;
  dateTo: string;
  overdueOnly: boolean;
  actionOnly: boolean;
  onContextChange: (v: MailContext | "all") => void;
  onStatusChange: (v: MailStatus | "all") => void;
  onMailTypeChange: (v: MailType | "all") => void;
  onPriorityChange: (v: MailPriority | "all") => void;
  onSearchChange: (v: string) => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onOverdueOnlyChange: (v: boolean) => void;
  onActionOnlyChange: (v: boolean) => void;
  onReset: () => void;
}

export default function MailFilters({
  context, status, mailType, priority,
  search, dateFrom, dateTo, overdueOnly, actionOnly,
  onContextChange, onStatusChange, onMailTypeChange, onPriorityChange,
  onSearchChange, onDateFromChange, onDateToChange,
  onOverdueOnlyChange, onActionOnlyChange, onReset,
}: Props) {
  const hasActiveFilters =
    context !== "all" || status !== "all" || mailType !== "all" ||
    priority !== "all" || search || dateFrom || dateTo || overdueOnly || actionOnly;

  return (
    <div className="space-y-3">
      {/* Recherche */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Rechercher expéditeur, objet, référence…"
          className="w-full rounded-xl border border-white/10 bg-slate-900/60 py-2.5 pl-9 pr-4 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-400/50"
        />
        {search && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-red-400"
          >
            ✕
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* Contexte */}
        <select
          value={context}
          onChange={(e) => onContextChange(e.target.value as MailContext | "all")}
          className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/50"
        >
          <option value="all">Tous les contextes</option>
          <option value="pro">💼 Pro</option>
          <option value="perso">🎯 Perso</option>
        </select>

        {/* Statut */}
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value as MailStatus | "all")}
          className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/50"
        >
          <option value="all">Tous les statuts</option>
          {MAIL_STATUSES.map((s) => (
            <option key={s} value={s}>{MAIL_STATUS_LABELS[s]}</option>
          ))}
        </select>

        {/* Type */}
        <select
          value={mailType}
          onChange={(e) => onMailTypeChange(e.target.value as MailType | "all")}
          className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/50"
        >
          <option value="all">Tous les types</option>
          {MAIL_TYPES.map((t) => (
            <option key={t} value={t}>{MAIL_TYPE_ICONS[t]} {MAIL_TYPE_LABELS[t]}</option>
          ))}
        </select>

        {/* Priorité */}
        <select
          value={priority}
          onChange={(e) => onPriorityChange(e.target.value as MailPriority | "all")}
          className="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/50"
        >
          <option value="all">Toutes priorités</option>
          <option value="urgent">🔴 Urgent</option>
          <option value="haute">🟠 Haute</option>
          <option value="normal">🟡 Normal</option>
          <option value="basse">⚪ Basse</option>
        </select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <label className="mb-1 block text-xs text-slate-500">Du</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/50"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">Au</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/50"
          />
        </div>
      </div>

      {/* Filtres rapides */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onActionOnlyChange(!actionOnly)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
            actionOnly
              ? "border-orange-400/50 bg-orange-400/15 text-orange-300"
              : "border-white/10 bg-slate-900/40 text-slate-400 hover:border-orange-400/30"
          }`}
        >
          ⚡ Action requise
        </button>
        <button
          onClick={() => onOverdueOnlyChange(!overdueOnly)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
            overdueOnly
              ? "border-red-400/50 bg-red-400/15 text-red-300"
              : "border-white/10 bg-slate-900/40 text-slate-400 hover:border-red-400/30"
          }`}
        >
          ⏰ En retard
        </button>
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="ml-auto flex items-center gap-1 rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400 hover:text-red-400 hover:border-red-400/30 transition-colors"
          >
            ✕ Effacer filtres
          </button>
        )}
      </div>
    </div>
  );
}
