"use client";

import { useEffect, useState } from "react";
import { useTaskStore } from "@/store/taskStore";
import { useAuthStore } from "@/store/authStore";
import TaskModal from "@/components/TaskModal";
import Link from "next/link";

const statuses = ["todo", "in_progress", "waiting", "done"] as const;

const statusLabels: Record<string, string> = {
  todo: "À faire",
  in_progress: "En cours",
  waiting: "En attente",
  done: "Terminé",
};

const statusColors: Record<string, string> = {
  todo: "bg-gray-600/30 text-gray-300",
  in_progress: "bg-blue-600/30 text-blue-300",
  waiting: "bg-yellow-500/30 text-yellow-300",
  done: "bg-green-600/30 text-green-300",
};

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  const {
    tasks,
    fetchTasks,
    updateStatus,
    deleteTask,
    activeType,
    setActiveType,
    subscribeRealtime,
    showArchived,
    toggleArchivedView,
  } = useTaskStore();

  const [showModal, setShowModal] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchTasks();
    subscribeRealtime();
  }, [user]);

  useEffect(() => {
    setActiveType("pro");
  }, []);

  const isDeadlinePassed = (deadline: string | null) => {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
  };

  const filteredTasks = tasks.filter(
    (task) =>
      task.type === activeType &&
      task.archived === showArchived
  );

  return (
    <div className="min-h-screen bg-black text-white px-6 py-10">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-3">

        <div className="flex gap-2">

          {["pro", "perso"].map((type) => (
            <button
              key={type}
              onClick={() => setActiveType(type as "pro" | "perso")}
              className={`px-4 py-1.5 rounded-full text-xs font-light tracking-wide transition ${
                activeType === type
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                  : "bg-white/5 text-gray-400 hover:bg-white/10"
              }`}
            >
              {type.toUpperCase()}
            </button>
          ))}

          <Link
            href="/dashboard/memoire"
            className="px-4 py-1.5 rounded-full text-xs font-light tracking-wide bg-white/5 text-gray-400 hover:bg-white/10 transition"
          >
            MÉMOIRE
          </Link>

        </div>

        <button
          onClick={() => setShowModal(true)}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-light shadow-xl shadow-indigo-500/30 hover:scale-105 transition-transform"
        >
          +
        </button>
      </div>

      {/* TOGGLE ARCHIVE */}
      <div className="mb-8">
        <button
          onClick={toggleArchivedView}
          className="text-xs text-gray-500 hover:text-gray-300 transition underline"
        >
          {showArchived
            ? "Voir les tâches actives"
            : "Voir les tâches archivées"}
        </button>
      </div>

      {/* TASK LIST */}
      <div className="space-y-5">
        {filteredTasks.map((task) => {
          const deadlinePassed = isDeadlinePassed(task.deadline);

          return (
            <div
              key={task.id}
              className={`relative bg-white/5 p-5 rounded-2xl transition hover:bg-white/10 cursor-pointer ${
                deadlinePassed ? "border-l-4 border-red-500" : ""
              }`}
              onClick={() =>
                setExpandedTaskId(
                  expandedTaskId === task.id ? null : task.id
                )
              }
            >
              {/* TITRE + CORBEILLE */}
              <div className="flex justify-between items-start">
                <div className="text-sm font-light tracking-wide text-gray-200">
                  {task.title}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteTask(task.id);
                  }}
                  className="text-red-400 hover:text-red-300 transition"
                >
                  🗑
                </button>
              </div>

              {/* STATUT + DEADLINE */}
              <div className="flex justify-between items-center mt-3">

                <div
                  className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-wide ${statusColors[task.status]}`}
                >
                  {statusLabels[task.status]}
                </div>

                {task.deadline && (
                  <div
                    className={`text-[11px] ${
                      deadlinePassed
                        ? "text-red-400"
                        : "text-gray-400"
                    }`}
                  >
                    📅{" "}
                    {new Date(task.deadline).toLocaleDateString("fr-FR")}
                  </div>
                )}
              </div>

              {/* STATUTS AU CLIC */}
              {expandedTaskId === task.id && (
                <div className="flex gap-2 mt-4 flex-wrap">
                  {statuses.map((status) => (
                    <button
                      key={status}
                      onClick={(e) => {
                        e.stopPropagation();
                        updateStatus(task.id, status);
                        setExpandedTaskId(null);
                      }}
                      className={`px-3 py-1 rounded-lg text-[10px] uppercase tracking-wide transition ${statusColors[status]}`}
                    >
                      {statusLabels[status]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <TaskModal open={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
}
