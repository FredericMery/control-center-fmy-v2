"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuthStore } from "@/store/authStore";
import { getAuthHeaders } from "@/lib/auth/clientSession";
import type {
  MailItem,
  MailContext,
  MailType,
  MailStatus,
  MailPriority,
} from "@/types/mail";
import MailList from "@/components/mail/MailList";
import MailFilters from "@/components/mail/MailFilters";
import MailForm from "@/components/mail/MailForm";
import MailDetail from "@/components/mail/MailDetail";
import MailStatsPanel from "@/components/mail/MailStatsPanel";
import ComposeModal from "@/components/mail/ComposeModal";

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

type ModalMode = "none" | "new" | "edit";

export default function CourrierPage() {
  const user = useAuthStore((s) => s.user);

  // --- Liste ---
  const [items, setItems]           = useState<MailItem[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const offset                       = useRef(0);
  const LIMIT                        = 30;

  // --- Filtres ---
  const [context, setContext]         = useState<MailContext | "all">("all");
  const [status, setStatus]           = useState<MailStatus | "all">("all");
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
  const [activeTab, setActiveTab]         = useState<"all" | MailContext>("all");
  const [showCompose, setShowCompose]     = useState(false);

  // ------- Chargement liste -------
  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (context !== "all")  params.set("context", context);
    if (status !== "all")   params.set("status", status);
    if (mailType !== "all") params.set("mail_type", mailType);
    if (priority !== "all") params.set("priority", priority);
    if (search)             params.set("search", search);
    if (dateFrom)           params.set("date_from", dateFrom);
    if (dateTo)             params.set("date_to", dateTo);
    if (overdueOnly)        params.set("overdue", "1");
    if (actionOnly)         params.set("action_required", "1");
    params.set("limit", String(LIMIT));
    return params;
  }, [context, status, mailType, priority, search, dateFrom, dateTo, overdueOnly, actionOnly]);

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
  }, [context, status, mailType, priority, dateFrom, dateTo, overdueOnly, actionOnly]);

  useEffect(() => {
    if (!search) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadItems(true), 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  useEffect(() => {
    if (user) { loadItems(true); loadStats(); }
  }, [user]);

  // Sync tab → context filter
  useEffect(() => {
    setContext(activeTab === "all" ? "all" : activeTab);
  }, [activeTab]);

  const resetFilters = () => {
    setStatus("all");
    setMailType("all");
    setPriority("all");
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setOverdueOnly(false);
    setActionOnly(false);
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
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i))
    );
    if (selectedItem?.id === id) {
      setSelectedItem((prev) => prev ? { ...prev, status: newStatus } : null);
    }
    loadStats();
  };

  const openEdit = (item: MailItem) => {
    setEditItem(item);
    setModal("edit");
    setSelectedItem(null);
  };

  const hasOverdue = (stats?.stats.overdue || 0) > 0;
  const hasAction  = (stats?.stats.action_required || 0) > 0;

  return (
    <>

    <div className="mx-auto max-w-7xl px-3 pb-24 sm:px-4">

      {/* ── Header ── */}
      <section className="mb-6 rounded-3xl border border-violet-200/10 bg-gradient-to-r from-slate-900/80 via-slate-900/75 to-violet-950/60 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-violet-200/70">Module Courrier</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              📬 Gestionnaire de Courrier
            </h1>
            <p className="mt-1.5 text-sm text-slate-400">
              Archivage intelligent · Suivi · IA auto-analyse
              {stats && (
                <span className="ml-2 text-slate-500">
                  — {stats.stats.total} courrier{stats.stats.total > 1 ? "s" : ""}
                </span>
              )}
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
            >
              📊
            </button>
            <button
              onClick={() => setShowCompose(true)}
              className="flex items-center gap-1.5 rounded-xl border border-violet-400/30 bg-violet-400/10 px-3 py-2 text-sm font-medium text-violet-300 hover:bg-violet-400/20 transition-colors"
              title="Rédiger un email"
            >
              ✉️
              <span className="hidden sm:inline">Rédiger</span>
            </button>
            <button
              onClick={() => setModal("new")}
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 transition-colors sm:px-4"
            >
              <span>+</span>
              <span className="hidden sm:inline">Nouveau courrier</span>
            </button>
          </div>
        </div>

        {/* Alertes rapides */}
        {(hasOverdue || hasAction) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {hasAction && (
              <button
                onClick={() => { setActionOnly(true); setOverdueOnly(false); }}
                className="flex items-center gap-1.5 rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1 text-xs font-medium text-orange-300 hover:bg-orange-400/20 transition-colors"
              >
                ⚡ {stats!.stats.action_required} action{stats!.stats.action_required > 1 ? "s" : ""} requise{stats!.stats.action_required > 1 ? "s" : ""}
              </button>
            )}
            {hasOverdue && (
              <button
                onClick={() => { setOverdueOnly(true); setActionOnly(false); }}
                className="flex items-center gap-1.5 rounded-full border border-red-400/30 bg-red-400/10 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-400/20 transition-colors"
              >
                ⏰ {stats!.stats.overdue} en retard
              </button>
            )}
          </div>
        )}
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

      {/* ── Onglets Pro / Perso ── */}
      <div className="mb-4 flex gap-1 rounded-2xl border border-white/10 bg-slate-900/60 p-1">
        {(["all", "pro", "perso"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-xl py-2 text-sm font-medium transition-all ${
              activeTab === tab
                ? tab === "pro"
                  ? "bg-blue-500/20 text-blue-300 border border-blue-400/30"
                  : tab === "perso"
                  ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-400/30"
                  : "bg-violet-500/20 text-violet-200 border border-violet-400/30"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "all" ? "📬 Tout" : tab === "pro" ? "💼 Pro" : "🎯 Perso"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* ── Colonne gauche : filtres + liste ── */}
        <div className="space-y-3 lg:col-span-1">

          {/* Toggle filtres */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800/50 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              🔧 <span>Filtres avancés</span>
            </span>
            <span className="text-slate-500">{showFilters ? "▲" : "▼"}</span>
          </button>

          {showFilters && (
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3 shadow-lg">
              <MailFilters
                context={context}
                status={status}
                mailType={mailType}
                priority={priority}
                search={search}
                dateFrom={dateFrom}
                dateTo={dateTo}
                overdueOnly={overdueOnly}
                actionOnly={actionOnly}
                onContextChange={setContext}
                onStatusChange={setStatus}
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
              {total} résultat{total > 1 ? "s" : ""}
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
                setSelectedItem(item);
                setModal("none");
              }}
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
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4 shadow-xl backdrop-blur min-h-[400px]">
            {modal === "none" && !selectedItem && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="text-5xl mb-4">📬</div>
                <p className="text-base font-medium text-slate-400">
                  Sélectionnez un courrier ou ajoutez-en un nouveau
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  L'IA analysera automatiquement vos scans
                </p>
                <button
                  onClick={() => setModal("new")}
                  className="mt-6 flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
                >
                  📎 Scanner / Ajouter un courrier
                </button>
              </div>
            )}

            {(modal === "new" || modal === "edit") && (
              <div>
                <h2 className="mb-4 text-base font-semibold text-white">
                  {modal === "new" ? "📥 Nouveau courrier" : "✏️ Modifier le courrier"}
                </h2>
                <MailForm
                  item={modal === "edit" ? editItem : null}
                  defaultContext={activeTab !== "all" ? activeTab : "pro"}
                  onSave={handleSave}
                  onCancel={() => { setModal("none"); setEditItem(null); }}
                />
              </div>
            )}

            {modal === "none" && selectedItem && (
              <MailDetail
                item={selectedItem}
                onEdit={openEdit}
                onDelete={handleDelete}
                onStatusChange={handleStatusChange}
                onClose={() => setSelectedItem(null)}
              />
            )}
          </div>
        </div>
      </div>
    </div>

      {/* ── Compose modal ── */}
      {showCompose && (
        <ComposeModal
          userEmail={user?.email ?? ""}
          userName={(user?.user_metadata?.full_name as string) || null}
          defaultContext={activeTab === "pro" || activeTab === "perso" ? activeTab : "pro"}
          onClose={() => setShowCompose(false)}
          onSent={() => setShowCompose(false)}
        />
      )}
    </>
  );
}
