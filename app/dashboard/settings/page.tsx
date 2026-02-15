"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  const [isDeleting, setIsDeleting] = useState(false);

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
     EXPORT DATA
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
     DELETE ACCOUNT
  =============================*/
const handleDeleteAccount = async () => {
  const confirmDelete = confirm(
    "Supprimer définitivement ton compte ?"
  );
  if (!confirmDelete) return;

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

      {/* TITLE */}
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
            onClick={handleDeleteAccount}
            disabled={isDeleting}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm disabled:opacity-50"
          >
            {isDeleting ? "Suppression..." : "Supprimer mon compte"}
          </button>

        </div>
      </div>

      {/* ============================
          VERSION
      =============================*/}
      <div className="text-center text-xs text-gray-400 pt-10">
        My Hyppocampe<br />
        Version 2.0<br />
        Built by Fred 🧠
      </div>

    </div>
  );
}
