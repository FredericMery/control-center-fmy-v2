"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTaskStore } from "@/store/taskStore";
import { useAuthStore } from "@/store/authStore";
import { extractContacts, generateTelUri, generateMailtoUri, generateTeamsAppUri } from "@/lib/contactExtractor";
import TaskModal from "@/components/TaskModal";
import Link from "next/link";
import NotificationBell from "@/components/NotificationBell";

const statuses = ["todo", "in_progress", "waiting", "done"] as const;

const statusLabels: Record<string, string> = {
  todo: "À faire",
  in_progress: "En cours",
  waiting: "En attente",
  done: "Terminé",
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

export default function TasksPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const typeParam = searchParams.get("type") as "pro" | "perso" || "pro";

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
                <h1 className="text-2xl font-bold tracking-tight">Tâches {typeTitle}</h1>
                <p className="text-sm text-gray-400">Gérez vos priorités</p>
              </div>
            </div>

            <NotificationBell />
          </div>

          {/* STATS */}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total</p>
              <p className="text-2xl font-bold">{activeCount}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">À faire</p>
              <p className="text-2xl font-bold">{todoCount}</p>
            </div>
            <div className={`rounded-lg p-3 border ${
              showArchived
                ? "bg-emerald-500/10 border-emerald-500/20"
                : "bg-amber-500/10 border-amber-500/20"
            }`}>
              <p className={`text-xs uppercase tracking-wide mb-1 ${
                showArchived ? "text-emerald-400" : "text-amber-400"
              }`}>
                {showArchived ? "Complétées" : "Complétées"}
              </p>
              <p className={`text-2xl font-bold ${
                showArchived ? "text-emerald-400" : "text-amber-400"
              }`}>
                {doneCount}
              </p>
            </div>
            <button
              onClick={toggleArchivedView}
              className="bg-white/5 rounded-lg p-3 border border-white/10 hover:bg-white/10 transition-all text-left"
            >
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{showArchived ? "Activer" : "Archiver"}</p>
              <p className="text-2xl font-bold">{showArchived ? "Actives" : "Archives"}</p>
            </button>
          </div>

          {/* ACTION BUTTONS */}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={() => setShowModal(true)}
              className="px-6 py-2.5 rounded-full text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-all"
            >
              + Créer une tâche
            </button>

            <Link
              href="/dashboard"
              className="px-6 py-2.5 rounded-full text-sm font-medium bg-white/5 text-gray-300 hover:bg-white/10 transition-all"
            >
              Retour
            </Link>
          </div>

        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="max-w-5xl mx-auto px-6 py-8 pb-32">

        {filteredTasks.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🎯</div>
            <p className="text-gray-400 text-lg mb-6">
              {showArchived ? "Aucune tâche archivée" : "Aucune tâche pour le moment"}
            </p>
            {!showArchived && (
              <button
                onClick={() => setShowModal(true)}
                className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-full font-semibold transition-all hover:scale-105"
              >
                Créer une tâche +
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
                          {statusLabels[task.status]}
                        </div>

                        {task.deadline && (
                          <div
                            className={`text-xs font-medium ${
                              deadlinePassed
                                ? "text-red-400 bg-red-500/20 px-3 py-1 rounded-full"
                                : "text-gray-400"
                            }`}
                          >
                            📅 {new Date(task.deadline).toLocaleDateString("fr-FR")}
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
                            📱 Tél
                          </a>
                        ) : (
                          <span
                            className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-gray-500 text-xs"
                            title="Ajoute un numéro (ex: +33 6 12 34 56 78)"
                          >
                            📱 Tél
                          </span>
                        )}

                        {emailHref ? (
                          <a
                            href={emailHref}
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 py-1 rounded-md bg-sky-500/20 border border-sky-400/40 text-sky-300 text-xs hover:bg-sky-500/30 transition-colors"
                            title={`Email: ${contacts.email}`}
                          >
                            📧 Mail
                          </a>
                        ) : (
                          <span
                            className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-gray-500 text-xs"
                            title="Ajoute un email (ex: nom@domaine.com)"
                          >
                            📧 Mail
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
                            title="Ajoute un contact (ex: @Prénom Nom)"
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
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition text-xl"
                    >
                      🗑️
                    </button>
                  </div>

                  {expandedTaskId === task.id && (
                    <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                      <p className="text-xs text-gray-400 uppercase tracking-wide">Changer le statut</p>
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
                            {statusEmojis[status]} {statusLabels[status]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* FLOATING ACTION BUTTON */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-8 right-8 w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-5xl font-bold shadow-2xl z-[1000] hover:scale-110 active:scale-95 transition-transform flex items-center justify-center border-4 border-white/20"
      >
        +
      </button>

      <TaskModal open={showModal} onClose={() => setShowModal(false)} defaultType={typeParam} />
    </div>
  );
}
