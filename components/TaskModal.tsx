"use client";

import { useState } from "react";
import { useTaskStore } from "@/store/taskStore";

export default function TaskModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { addTask, activeType } = useTaskStore();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!title.trim()) return;
    
    setIsLoading(true);
    try {
      const dateObject = deadline ? new Date(deadline) : null;
      await addTask(title, activeType, dateObject, description);
      setTitle("");
      setDescription("");
      setDeadline("");
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 sm:p-0">
      <div className="bg-gradient-to-b from-slate-800 to-slate-900 p-8 rounded-3xl w-full sm:max-w-md border border-white/10 shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95">

        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Nouvelle tâche</h2>
          <p className="text-sm text-gray-400">
            Catégorie: <span className="font-semibold text-indigo-400">{activeType.toUpperCase()}</span>
          </p>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="text-sm font-medium text-gray-300 block mb-2">
              Titre de la tâche
            </label>
            <input
              type="text"
              placeholder="Ex: Finir le rapport..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white placeholder-gray-500 transition"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-300 block mb-2">
              Description (optionnel)
            </label>
            <textarea
              placeholder="Ex: Détails, contacts (+33 6 12 34 56 78), emails..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white placeholder-gray-500 transition resize-none h-24"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-300 block mb-2">
              Deadline (optionnel)
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-white transition"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-6 py-2.5 text-gray-400 hover:text-gray-300 font-medium transition disabled:opacity-50"
          >
            Annuler
          </button>

          <button
            onClick={handleSubmit}
            disabled={!title.trim() || isLoading}
            className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/30"
          >
            {isLoading ? "Création..." : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}
