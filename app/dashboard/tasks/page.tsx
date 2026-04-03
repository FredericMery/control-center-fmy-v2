"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTaskStore } from "@/store/taskStore";
import { useAuthStore } from "@/store/authStore";
import { extractContacts, generateTelUri, generateMailtoUri, generateTeamsAppUri } from "@/lib/contactExtractor";
import { getAuthHeaders } from "@/lib/auth/clientSession";
import TaskModal from "@/components/TaskModal";
import TransferModal from "@/components/TransferModal";
import Link from "next/link";
import NotificationBell from "@/components/NotificationBell";
import { supabase } from "@/lib/supabase/client";
import { getValidAccessToken } from "@/lib/auth/clientToken";
import { useI18n } from "@/components/providers/LanguageProvider";

const statuses = ["todo", "in_progress", "waiting", "done"] as const;

// ─── AI Categories ───────────────────────────────────────────────────────────
const AI_CATEGORIES = [
  "RH",
  "Organisation",
  "Juridique",
  "Commerce",
  "Financier",
  "Communication",
  "Projet",
  "Technique",
  "Autre",
] as const;

const categoryMeta: Record<string, { emoji: string; pill: string }> = {
  RH:            { emoji: "👥", pill: "bg-purple-500/20 text-purple-300 border border-purple-400/30" },
  Organisation:  { emoji: "📋", pill: "bg-blue-500/20 text-blue-300 border border-blue-400/30" },
  Juridique:     { emoji: "⚖️", pill: "bg-amber-500/20 text-amber-300 border border-amber-400/30" },
  Commerce:      { emoji: "💰", pill: "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30" },
  Financier:     { emoji: "📊", pill: "bg-orange-500/20 text-orange-300 border border-orange-400/30" },
  Communication: { emoji: "📣", pill: "bg-pink-500/20 text-pink-300 border border-pink-400/30" },
  Projet:        { emoji: "🚀", pill: "bg-cyan-600/20 text-cyan-300 border border-cyan-400/30" },
  Technique:     { emoji: "🔧", pill: "bg-slate-500/20 text-slate-300 border border-slate-400/30" },
  Autre:         { emoji: "🏷️", pill: "bg-gray-500/20 text-gray-400 border border-gray-400/20" },
};

const statusColors: Record<string, string> = {
  todo: "bg-slate-600/30 text-slate-200",
  in_progress: "bg-blue-600/30 text-blue-200",
  waiting: "bg-amber-500/30 text-amber-200",
  done: "bg-emerald-600/30 text-emerald-200",
};

const statusEmojis: Record<string, string> = {
  todo: "📝",
  in_progress: "⚡",
  waiting: "⏸️",
  done: "✅",
};

type EmailPreview = {
  id: string;
  subject: string | null;
  sender_name: string | null;
  sender_email: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string | null;
};

