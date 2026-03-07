"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { getAuthHeaders } from "@/lib/auth/clientSession";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import EmailSettingsForm from "@/components/settings/EmailSettingsForm";

type PlanName = "BASIC" | "PLUS" | "PRO";

type PlanFeatures = {
  tasks: boolean;
  emails: boolean;
  memory: boolean;
  ai: boolean;
  vision: boolean;
  agent: boolean;
};

type Subscription = {
  plan: PlanName;
  price: number;
  features: PlanFeatures;
};

type Profile = {
  username: string | null;
  avatar_url: string | null;
};

type AiUsageStats = {
  totals: {
    tokens: number;
    costEstimate: number;
  };
  thisMonth: {
    tokens: number;
    costEstimate: number;
  };
};

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<AiUsageStats | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);

  /* ============================
     FETCH PROFILE SAFE
  =============================*/
  useEffect(() => {
    if (!user) return;

    const fetchOrCreateProfile = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error && error.code === "PGRST116") {
        // Pas de profil → on le crée
        const { data: newProfile } = await supabase
          .from("profiles")
          .insert({
            id: user.id,
            username: user.email?.split("@")[0],
            avatar_url: null,
          })
          .select()
          .single();

        setProfile(newProfile);
        return;
      }

      if (error) {
        console.error("Profile fetch error:", error);
        return;
      }

      if (data) {
        setProfile(data);
        if (data.avatar_url) {
          setPreviewAvatar(data.avatar_url);
        }
      }
    };

    fetchOrCreateProfile();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const loadAiSettings = async () => {
      setLoadingBilling(true);
      setBillingMessage(null);

      try {
        const [subscriptionRes, usageRes] = await Promise.all([
          fetch("/api/settings/subscription", {
            headers: await getAuthHeaders(false),
          }),
          fetch("/api/settings/ai-usage", {
            headers: await getAuthHeaders(false),
          }),
        ]);

        const subscriptionJson = await subscriptionRes.json();
        const usageJson = await usageRes.json();

        if (subscriptionRes.ok) {
          setSubscription(subscriptionJson.subscription || null);
        }

        if (usageRes.ok) {
          setUsage(usageJson as AiUsageStats);
        }

        if (!subscriptionRes.ok || !usageRes.ok) {
          setBillingMessage("Impossible de charger toutes les donnees IA");
        }
      } catch (error) {
        console.error("loadAiSettings error", error);
        setBillingMessage("Erreur chargement IA/abonnement");
      } finally {
        setLoadingBilling(false);
      }
    };

    loadAiSettings();
  }, [user]);

  if (!user) return null;

  /* ============================
     AVATAR UPLOAD
  =============================*/
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!e.target.files?.[0]) return;

    const file = e.target.files[0];
    const localPreview = URL.createObjectURL(file);

    setPreviewAvatar(localPreview);
    setUploadStatus("Chargement...");

    try {
      const filePath = `${user.id}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        setUploadStatus("Chargement NOK");
        return;
      }

      const { data } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: data.publicUrl })
        .eq("id", user.id);

      if (updateError) {
        console.error("Profile update error:", updateError);
        setUploadStatus("Chargement NOK");
        return;
      }

      setProfile((prev) => ({
        ...prev,
        avatar_url: data.publicUrl,
      }));

      setPreviewAvatar(data.publicUrl);
      setUploadStatus("Chargement OK");
    } catch (err) {
      console.error(err);
      setUploadStatus("Chargement NOK");
    }
  };

  /* ============================
     LOGOUT
  =============================*/
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const handleSignOutAll = async () => {
    await supabase.auth.signOut({ scope: "global" });
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
      profile,
      tasks,
      memory: { sections, items },
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

  const confirmDeleteAccount = async () => {
    if (deleteInput !== "SUPPRIMER") return;

    setIsDeleting(true);

    await fetch("/api/delete-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });

    await supabase.auth.signOut();
    router.push("/");
  };

  const updateSubscription = async (payload: Partial<Subscription> & { features?: Partial<PlanFeatures> }) => {
    setBillingMessage(null);
    try {
      const response = await fetch("/api/settings/subscription", {
        method: "PUT",
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      const json = await response.json();
      if (!response.ok) {
        setBillingMessage(json?.error || "Erreur mise a jour abonnement");
        return;
      }

      setSubscription(json.subscription || null);
      setBillingMessage("Abonnement mis a jour");
    } catch (error) {
      console.error(error);
      setBillingMessage("Erreur reseau abonnement");
    }
  };

  const handlePlanChange = async (nextPlan: PlanName) => {
    await updateSubscription({ plan: nextPlan });
  };

  const handleFeatureToggle = async (featureKey: keyof PlanFeatures, value: boolean) => {
    await updateSubscription({
      features: {
        ...(subscription?.features || {
          tasks: true,
          emails: false,
          memory: false,
          ai: false,
          vision: false,
          agent: false,
        }),
        [featureKey]: value,
      },
    });
  };

  return (
    <div className="text-blue-950 max-w-3xl mx-auto space-y-10 pb-20">

      <h1 className="text-2xl font-semibold">
        Paramètres
      </h1>

      {/* COMPTE */}
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">

        <h2 className="font-semibold text-lg">Compte</h2>

        <div className="flex items-center gap-6">

          <div
            onClick={handleAvatarClick}
            className="relative w-24 h-24 rounded-full overflow-hidden bg-gray-200 cursor-pointer group"
          >
            {previewAvatar && (
              <img
                src={previewAvatar}
                className="w-full h-full object-cover"
              />
            )}

            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white text-xs">
              Changer
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleAvatarChange}
            className="hidden"
          />

          <div className="text-sm space-y-1">
            <p><strong>Pseudo :</strong> {profile?.username}</p>
            <p><strong>Email :</strong> {user.email}</p>
            <p className="text-gray-500 text-xs">
              ID : {user.id}
            </p>

            {uploadStatus && (
              <p className={`text-xs mt-2 ${
                uploadStatus.includes("OK")
                  ? "text-green-600"
                  : uploadStatus.includes("NOK")
                  ? "text-red-600"
                  : "text-gray-500"
              }`}>
                {uploadStatus}
              </p>
            )}
          </div>

        </div>

        <div className="flex gap-4 flex-wrap">
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-black text-white rounded-xl text-sm"
          >
            Se déconnecter
          </button>

          <button
            onClick={handleSignOutAll}
            className="px-4 py-2 bg-blue-950 text-white rounded-xl text-sm"
          >
            Déconnexion tous les appareils
          </button>
        </div>

      </div>


      {/* EMAILS */}
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
        <EmailSettingsForm />
      </div>

      {/* IA + ABONNEMENT */}
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
        <h2 className="font-semibold text-lg">IA, modules et abonnement</h2>

        {loadingBilling ? (
          <p className="text-sm text-gray-500">Chargement des donnees IA...</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">Consommation totale</p>
                <p className="text-lg font-semibold">{usage?.totals.tokens || 0} tokens</p>
                <p className="text-sm text-gray-600">~ {Number(usage?.totals.costEstimate || 0).toFixed(4)} EUR</p>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">Ce mois-ci</p>
                <p className="text-lg font-semibold">{usage?.thisMonth.tokens || 0} tokens</p>
                <p className="text-sm text-gray-600">~ {Number(usage?.thisMonth.costEstimate || 0).toFixed(4)} EUR</p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold">Plan actif</p>

              <div className="flex flex-wrap gap-2">
                {(["BASIC", "PLUS", "PRO"] as PlanName[]).map((plan) => (
                  <button
                    key={plan}
                    onClick={() => handlePlanChange(plan)}
                    className={`px-3 py-2 rounded-lg text-sm ${
                      subscription?.plan === plan
                        ? "bg-blue-900 text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {plan}
                  </button>
                ))}
              </div>

              <p className="text-xs text-gray-600">
                Prix mensuel: {Number(subscription?.price || 0).toFixed(2)} EUR
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                {(Object.entries(subscription?.features || {}) as Array<[keyof PlanFeatures, boolean]>).map(([key, value]) => (
                  <label key={key} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    <span>{key}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(e) => handleFeatureToggle(key, e.target.checked)}
                    />
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {billingMessage && (
          <p className="text-xs text-gray-600">{billingMessage}</p>
        )}
      </div>

      {/* PARTAGER */}
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-lg">
          Partager l&apos;application
        </h2>

        <button
          onClick={handleShare}
          className="px-4 py-2 bg-black text-white rounded-xl text-sm"
        >
          Partager
        </button>
      </div>

      {/* ACCÈS RAPIDE */}
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

                  {/* 🔔 NOUVEAU */}
                  <button
                    onClick={() =>
                      router.push("/dashboard/settings/notifications")
                    }
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700 transition"
                  >
                    🔔 Notifications
                  </button>

        </div>

      </div>

      {/* DONNÉES */}
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

      {/* VERSION */}
      <div className="text-center text-xs text-gray-400 pt-10">
        My Hyppocampe<br />
        Version 2.4<br />
        Built by Fred 🧠
      </div>

    </div>
  );
}
