"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { getAuthHeaders } from "@/lib/auth/clientSession";
import type {
  MailItem,
  MailContext,
  MailType,
  MailStatus,
  MailPriority,
} from "@/types/mail";
import {
  MAIL_STATUSES,
  MAIL_STATUS_COLORS,
  MAIL_STATUS_LABELS,
} from "@/types/mail";
import MailList from "@/components/mail/MailList";
import MailFilters from "@/components/mail/MailFilters";
import MailForm from "@/components/mail/MailForm";
import MailDetail from "@/components/mail/MailDetail";
import MailStatsPanel from "@/components/mail/MailStatsPanel";

type StatsData = {
  stats: {
    total: number;
    recu: number;
    en_cours: number;
    traite: number;
    clos: number;
    urgent: number;
    action_required: number;
    overdue: number;
  };
  by_type: Record<string, number>;
  top_senders: { name: string; count: number }[];
};

type ModalMode = "none" | "edit";

export default function CourrierPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  // --- Liste ---
  const [items, setItems]           = useState<MailItem[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const offset                       = useRef(0);
  const LIMIT                        = 30;

  // --- Filtres ---
  const [context, setContext]         = useState<MailContext>("pro");
  const [statuses, setStatuses]       = useState<MailStatus[]>([]);
  const [mailType, setMailType]       = useState<MailType | "all">("all");
  const [priority, setPriority]       = useState<MailPriority | "all">("all");
  const [search, setSearch]           = useState("");
  const [dateFrom, setDateFrom]       = useState("");
  const [dateTo, setDateTo]           = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [actionOnly, setActionOnly]   = useState(false);

  // --- UI ---
  const [selectedItem, setSelectedItem]   = useState<MailItem | null>(null);
  const [modal, setModal]                 = useState<ModalMode>("none");
  const [editItem, setEditItem]           = useState<MailItem | null>(null);
  const [showFilters, setShowFilters]     = useState(false);
  const [showStats, setShowStats]         = useState(false);
  const [stats, setStats]                 = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading]   = useState(false);

  // ------- Chargement liste -------
  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    params.set("context", context);
    if (statuses.length > 0) params.set("status", statuses.join(","));
    if (mailType !== "all") params.set("mail_type", mailType);
    if (priority !== "all") params.set("priority", priority);
    if (search)             params.set("search", search);
    if (dateFrom)           params.set("date_from", dateFrom);
    if (dateTo)             params.set("date_to", dateTo);
    if (overdueOnly)        params.set("overdue", "1");
    if (actionOnly)         params.set("action_required", "1");
    params.set("limit", String(LIMIT));
    return params;
  }, [context, statuses, mailType, priority, search, dateFrom, dateTo, overdueOnly, actionOnly]);

  const loadItems = useCallback(async (reset = true) => {
    if (!user) return;
    if (reset) {
      setLoading(true);
      offset.current = 0;
    } else {
      setLoadingMore(true);
    }

    try {
      const params = buildQuery();
      params.set("offset", String(reset ? 0 : offset.current));
      const res = await fetch(`/api/mail?${params}`, {
        headers: await getAuthHeaders(false),
      });
      const json = await res.json();
      if (!res.ok) return;

      if (reset) {
        setItems(json.items || []);
        offset.current = (json.items || []).length;
      } else {
        setItems((prev) => [...prev, ...(json.items || [])]);
        offset.current += (json.items || []).length;
      }
      setTotal(json.total || 0);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, buildQuery]);

  const loadStats = useCallback(async () => {
    if (!user) return;
    setStatsLoading(true);
    try {
      const res = await fetch("/api/mail/stats", {
        headers: await getAuthHeaders(false),
      });
      const json = await res.json();
      if (res.ok) setStats(json);
    } finally {
      setStatsLoading(false);
    }
  }, [user]);

  // Rechargement à chaque changement de filtre (debounced pour search)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (search) {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => loadItems(true), 350);
      return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
    }
    loadItems(true);
  }, [context, statuses, mailType, priority, dateFrom, dateTo, overdueOnly, actionOnly]);

  useEffect(() => {
    if (!search) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadItems(true), 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  useEffect(() => {
    if (user) { loadItems(true); loadStats(); }
  }, [user]);

  const resetFilters = () => {
    setStatuses([]);
    setMailType("all");
    setPriority("all");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setOverdueOnly(false);
    setActionOnly(false);
  };

  const toggleStatus = (value: MailStatus) => {
    setStatuses((current) =>
      current.includes(value)
        ? current.filter((status) => status !== value)
        : [...current, value]
    );
  };

  const handleSave = (saved: MailItem) => {
    setModal("none");
    setEditItem(null);
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === saved.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = saved;
        return updated;
      }
      return [saved, ...prev];
    });
    setSelectedItem(saved);
    loadStats();
    setTotal((t) => (editItem ? t : t + 1));
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedItem(null);
    loadStats();
    setTotal((t) => Math.max(0, t - 1));
  };

  const handleStatusChange = async (id: string, newStatus: MailStatus) => {
    // Ne conserver que les courriers correspondant aux statuts filtrés.
    const leavesCurrentList = statuses.length > 0 && !statuses.includes(newStatus);

    if (leavesCurrentList) {
      setItems((prev) => prev.filter((i) => i.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      if (selectedItem?.id === id) setSelectedItem(null);
    } else {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i))
      );
      if (selectedItem?.id === id) {
        setSelectedItem((prev) => prev ? { ...prev, status: newStatus } : null);
      }
    }
    loadStats();
  };

  const openEdit = (item: MailItem) => {
    setEditItem(item);
    setModal("edit");
    setSelectedItem(null);
  };

  return (
    <div className="mx-auto max-w-5xl px-3 pb-24 sm:px-4">

      {/* ── Header ── */}
      <section className="mb-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Courrier
            </h1>
            <p className="mt-1.5 text-sm text-slate-400">
              Retrouvez vos courriers et les actions à effectuer.
            </p>
          </div>

          {/* Actions header */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { setShowStats((v) => !v); if (!stats) loadStats(); }}
              className={`rounded-xl border px-3 py-2 text-sm transition-all ${
                showStats
                  ? "border-violet-400/40 bg-violet-400/15 text-violet-200"
                  : "border-white/10 bg-slate-800/50 text-slate-400 hover:border-white/20"
              }`}
              title="Statistiques"
              aria-label="Afficher les statistiques"
              aria-expanded={showStats}
            >
              📊
            </button>
            <button
              onClick={() => router.push("/dashboard/courrier/new")}
              aria-label="Ajouter un courrier"
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition-colors sm:px-4"
            >
              <span>+</span>
              <span className="hidden sm:inline">Nouveau courrier</span>
            </button>
          </div>
        </div>

      </section>

      {/* ── Stats Panel ── */}
      {showStats && (
        <section className="mb-4 rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-xl backdrop-blur">
          <MailStatsPanel
            data={stats}
            loading={statsLoading}
            onFilterAction={() => { setActionOnly(true); setShowStats(false); }}
            onFilterOverdue={() => { setOverdueOnly(true); setShowStats(false); }}
            onFilterUrgent={() => { setPriority("urgent"); setShowStats(false); }}
          />
        </section>
      )}

      {/* ── Filtres visuels ── */}
      <div className="mb-4 space-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-3">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Espace</p>
          <div className="grid grid-cols-2 gap-2">
            {(["pro", "perso"] as MailContext[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={context === value}
                onClick={() => { setContext(value); setSelectedItem(null); setModal("none"); }}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all ${
                  context === value
                    ? value === "pro"
                      ? "border-blue-400/50 bg-blue-400/20 text-blue-200 shadow-lg shadow-blue-950/30"
                      : "border-fuchsia-400/50 bg-fuchsia-400/20 text-fuchsia-200 shadow-lg shadow-fuchsia-950/30"
                    : "border-white/10 bg-slate-950/30 text-slate-500 hover:border-white/20 hover:text-slate-300"
                }`}
              >
                {value === "pro" ? "💼 Professionnel" : "🎯 Personnel"}
              </button>
            ))}
          </div>
        </div>
        {showFilters && <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Statuts</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={statuses.length === 0}
              onClick={() => setStatuses([])}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                statuses.length === 0
                  ? "border-violet-400/40 bg-violet-400/10 text-violet-200"
                  : "border-white/10 text-slate-400"
              }`}
            >
              Tous les statuts
            </button>
            {MAIL_STATUSES.map((value) => {
              const selected = statuses.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleStatus(value)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                    selected
                      ? MAIL_STATUS_COLORS[value]
                      : "border-white/10 bg-slate-950/30 text-slate-500 hover:border-white/20 hover:text-slate-300"
                  }`}
                >
                  {selected ? "✓ " : ""}{MAIL_STATUS_LABELS[value]}
                </button>
              );
            })}
          </div>
        </div>}
      </div>

      <div className="space-y-4">

        {/* ── Colonne gauche : filtres + liste ── */}
        <div className="space-y-3">

          {/* Toggle filtres */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <span>Filtrer les courriers</span>
            </span>
            <span className="text-slate-500">{showFilters ? "▲" : "▼"}</span>
          </button>

          {showFilters && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3 shadow-lg">
              <MailFilters
                mailType={mailType}
                priority={priority}
                search={search}
                dateFrom={dateFrom}
                dateTo={dateTo}
                overdueOnly={overdueOnly}
                actionOnly={actionOnly}
                onMailTypeChange={setMailType}
                onPriorityChange={setPriority}
                onSearchChange={setSearch}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
                onOverdueOnlyChange={setOverdueOnly}
                onActionOnlyChange={setActionOnly}
                onReset={resetFilters}
              />
            </div>
          )}

          {/* Compteur */}
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-slate-500">
              {total} courrier{total > 1 ? "s" : ""} · Cliquez pour consulter le détail
            </p>
            <button
              onClick={() => loadItems(true)}
              className="text-xs text-slate-600 hover:text-violet-400 transition-colors"
            >
              ↺ Actualiser
            </button>
          </div>

          {/* Liste */}
          <div className="rounded-2xl border border-white/8 bg-slate-900/50 p-2">
            <MailList
              items={items}
              loading={loading}
              selectedId={selectedItem?.id || null}
              onSelect={(item) => {
                setModal("none");
                setSelectedItem((prev) => (prev?.id === item.id ? null : item));
              }}
              renderExpanded={(item) => (
                <MailDetail
                  key={item.id}
                  item={item}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                  onClose={() => setSelectedItem(null)}
                />
              )}
            />

            {/* Charger plus */}
            {!loading && items.length < total && (
              <div className="mt-2 text-center">
                <button
                  onClick={() => loadItems(false)}
                  disabled={loadingMore}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? "Chargement…" : `Afficher plus (${total - items.length} restants)`}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Colonne droite : détail / formulaire ── */}
        {modal === "edit" && (
          <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4">
              <div>
                <h2 className="mb-4 text-base font-semibold text-white">
                  ✏️ Modifier le courrier
                </h2>
                <MailForm
                  item={editItem}
                  defaultContext={context}
                  onSave={handleSave}
                  onCancel={() => { setModal("none"); setEditItem(null); }}
                />
              </div>
          </div>
        )}
      </div>
    </div>
  );
}
