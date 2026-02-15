"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  if (!user) return null;

  /* ============================
     LOGOUT
  =============================*/
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  /* ============================
     SHARE
  =============================*/
  const handleShare = async () => {
    const shareData = {
      title: "My Hyppocampe",
      text: "Découvre mon cerveau externe 🧠",
      url: window.location.origin,
    };

    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(window.location.origin);
      alert("Lien copié !");
    }
  };

  /* ============================
     EXPORT
  =============================*/
  const handleExport = async () => {
    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", user.id);

    const { data: sections } = await supabase
      .from("memory_sections")
      .select("*")
      .eq("user_id", user.id);

    const { data: items } = await supabase
      .from("memory_items")
      .select("*")
      .eq("user_id", user.id);

    const exportData = {
      user,
      tasks,
      memory: {
        sections,
        items,
      },
    };

    const blob = new Blob(
      [JSON.stringify(exportData, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-hyppocampe-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ============================
     DELETE ACCOUNT – LEVEL 2
  =============================*/
  const confirmDeleteAccount = async () => {
    if (deleteInput !== "SUPPRIMER") return;

    setIsDeleting(true);

    await fetch("/api/delete-account", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId: user.id,
      }),
    });

    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <div className="text-blue-950 max-w-3xl mx-auto space-y-10 pb-20">

      <h1 className="text-2xl font-semibold">
        Paramètres
      </h1>

      {/* ============================
          COMPTE
      =============================*/}
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-lg">Compte</h2>

        <div className="text-sm space-y-1">
          <p><strong>Email :</strong> {user.email}</p>
          <p className="text-gray-500 text-xs">
            ID : {user.id}
          </p>
        </div>

        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-black text-white rounded-xl text-sm"
        >
          Se déconnecter
        </button>
      </div>

      {/* ============================
          PARTAGER
      =============================*/}
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-lg">
          Partager l'application
        </h2>

        <button
          onClick={handleShare}
          className="px-4 py-2 bg-black text-white rounded-xl text-sm"
        >
          Partager
        </button>
      </div>

      {/* ============================
          ACCÈS RAPIDE
      =============================*/}
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-lg">
          Accès rapide
        </h2>

        <div className="flex gap-4 flex-wrap">
          <button
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 bg-gray-200 rounded-xl text-sm"
          >
            Tableau de bord
          </button>

          <button
            onClick={() => router.push("/dashboard/tasks")}
            className="px-4 py-2 bg-gray-200 rounded-xl text-sm"
          >
            Tâches
          </button>

          <button
            onClick={() => router.push("/dashboard/memoire")}
            className="px-4 py-2 bg-gray-200 rounded-xl text-sm"
          >
            Mémoire
          </button>
        </div>
      </div>

      {/* ============================
          DONNÉES
      =============================*/}
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-lg">
          Données
        </h2>

        <div className="flex gap-4 flex-wrap">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-gray-200 rounded-xl text-sm"
          >
            Exporter mes données
          </button>

          <button
            onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm"
          >
            Supprimer mon compte
          </button>
        </div>
      </div>

      {/* ============================
          DELETE MODAL
      =============================*/}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-xl p-8 space-y-6 text-blue-950">

            <h2 className="text-lg font-semibold">
              Suppression du compte
            </h2>

            <p className="text-sm text-gray-600">
              Cette action est irréversible.  
              Tape <strong>SUPPRIMER</strong> pour confirmer.
            </p>

            <input
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-xl"
              placeholder="SUPPRIMER"
            />

            <div className="flex justify-end gap-4 pt-4">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteInput("");
                }}
                className="px-4 py-2 text-gray-600"
              >
                Annuler
              </button>

              <button
                onClick={confirmDeleteAccount}
                disabled={deleteInput !== "SUPPRIMER" || isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-xl disabled:opacity-50"
              >
                {isDeleting ? "Suppression..." : "Confirmer"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* VERSION */}
      <div className="text-center text-xs text-gray-400 pt-10">
        My Hyppocampe<br />
        Version 2.0<br />
        Built by Fred 🧠
      </div>

    </div>
  );
}
