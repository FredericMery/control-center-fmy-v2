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

  const typeTitle = typeParam.charAt(0).toUpperCase() + typeParam.slice(1);
  const typeEmoji = typeParam === "pro" ? "💼" : "🎯";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">

      {/* HEADER SECTION */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-slate-900/80 border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-gray-400 hover:text-white transition text-xl">
                ←
              </Link>
              <div className="text-4xl">{typeEmoji}</div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{t('tasks.title', { type: typeTitle })}</h1>
                <p className="text-sm text-gray-400">{t('tasks.subtitle')}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleArchivedView}
                className="px-4 py-2 rounded-full text-xs font-medium bg-white/5 text-gray-300 hover:bg-white/10 transition-all"
              >
                {showArchived ? t('tasks.active') : t('tasks.archives')}
              </button>
              <NotificationBell />
            </div>
          </div>

        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="max-w-5xl mx-auto px-6 py-8 pb-32">

        {filteredTasks.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🎯</div>
            <p className="text-gray-400 text-lg mb-6">
              {showArchived ? t('tasks.noneArchived') : t('tasks.noneYet')}
            </p>
            {!showArchived && (
              <button
                onClick={() => setShowModal(true)}
                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-full font-semibold transition-all hover:scale-105"
              >
                {t('tasks.createTask')}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
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
                  className={`group relative bg-white/5 backdrop-blur-sm p-5 rounded-2xl hover:bg-white/10 cursor-pointer border transition-all ${
                    deadlinePassed ? "border-red-500/50 bg-red-500/5" : "border-white/10"
                  }`}
                  onClick={() =>
                    setExpandedTaskId(
                      expandedTaskId === task.id ? null : task.id
                    )
                  }
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-3 mb-3">
                        <span className="text-2xl flex-shrink-0">{statusEmojis[task.status]}</span>
                        <h3 className="text-sm font-light text-white leading-relaxed">
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
                            className="px-2 py-1 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs hover:bg-emerald-500/30 transition-colors"
                            title={`Appeler: ${contacts.phone}`}
                          >
                            📱 {t('tasks.phone')}
                          </a>
                        ) : (
                          <span
                            className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-gray-500 text-xs"
                            title={t('tasks.addPhoneHint')}
                          >
                            📱 {t('tasks.phone')}
                          </span>
                        )}

                        {emailHref ? (
                          <a
                            href={emailHref}
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 py-1 rounded-md bg-sky-500/20 border border-sky-400/40 text-sky-300 text-xs hover:bg-sky-500/30 transition-colors"
                            title={`Email: ${contacts.email}`}
                          >
                            📧 {t('tasks.mail')}
                          </a>
                        ) : (
                          <span
                            className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-gray-500 text-xs"
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
                            className="px-2 py-1 rounded-md bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 text-xs hover:bg-indigo-500/30 transition-colors"
                            title={`Teams: ${contacts.teams}`}
                          >
                            💬 Teams
                          </a>
                        ) : (
                          <span
                            className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-gray-500 text-xs"
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
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-red-400 hover:text-red-300 transition text-xl"
                    >
                      🗑️
                    </button>
                  </div>

                  {expandedTaskId === task.id && (
                    <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
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
                            className={`px-4 py-2 rounded-lg text-xs uppercase font-medium transition-all ${statusColors[status]} hover:brightness-110`}
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
                          className="w-full px-4 py-2 rounded-lg bg-purple-600/30 text-purple-300 hover:bg-purple-600/40 text-xs uppercase font-medium transition-all"
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
        onTransfer={async (email) => {
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
