"use client";

import { useEffect, useState } from "react";
import { useTaskStore } from "@/store/taskStore";
import { useAuthStore } from "@/store/authStore";
import FloatingButton from "@/components/FloatingButton";
import Link from "next/link";

export default function DashboardPage() {
  const user = useAuthStore((state) => state.user);

  const {
    tasks,
    fetchTasks,
    updateStatus,
    addTask,
    deleteTask,
    activeType,
    setActiveType,
    subscribeRealtime,
  } = useTaskStore();

  const [selectedTaskId, setSelectedTaskId] =
    useState<string | null>(null);

  const [showArchived, setShowArchived] =
    useState(false);

  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDeadline, setNewDeadline] = useState("");

  const statuses = [
    "todo",
    "in_progress",
    "waiting",
    "done",
  ];

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "done":
        return "bg-green-500/20 text-green-400";
      case "in_progress":
        return "bg-blue-500/20 text-blue-400";
      case "waiting":
        return "bg-yellow-500/20 text-yellow-400";
      default:
        return "bg-white/10 text-gray-300";
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchTasks();
    subscribeRealtime();
  }, [user]);

  // PRO actif par défaut
  useEffect(() => {
    setActiveType("pro");
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#1e1b4b] text-white px-3 pt-6 pb-28">

      {/* 🔥 QUICK ACCESS BAR */}
      <div className="flex gap-3 mb-8">
        <button
          onClick={() => setActiveType("pro")}
          className={`flex-1 py-2 rounded-full text-sm font-medium transition ${
            activeType === "pro"
              ? "bg-indigo-600 shadow-lg"
              : "bg-white/10 text-gray-300"
          }`}
        >
          PRO
        </button>

        <button
          onClick={() => setActiveType("perso")}
          className={`flex-1 py-2 rounded-full text-sm font-medium transition ${
            activeType === "perso"
              ? "bg-indigo-600 shadow-lg"
              : "bg-white/10 text-gray-300"
          }`}
        >
          PERSO
        </button>

        <Link
          href="/dashboard/memoire"
          className="flex-1 py-2 rounded-full text-sm font-medium bg-white/10 text-gray-300 text-center hover:bg-white/20 transition"
        >
          MÉMOIRE
        </Link>
      </div>

      {/* TASK LIST */}
      <div className="space-y-4">
        {tasks
          .filter(
            (task) =>
              task.type === activeType &&
              task.archived === showArchived
          )
          .map((task) => (
            <div key={task.id}>
              <div
                onClick={() =>
                  setSelectedTaskId(
                    selectedTaskId === task.id ? null : task.id
                  )
                }
                className={`w-full bg-white/5 backdrop-blur-md p-5 rounded-2xl shadow-xl border-l-4 cursor-pointer transition active:scale-[0.98] ${
                  task.deadline &&
                  new Date(task.deadline) <
                    new Date(new Date().toDateString())
                    ? "border-red-500"
                    : "border-indigo-500"
                }`}
              >
                <div className="flex justify-between items-start">

                  <div className="pr-4">
                    <p className="text-base font-medium leading-snug">
                      {task.title}
                    </p>

                    {task.deadline && (
                      <p
                        className={`text-xs mt-2 ${
                          new Date(task.deadline) <
                          new Date(new Date().toDateString())
                            ? "text-red-400"
                            : "text-gray-400"
                        }`}
                      >
                        📅{" "}
                        {new Date(task.deadline).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <span
                      className={`text-[11px] px-3 py-1 rounded-full ${getStatusStyle(
                        task.status
                      )}`}
                    >
                      {task.status.replace("_", " ")}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTask(task.id);
                      }}
                      className="text-gray-500 hover:text-red-400 transition"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>

              {selectedTaskId === task.id && (
                <div className="mt-3 flex gap-2 flex-wrap">
                  {statuses.map((status) => (
                    <button
                      key={status}
                      onClick={() => {
                        updateStatus(task.id, status);
                        setSelectedTaskId(null);
                      }}
                      className={`px-3 py-1 text-xs rounded-full transition ${
                        status === task.status
                          ? "bg-indigo-600 text-white"
                          : "bg-white/10 text-gray-300 hover:bg-white/20"
                      }`}
                    >
                      {status.replace("_", " ")}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>

      <FloatingButton onClick={() => setShowForm(true)} />
    </div>
  );
}
