"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { getAuthHeaders } from "@/lib/auth/clientSession";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import EmailSettingsForm from "@/components/settings/EmailSettingsForm";
import { useI18n } from "@/components/providers/LanguageProvider";
import { FULL_ACCESS_USER_IDS } from "@/lib/subscription/accessControl";
import {
  DASHBOARD_MODULES,
  loadEnabledDashboardModules,
  saveEnabledDashboardModules,
  type DashboardModuleId,
} from "@/lib/modules/dashboardModules";

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

type MemoryActionsSettingsResponse = {
  canEdit: boolean;
  primaryActions: Record<string, string>;
  mappings: Record<string, string[]>;
  defaults: Record<string, string[]>;
  labels: Record<string, string>;
  catalog: Record<string, { id: string; label: string; description: string }>;
};

export default function SettingsPage() {
  const { t, language, setLanguage } = useI18n();
  const user = useAuthStore((s) => s.user);
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"loading" | "success" | "error" | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<AiUsageStats | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(false);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [memoryActionsConfig, setMemoryActionsConfig] = useState<MemoryActionsSettingsResponse | null>(null);
  const [memoryActionsDraft, setMemoryActionsDraft] = useState<Record<string, string>>({});
  const [memoryActionsStatus, setMemoryActionsStatus] = useState<string | null>(null);
  const [loadingMemoryActions, setLoadingMemoryActions] = useState(false);
  const [enabledModules, setEnabledModules] = useState<DashboardModuleId[]>([]);

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
          setBillingMessage(t("settings.loadError"));
        }
      } catch (error) {
        console.error("loadAiSettings error", error);
        setBillingMessage(t("settings.loadAiError"));
      } finally {
        setLoadingBilling(false);
      }
    };

    loadAiSettings();
  }, [user, t]);

  useEffect(() => {
    if (!user || !FULL_ACCESS_USER_IDS.has(user.id)) {
      setMemoryActionsConfig(null);
      return;
    }

    const loadMemoryActions = async () => {
      setLoadingMemoryActions(true);
      setMemoryActionsStatus(null);
      try {
        const response = await fetch('/api/settings/memory-actions', {
          headers: await getAuthHeaders(false),
        });
        const json = (await response.json()) as MemoryActionsSettingsResponse & { error?: string };

        if (!response.ok) {
          setMemoryActionsStatus(json.error || 'Erreur chargement mappings memoire');
          return;
        }

        setMemoryActionsConfig(json);
        setMemoryActionsDraft(json.primaryActions || {});
      } catch {
        setMemoryActionsStatus('Erreur reseau mappings memoire');
      } finally {
        setLoadingMemoryActions(false);
      }
    };

    loadMemoryActions();
  }, [user]);

  useEffect(() => {
    setEnabledModules(loadEnabledDashboardModules());
  }, []);

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
    setUploadStatus("loading");

    try {
      const filePath = `${user.id}/avatar.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        setUploadStatus("error");
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
        setUploadStatus("error");
        return;
      }

      setProfile((prev) => ({
        username: prev?.username ?? null,
        avatar_url: data.publicUrl,
      }));

      setPreviewAvatar(data.publicUrl);
      setUploadStatus("success");
    } catch (err) {
      console.error(err);
      setUploadStatus("error");
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
      alert("Lien copie !");
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
        setBillingMessage(json?.error || t("settings.subscriptionUpdateError"));
        return;
      }

      setSubscription(json.subscription || null);
      setBillingMessage(t("settings.subscriptionUpdated"));
    } catch (error) {
      console.error(error);
      setBillingMessage(t("settings.networkError"));
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

  const saveMemoryActions = async () => {
    if (!memoryActionsConfig) return;

    setMemoryActionsStatus(null);
    try {
      const response = await fetch('/api/settings/memory-actions', {
        method: 'PUT',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ primaryActions: memoryActionsDraft }),
      });
      const json = await response.json();
      if (!response.ok) {
        setMemoryActionsStatus(json?.error || 'Erreur sauvegarde mappings');
        return;
      }

      const merged = {
        ...memoryActionsConfig,
        primaryActions: json.primaryActions || memoryActionsDraft,
        mappings: json.mappings || memoryActionsConfig.mappings,
      };
      setMemoryActionsConfig(merged);
      setMemoryActionsDraft(merged.primaryActions || {});
      setMemoryActionsStatus('Mappings memoire sauvegardes');
    } catch {
      setMemoryActionsStatus('Erreur reseau sauvegarde mappings');
    }
  };

  const toggleDashboardModule = (moduleId: DashboardModuleId) => {
    setEnabledModules((prev) => {
      const hasModule = prev.includes(moduleId);
      const next = hasModule ? prev.filter((id) => id !== moduleId) : [...prev, moduleId];
      const safeNext = next.length > 0 ? next : [moduleId];
      saveEnabledDashboardModules(safeNext);
      return safeNext;
    });
  };

  return (
    <div className="text-blue-950 max-w-3xl mx-auto space-y-10 pb-20">

      <h1 className="text-2xl font-semibold">
        {t("settings.title")}
      </h1>

      {/* COMPTE */}
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">

        <h2 className="font-semibold text-lg">{t("settings.account")}</h2>

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
              {t("settings.change")}
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleAvatarChange}
            className="hidden"
          />

          <div className="text-sm space-y-1">
            <p><strong>{t("settings.username")} :</strong> {profile?.username}</p>
            <p><strong>{t("settings.email")} :</strong> {user.email}</p>
            <p className="text-gray-500 text-xs">
              ID : {user.id}
            </p>

            {uploadStatus && (
              <p className={`text-xs mt-2 ${
                uploadStatus === "success"
                  ? "text-green-600"
                  : uploadStatus === "error"
                  ? "text-red-600"
                  : "text-gray-500"
              }`}>
                {uploadStatus === "loading"
                  ? t("common.loading")
                  : uploadStatus === "success"
                  ? t("settings.subscriptionUpdated")
                  : t("settings.subscriptionUpdateError")}
              </p>
            )}
          </div>

        </div>

        <div className="flex gap-4 flex-wrap">
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-black text-white rounded-xl text-sm"
          >
            {t("settings.logout")}
          </button>

          <button
            onClick={handleSignOutAll}
            className="px-4 py-2 bg-blue-950 text-white rounded-xl text-sm"
          >
            {t("settings.logoutAll")}
          </button>
        </div>

      </div>


      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-lg">{t("language.title")}</h2>
        <p className="text-sm text-gray-600">{t("language.description")}</p>
        <div className="flex flex-wrap gap-2">
          {(["fr", "en", "es"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`px-4 py-2 rounded-lg text-sm ${
                language === lang ? "bg-blue-900 text-white" : "bg-gray-100 text-gray-800"
              }`}
            >
              {t(`language.${lang}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-lg">Modules dashboard</h2>
        <p className="text-sm text-gray-600">
          Activez les modules visibles sur la page d accueil.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {DASHBOARD_MODULES.map((module) => (
            <label
              key={module.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <span>
                {module.icon} {module.title}
              </span>
              <input
                type="checkbox"
                checked={enabledModules.includes(module.id)}
                onChange={() => toggleDashboardModule(module.id)}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-lg">{t('settings.memoryZone.title')}</h2>
        <p className="text-sm text-gray-600">
          {t('settings.memoryZone.subtitleSettingsCard')}
        </p>
        <button
          onClick={() => router.push('/dashboard/settings/memory')}
          className="px-4 py-2 bg-blue-900 text-white rounded-xl text-sm"
        >
          {t('settings.memoryZone.addFieldCta')}
        </button>
      </div>

      {FULL_ACCESS_USER_IDS.has(user.id) && (
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-lg">Memory action mappings (admin)</h2>
          <p className="text-sm text-gray-600">
            Definissez l action prioritaire proposee pour chaque type detecte apres un scan.
          </p>

          {loadingMemoryActions && (
            <p className="text-sm text-gray-500">Chargement...</p>
          )}

          {!loadingMemoryActions && memoryActionsConfig && (
            <div className="space-y-3">
              {Object.entries(memoryActionsConfig.labels || {}).map(([detectedType, label]) => {
                const options = Array.from(
                  new Set([
                    ...(memoryActionsConfig.defaults?.[detectedType] || []),
                    ...(memoryActionsConfig.mappings?.[detectedType] || []),
                  ])
                );

                return (
                  <div key={detectedType} className="grid gap-2 md:grid-cols-2 md:items-center">
                    <label className="text-sm font-medium text-gray-700">{label}</label>
                    <select
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      value={memoryActionsDraft[detectedType] || options[0] || ''}
                      onChange={(e) =>
                        setMemoryActionsDraft((prev) => ({
                          ...prev,
                          [detectedType]: e.target.value,
                        }))
                      }
                    >
                      {options.map((actionId) => (
                        <option key={actionId} value={actionId}>
                          {memoryActionsConfig.catalog?.[actionId]?.label || actionId}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}

              <button
                onClick={saveMemoryActions}
                className="px-4 py-2 rounded-lg bg-blue-900 text-white text-sm"
              >
                Sauvegarder mappings
              </button>
            </div>
          )}

          {memoryActionsStatus && (
            <p className="text-xs text-gray-600">{memoryActionsStatus}</p>
          )}
        </div>
      )}

      {/* EMAILS */}
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
        <EmailSettingsForm />
      </div>

      {/* IA + ABONNEMENT */}
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
        <h2 className="font-semibold text-lg">{t("settings.aiSection")}</h2>

        {loadingBilling ? (
          <p className="text-sm text-gray-500">{t("settings.loadingAi")}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">{t("settings.totalUsage")}</p>
                <p className="text-lg font-semibold">{usage?.totals.tokens || 0} {t("settings.aiTokens")}</p>
                <p className="text-sm text-gray-600">~ {Number(usage?.totals.costEstimate || 0).toFixed(4)} EUR</p>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-500">{t("settings.thisMonth")}</p>
                <p className="text-lg font-semibold">{usage?.thisMonth.tokens || 0} {t("settings.aiTokens")}</p>
                <p className="text-sm text-gray-600">~ {Number(usage?.thisMonth.costEstimate || 0).toFixed(4)} EUR</p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 space-y-3">
              <p className="text-sm font-semibold">{t("settings.activePlan")}</p>

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
                {t("settings.monthlyPrice")}: {Number(subscription?.price || 0).toFixed(2)} EUR
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
          {t("settings.shareApp")}
        </h2>

        <button
          onClick={handleShare}
          className="px-4 py-2 bg-black text-white rounded-xl text-sm"
        >
          {t("common.share")}
        </button>
      </div>

      {/* ACCÈS RAPIDE */}
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-lg">
          {t("settings.quickAccess")}
        </h2>

        <div className="flex gap-4 flex-wrap">

                  <button
                    onClick={() => router.push("/dashboard")}
                    className="px-4 py-2 bg-gray-200 rounded-xl text-sm"
                  >
                    {t("settings.dashboard")}
                  </button>

                  <button
                    onClick={() => router.push("/dashboard/tasks")}
                    className="px-4 py-2 bg-gray-200 rounded-xl text-sm"
                  >
                    {t("settings.tasks")}
                  </button>

                  <button
                    onClick={() => router.push("/dashboard/memoire")}
                    className="px-4 py-2 bg-gray-200 rounded-xl text-sm"
                  >
                    {t("settings.memory")}
                  </button>

                  <button
                    onClick={() => router.push('/dashboard/settings/memory')}
                    className="px-4 py-2 bg-blue-100 text-blue-900 rounded-xl text-sm"
                  >
                    {t('settings.memoryZone.title')}
                  </button>

                  {/* 🔔 NOUVEAU */}
                  <button
                    onClick={() =>
                      router.push("/dashboard/settings/notifications")
                    }
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700 transition"
                  >
                    🔔 {t("settings.notifications")}
                  </button>

        </div>

      </div>

      {/* DONNÉES */}
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-lg">
          {t("settings.data")}
        </h2>

        <div className="flex gap-4 flex-wrap">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-gray-200 rounded-xl text-sm"
          >
            {t("settings.export")}
          </button>

          <button
            onClick={() => setShowDeleteModal(true)}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm"
          >
            {t("settings.deleteAccount")}
          </button>
        </div>
      </div>

      {/* VERSION */}
      <div className="text-center text-xs text-gray-400 pt-10">
        My Hyppocampe<br />
        Version 2.4<br />
        {t("settings.versionBuiltBy")}
      </div>

    </div>
  );
}