export default function TasksPage() {
  const { t, language } = useI18n();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type") as "pro" | "perso" || "pro";
  const openCreate = searchParams.get("new") === "1";

  const user = useAuthStore((state) => state.user);

  const {
    tasks,
    fetchTasks,
    updateStatus,
    deleteTask,
    subscribeRealtime,
    unsubscribeRealtime,
    showArchived,
    toggleArchivedView,
  } = useTaskStore();

  const [showModal, setShowModal] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryDraftByTask, setCategoryDraftByTask] = useState<Record<string, string>>({});
  const [savingCategoryTaskId, setSavingCategoryTaskId] = useState<string | null>(null);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [selectedTaskForTransfer, setSelectedTaskForTransfer] = useState<{
    id: string;
    title: string;
    deadline: string | null;
    created_at?: string;
  } | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const [emailPreviewOpen, setEmailPreviewOpen] = useState(false);
  const [emailPreviewLoading, setEmailPreviewLoading] = useState(false);

  /* ============================
     INIT SAFE (ANTI DOUBLE MOUNT)
  =============================*/
  useEffect(() => {
    if (!user) return;

    let isActive = true;

    const init = async () => {
      await fetchTasks();

      if (isActive) {
        subscribeRealtime();
      }
    };

    init();

    return () => {
      isActive = false;
      unsubscribeRealtime();
    };
  }, [user]);

  useEffect(() => {
    if (openCreate) {
      setShowModal(true);
    }
  }, [openCreate]);

  const isDeadlinePassed = (deadline: string | null) => {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
  };

  const filteredTasks = tasks.filter((task) => {
    if (task.type !== typeParam) return false;
    if (!(showArchived ? task.archived === true : task.archived !== true)) return false;
    if (selectedCategory && task.ai_category !== selectedCategory) return false;
    return true;
  });

  // Categories present in current active pro tasks (for filter buttons)
  const availableCategories = useMemo(() => {
    if (typeParam !== 'pro' || showArchived) return [];
    const activeTasks = tasks.filter(t => t.type === 'pro' && !t.archived);
    const cats = new Set(activeTasks.map(t => t.ai_category).filter(Boolean) as string[]);
    return AI_CATEGORIES.filter(c => cats.has(c));
  }, [tasks, typeParam, showArchived]);

  const activeCount = useMemo(
    () => tasks.filter(t => t.type === typeParam && !t.archived).length,
    [tasks, typeParam]
  );

  const todoCount = useMemo(
    () => filteredTasks.filter(t => t.status === "todo").length,
    [filteredTasks]
  );

  const doneCount = useMemo(
    () => filteredTasks.filter(t => t.status === "done").length,
    [filteredTasks]
  );

  const todayCreatedCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return tasks.filter((task) => {
      if (task.type !== typeParam || !task.created_at) return false;
      const created = new Date(task.created_at);
      created.setHours(0, 0, 0, 0);
      return created.getTime() === today.getTime();
    }).length;
  }, [tasks, typeParam]);

  const todayDoneCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return tasks.filter((task) => {
      if (task.type !== typeParam || !task.created_at || task.status !== "done") return false;
      const created = new Date(task.created_at);
      created.setHours(0, 0, 0, 0);
      return created.getTime() === today.getTime();
    }).length;
  }, [tasks, typeParam]);

  const dayEfficiency = useMemo(() => {
    if (todayCreatedCount === 0) return 0;
    return Math.round((todayDoneCount / todayCreatedCount) * 100);
  }, [todayCreatedCount, todayDoneCount]);

  const uncategorizedActiveProCount = useMemo(
    () => tasks.filter((t) => t.type === 'pro' && !t.archived && !t.ai_category).length,
    [tasks]
  );

  const typeTitle = typeParam.charAt(0).toUpperCase() + typeParam.slice(1);
  const typeEmoji = typeParam === "pro" ? "💼" : "🎯";

  const openLinkedEmailPreview = async (emailMessageId: string) => {
    if (!emailMessageId) return;

    setEmailPreviewLoading(true);
    try {
      const res = await fetch(`/api/email/messages/${emailMessageId}`, {
        headers: await getAuthHeaders(false),
      });
      const json = (await res.json().catch(() => ({}))) as { item?: EmailPreview; error?: string };

      if (!res.ok || !json.item) {
        alert(json.error || "Impossible de charger l'email source");
        return;
      }

      setEmailPreview(json.item);
      setEmailPreviewOpen(true);
    } finally {
      setEmailPreviewLoading(false);
    }
  };

  const runManualCategorization = async () => {
    if (isCategorizing) return;

    setIsCategorizing(true);
    try {
      const res = await fetch('/api/tasks/categorize-cron', {
        method: 'POST',
        headers: await getAuthHeaders(false),
      });
      const json = (await res.json().catch(() => ({}))) as {
        categorized?: number;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        alert(json.error || 'Erreur lors de la categorisation IA');
        return;
      }

      await fetchTasks();
      const count = Number(json.categorized || 0);
      if (count > 0) {
        alert(`Categorisation terminee: ${count} tache(s) mise(s) a jour`);
      } else {
        alert(json.message || 'Aucune tache active non categorisee');
      }
    } catch (error) {
      console.error('Erreur categorisation manuelle:', error);
      alert('Erreur lors de la categorisation IA');
    } finally {
      setIsCategorizing(false);
    }
  };

  const saveTaskCategory = async (taskId: string, category: string) => {
    if (savingCategoryTaskId) return;

    setSavingCategoryTaskId(taskId);
    try {
      const res = await fetch('/api/tasks/category-feedback', {
        method: 'POST',
        headers: await getAuthHeaders(true),
        body: JSON.stringify({
          taskId,
          correctedCategory: category,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        learned?: boolean;
        error?: string;
      };

      if (!res.ok) {
        alert(json.error || 'Impossible de modifier la categorie');
        return;
      }

      await fetchTasks();
      alert(json.learned ? 'Categorie mise a jour et apprentissage enregistre' : 'Categorie mise a jour');
    } catch (error) {
      console.error('Erreur modification categorie:', error);
      alert('Impossible de modifier la categorie');
    } finally {
      setSavingCategoryTaskId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324a_0%,_#0f172a_42%,_#020617_100%)] text-white">

      {/* HEADER SECTION */}
      <div className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/75 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-3 py-3 sm:px-6 sm:py-4">
          
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <Link href="/dashboard" className="text-xl text-gray-400 transition hover:text-white">
                ←
              </Link>
              <div className="text-3xl sm:text-4xl">{typeEmoji}</div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold tracking-tight sm:text-2xl">{t('tasks.title', { type: typeTitle })}</h1>
                <p className="text-xs text-gray-400 sm:text-sm">{t('tasks.subtitle')}</p>
              </div>
            </div>

            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:gap-3">
              {typeParam === 'pro' && (
                <button
                  onClick={runManualCategorization}
                  disabled={isCategorizing}
                  className="min-h-10 rounded-2xl border border-violet-300/30 bg-violet-500/15 px-3 py-2 text-xs font-medium text-violet-100 transition-all hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-60 sm:rounded-full sm:px-4"
                  title={`Categoriser les taches actives non categorisees (${uncategorizedActiveProCount})`}
                >
                  {isCategorizing
                    ? 'Categorisation...'
                    : `Categoriser IA (${uncategorizedActiveProCount})`}
                </button>
              )}
              <button
                onClick={toggleArchivedView}
                className="min-h-10 rounded-2xl bg-white/5 px-3 py-2 text-xs font-medium text-gray-300 transition-all hover:bg-white/10 sm:rounded-full sm:px-4"
              >
                {showArchived ? t('tasks.active') : t('tasks.archives')}
              </button>
              <button
                onClick={() => setShowModal(true)}
                aria-label={t('tasks.createTask')}
                title={t('tasks.createTask')}
                className="flex h-10 w-full items-center justify-center rounded-2xl border border-cyan-300/35 bg-gradient-to-br from-cyan-300 to-blue-400 text-xl font-semibold leading-none text-slate-950 shadow-lg shadow-cyan-900/40 transition-all hover:scale-105 hover:from-cyan-200 hover:to-blue-300 sm:w-10 sm:rounded-full"
              >
                +
              </button>
              <div className="flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 sm:rounded-full sm:border-0 sm:bg-transparent">
                <NotificationBell />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="mx-auto max-w-6xl px-3 py-4 pb-32 sm:px-6 sm:py-7">
        <section className="mb-4 overflow-x-auto rounded-2xl border border-cyan-200/10 bg-slate-900/65 p-2.5 sm:mb-6 sm:p-3">
          <div className="flex min-w-max items-center gap-2 text-xs sm:text-sm">
            <div className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1.5 text-slate-300">
              Total: <span className="font-semibold text-white">{activeCount}</span>
            </div>
            <div className="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-1.5 text-cyan-100">
              Todo: <span className="font-semibold">{todoCount}</span>
            </div>
            <div className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-100">
              Done: <span className="font-semibold">{doneCount}</span>
            </div>
            <div className="rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1.5 text-amber-100">
              Efficacite day: <span className="font-semibold">{todayDoneCount}/{todayCreatedCount}</span>
            </div>
            <div className="rounded-full border border-indigo-300/20 bg-indigo-500/10 px-3 py-1.5 text-indigo-100">
              KPI: <span className="font-semibold">{dayEfficiency}%</span>
            </div>
          </div>
        </section>

        {/* AI CATEGORY FILTERS */}
        {availableCategories.length > 0 && (
          <section className="mb-4 overflow-x-auto sm:mb-5">
            <div className="flex min-w-max items-center gap-2">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  selectedCategory === null
                    ? 'bg-white/15 text-white border border-white/30'
                    : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'
                }`}
              >
                Toutes
              </button>
              {availableCategories.map((cat) => {
                const meta = categoryMeta[cat];
                const isActive = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(isActive ? null : cat)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                      isActive
                        ? `${meta.pill} opacity-100 scale-105`
                        : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-gray-300'
                    }`}
                  >
                    {meta.emoji} {cat}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {filteredTasks.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-6xl mb-4">🎯</div>
            <p className="text-gray-400 text-lg mb-6">
              {showArchived ? t('tasks.noneArchived') : t('tasks.noneYet')}
            </p>
            {!showArchived && (
              <button
                onClick={() => setShowModal(true)}
                className="rounded-full bg-cyan-500 px-8 py-3 font-semibold text-slate-950 transition-all hover:scale-105 hover:bg-cyan-400"
              >
                {t('tasks.createTask')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5 sm:space-y-3">
            {filteredTasks.map((task) => {
              const transferInfo = parseTaskTransferInfo(task.title);
              const taskLink = parseLinkedEmailFromTaskTitle(transferInfo.cleanTitle);
              const taskPriorityInfo = parseTaskPriorityMarker(taskLink.cleanTitle);
              const displayTaskTitle = taskPriorityInfo.cleanTitle || taskLink.cleanTitle || transferInfo.cleanTitle || task.title;
              const draftCategory = categoryDraftByTask[task.id] || task.ai_category || 'Autre';

              const deadlinePassed = isDeadlinePassed(task.deadline);
              const contactSource = `${displayTaskTitle}`;
              const contacts = extractContacts(contactSource);
              const phoneHref = contacts.phone ? generateTelUri(contacts.phone) : undefined;
              const emailHref = contacts.email ? generateMailtoUri(contacts.email) : undefined;
              const teamsHref = contacts.teams ? generateTeamsAppUri(contacts.teams) : undefined;

              return (
                <div
                  key={task.id}
                  className={`group relative cursor-pointer rounded-2xl border p-3 backdrop-blur-sm transition-all sm:p-5 ${
                    deadlinePassed
                      ? "border-red-500/50 bg-red-500/5"
                      : "border-white/10 bg-slate-900/60 hover:border-white/20 hover:bg-slate-900/80"
                  }`}
                  onClick={() =>
                    setExpandedTaskId(
                      expandedTaskId === task.id ? null : task.id
                    )
                  }
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="mb-3 flex items-start gap-2.5 sm:gap-3">
                        <span className="text-2xl flex-shrink-0">{statusEmojis[task.status]}</span>
                        <div className="min-w-0">
                          {taskPriorityInfo.priority && (
                            <div className={`mb-1 inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${priorityPillClass(taskPriorityInfo.priority)}`}>
                              {taskPriorityInfo.priority === 'urgent' ? 'URGENT' : 'HIGH'}
                            </div>
                          )}
                          <h3 className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-white sm:text-[15px]">
                            {displayTaskTitle}
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        <div
                          className={`px-3 py-1 rounded-full text-xs uppercase font-medium ${statusColors[task.status]}`}
                        >
                          {t(`tasks.status.${task.status}`)}
                        </div>

                        {task.ai_category && categoryMeta[task.ai_category] && (
                          <div
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${categoryMeta[task.ai_category].pill}`}
                            title={`Catégorie IA : ${task.ai_category}`}
                          >
                            {categoryMeta[task.ai_category].emoji} {task.ai_category}
                          </div>
                        )}

                        {!task.ai_category && typeParam === 'pro' && (
                          <div
                            className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-gray-300"
                            title="Tâche non catégorisée par l'IA"
                          >
                            🏷️ Non categorisee
                          </div>
                        )}

                        {task.deadline && (
                          <div
                            className={`text-xs font-medium ${
                              deadlinePassed
                                ? "text-red-400 bg-red-500/20 px-3 py-1 rounded-full"
                                : "text-gray-400"
                            }`}
                          >
                            📅 {new Date(task.deadline).toLocaleDateString(language === 'fr' ? 'fr-FR' : language === 'es' ? 'es-ES' : 'en-US')}
                          </div>
                        )}
                      </div>

                      {transferInfo.recipientEmail && transferInfo.transferredAt && (
                        <div className="mt-2 inline-flex items-center rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-100">
                          ↗ Transferee a {transferInfo.recipientEmail} le {formatTransferDate(transferInfo.transferredAt, language)}
                        </div>
                      )}

                      {/* Contact Actions */}
                      <div className="flex gap-2 mt-2">
                        {phoneHref ? (
                          <a
                            href={phoneHref}
                            onClick={(e) => e.stopPropagation()}
                            className="min-h-8 rounded-md border border-emerald-400/40 bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/30"
                            title={`Appeler: ${contacts.phone}`}
                          >
                            📱 {t('tasks.phone')}
                          </a>
                        ) : (
                          <span
                            className="min-h-8 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-500"
                            title={t('tasks.addPhoneHint')}
                          >
                            📱 {t('tasks.phone')}
                          </span>
                        )}

                        {emailHref ? (
                          <a
                            href={emailHref}
                            onClick={(e) => e.stopPropagation()}
                            className="min-h-8 rounded-md border border-sky-400/40 bg-sky-500/20 px-2 py-1 text-xs text-sky-300 transition-colors hover:bg-sky-500/30"
                            title={`Email: ${contacts.email}`}
                          >
                            📧 {t('tasks.mail')}
                          </a>
                        ) : (
                          <span
                            className="min-h-8 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-500"
                            title={t('tasks.addEmailHint')}
                          >
                            📧 {t('tasks.mail')}
                          </span>
                        )}

                        {teamsHref ? (
                          <a
                            href={teamsHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="min-h-8 rounded-md border border-indigo-400/40 bg-indigo-500/20 px-2 py-1 text-xs text-indigo-300 transition-colors hover:bg-indigo-500/30"
                            title={`Teams: ${contacts.teams}`}
                          >
                            💬 Teams
                          </a>
                        ) : (
                          <span
                            className="min-h-8 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-500"
                            title={t('tasks.addTeamsHint')}
                          >
                            💬 Teams
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTask(task.id);
                      }}
                      className="text-xl text-red-400 transition hover:text-red-300 opacity-100 md:opacity-0 md:group-hover:opacity-100"
                    >
                      🗑️
                    </button>
                  </div>

                  {expandedTaskId === task.id && (
                    <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
                      <p className="text-xs text-gray-400 uppercase tracking-wide">{t('tasks.changeStatus')}</p>
                      <div className="flex gap-2 flex-wrap">
                        {statuses.map((status) => (
                          <button
                            key={status}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateStatus(task.id, status);
                              setExpandedTaskId(null);
                            }}
                            className={`rounded-lg px-4 py-2 text-xs font-medium uppercase transition-all hover:brightness-110 ${statusColors[status]}`}
                          >
                            {statusEmojis[status]} {t(`tasks.status.${status}`)}
                          </button>
                        ))}
                      </div>

                      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Categorie IA</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {AI_CATEGORIES.map((cat) => {
                            const active = draftCategory === cat;
                            const meta = categoryMeta[cat];
                            return (
                              <button
                                key={cat}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCategoryDraftByTask((prev) => ({ ...prev, [task.id]: cat }));
                                }}
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${
                                  active
                                    ? `${meta.pill} scale-105`
                                    : 'border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                                }`}
                              >
                                {meta.emoji} {cat}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void saveTaskCategory(task.id, draftCategory);
                          }}
                          disabled={savingCategoryTaskId === task.id || (task.ai_category || 'Autre') === draftCategory}
                          className="mt-3 w-full rounded-lg border border-violet-300/35 bg-violet-500/10 px-4 py-2 text-xs font-medium uppercase text-violet-200 transition-all hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {savingCategoryTaskId === task.id ? 'Enregistrement...' : 'Enregistrer la categorie'}
                        </button>
                      </div>

                      <div className="pt-3 border-t border-white/10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTaskForTransfer({
                              id: task.id,
                              title: displayTaskTitle,
                              deadline: task.deadline,
                              created_at: task.created_at,
                            });
                            setTransferModalOpen(true);
                          }}
                          className="w-full rounded-lg bg-purple-600/30 px-4 py-2 text-xs font-medium uppercase text-purple-300 transition-all hover:bg-purple-600/40"
                        >
                          ✉️ {t('tasks.transfer')}
                        </button>

                        {taskLink.emailMessageId && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openLinkedEmailPreview(taskLink.emailMessageId);
                            }}
                            disabled={emailPreviewLoading}
                            className="mt-2 w-full rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-4 py-2 text-xs font-medium uppercase text-cyan-200 transition-all hover:bg-cyan-500/20 disabled:opacity-50"
                          >
                            {emailPreviewLoading ? 'Chargement email...' : 'Lire email source'}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>

      <TaskModal open={showModal} onClose={() => setShowModal(false)} defaultType={typeParam} />
      
      <TransferModal
        open={transferModalOpen}
        taskTitle={selectedTaskForTransfer?.title || ""}
        onClose={() => {
          setTransferModalOpen(false);
          setSelectedTaskForTransfer(null);
        }}
        onTransfer={async (email, customMessage) => {
          if (!selectedTaskForTransfer) return;

          setIsTransferring(true);
          try {
            const token = await getValidAccessToken();
            if (!token) {
              await supabase.auth.signOut();
              window.location.href = "/login";
              throw new Error(t('tasks.sessionExpired'));
            }

            const response = await fetch("/api/tasks/transfer", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
              },
              body: JSON.stringify({
                taskId: selectedTaskForTransfer.id,
                taskTitle: selectedTaskForTransfer.title,
                taskDeadline: selectedTaskForTransfer.deadline,
                createdAt: selectedTaskForTransfer.created_at,
                recipientEmail: email,
                customMessage,
              }),
            });

            if (!response.ok) {
              if (response.status === 401) {
                await supabase.auth.signOut();
                window.location.href = "/login";
                throw new Error(t('tasks.sessionExpired'));
              }

              const contentType = response.headers.get("content-type") || "";
              const errorData = contentType.includes("application/json")
                ? await response.json()
                : { error: await response.text() };
              console.error('❌ Erreur serveur:', errorData);
              throw new Error(errorData.details || errorData.error || t('tasks.transferError'));
            }

            const result = await response.json();
            console.log('✅ Transfert réussi:', result);
            
            // Rafraîchir les tâches
            await fetchTasks();
            
            // Fermer le modal et montrer un message de succès
            setTransferModalOpen(false);
            setSelectedTaskForTransfer(null);
            alert(`✅ ${t('tasks.transferSuccess', { email })}`);
          } catch (error: unknown) {
            console.error("❌ Erreur transfert complète:", error);
            const message = error instanceof Error ? error.message : t('tasks.unknownError');
            alert(`❌ ${t('tasks.transferError')}: ${message}`);
          } finally {
            setIsTransferring(false);
          }
        }}
        isLoading={isTransferring}
      />

      {emailPreviewOpen && emailPreview && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-4 sm:p-6">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{emailPreview.subject || '(sans objet)'}</h3>
                <p className="text-xs text-slate-400">
                  De: {emailPreview.sender_name || '-'} &lt;{emailPreview.sender_email || '-'}&gt;
                </p>
              </div>
              <button
                onClick={() => {
                  setEmailPreviewOpen(false);
                  setEmailPreview(null);
                }}
                className="rounded-lg border border-white/15 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                Fermer
              </button>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
              <p className="whitespace-pre-wrap text-sm text-slate-100">
                {emailPreview.body_text || emailPreview.body_html || '(contenu vide)'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function parseLinkedEmailFromTaskTitle(rawTitle: string): { cleanTitle: string; emailMessageId: string } {
  const raw = String(rawTitle || '');
  const match = raw.match(/\s*\[email:([a-z0-9-]{8,})\]\s*$/i);
  if (!match?.[1]) {
    return { cleanTitle: raw, emailMessageId: '' };
  }

  const cleanTitle = raw.replace(/\s*\[email:[a-z0-9-]{8,}\]\s*$/i, '').trim();
  return {
    cleanTitle,
    emailMessageId: String(match[1] || '').trim(),
  };
}

function parseTaskTransferInfo(rawTitle: string): {
  cleanTitle: string;
  recipientEmail: string;
  transferredAt: string;
} {
  const raw = String(rawTitle || '');
  const match = raw.match(/\[transfer:([^|\]]+)\|([^\]]+)\]/i);

  if (!match?.[1] || !match?.[2]) {
    return {
      cleanTitle: raw,
      recipientEmail: '',
      transferredAt: '',
    };
  }

  const cleanTitle = raw.replace(/\s*\[transfer:[^\]]+\]\s*/i, ' ').replace(/\s+/g, ' ').trim();
  return {
    cleanTitle,
    recipientEmail: String(match[1] || '').trim(),
    transferredAt: String(match[2] || '').trim(),
  };
}

function parseTaskPriorityMarker(rawTitle: string): {
  cleanTitle: string;
  priority: 'urgent' | 'high' | null;
} {
  const raw = String(rawTitle || '');
  const match = raw.match(/^\[(urgent|high)\]\s*/i);

  if (!match?.[1]) {
    return {
      cleanTitle: raw,
      priority: null,
    };
  }

  const priorityRaw = String(match[1]).toLowerCase();
  const priority = priorityRaw === 'urgent' ? 'urgent' : 'high';
  const cleanTitle = raw.replace(/^\[(urgent|high)\]\s*/i, '').trim();

  return {
    cleanTitle,
    priority,
  };
}

function priorityPillClass(priority: 'urgent' | 'high'): string {
  if (priority === 'urgent') {
    return 'border-rose-300/50 bg-rose-500/20 text-rose-100';
  }

  return 'border-amber-300/50 bg-amber-500/20 text-amber-100';
}

function formatTransferDate(value: string, language: string): string {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return value;

  const locale = language === 'fr' ? 'fr-FR' : language === 'es' ? 'es-ES' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
