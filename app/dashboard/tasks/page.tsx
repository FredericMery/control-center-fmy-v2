"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTaskStore } from "@/store/taskStore";
import { useAuthStore } from "@/store/authStore";
import { extractContacts, generateTelUri, generateMailtoUri, generateTeamsAppUri } from "@/lib/contactExtractor";
import TaskModal from "@/components/TaskModal";
import TransferModal from "@/components/TransferModal";
import Link from "next/link";
import NotificationBell from "@/components/NotificationBell";
import { supabase } from "@/lib/supabase/client";
import { getValidAccessToken } from "@/lib/auth/clientToken";
import { useI18n } from "@/components/providers/LanguageProvider";

const statuses = ["todo", "in_progress", "waiting", "done"] as const;

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
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [selectedTaskForTransfer, setSelectedTaskForTransfer] = useState<{
    id: string;
    title: string;
    deadline: string | null;
    created_at?: string;
  } | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);

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
    return showArchived ? task.archived === true : task.archived !== true;
  });

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

  const typeTitle = typeParam.charAt(0).toUpperCase() + typeParam.slice(1);
  const typeEmoji = typeParam === "pro" ? "💼" : "🎯";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324a_0%,_#0f172a_42%,_#020617_100%)] text-white">

      {/* HEADER SECTION */}
      <div className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/75 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-3 py-3 sm:px-6 sm:py-4">
          
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <Link href="/dashboard" className="text-xl text-gray-400 transition hover:text-white">
                ←
              </Link>
              <div className="text-3xl sm:text-4xl">{typeEmoji}</div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{t('tasks.title', { type: typeTitle })}</h1>
                <p className="text-xs text-gray-400 sm:text-sm">{t('tasks.subtitle')}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={toggleArchivedView}
                className="min-h-10 rounded-full bg-white/5 px-3 py-2 text-xs font-medium text-gray-300 transition-all hover:bg-white/10 sm:px-4"
              >
                {showArchived ? t('tasks.active') : t('tasks.archives')}
              </button>
              <NotificationBell />
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

              const deadlinePassed = isDeadlinePassed(task.deadline);
              const contactSource = `${task.title}`;
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
                        <h3 className="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-white sm:text-[15px]">
                          {task.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-3 flex-wrap">
                        <div
                          className={`px-3 py-1 rounded-full text-xs uppercase font-medium ${statusColors[task.status]}`}
                        >
                          {t(`tasks.status.${task.status}`)}
                        </div>

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

                      <div className="pt-3 border-t border-white/10">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTaskForTransfer({
                              id: task.id,
                              title: task.title,
                              deadline: task.deadline,
                              created_at: task.created_at,
                            });
                            setTransferModalOpen(true);
                          }}
                          className="w-full rounded-lg bg-purple-600/30 px-4 py-2 text-xs font-medium uppercase text-purple-300 transition-all hover:bg-purple-600/40"
                        >
                          ✉️ {t('tasks.transfer')}
                        </button>
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
    </div>
  );
}
