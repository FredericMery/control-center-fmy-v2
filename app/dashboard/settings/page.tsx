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

type EmailReplyScope = 'to_only' | 'all' | 'none';

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
  const [assistantName, setAssistantName] = useState('Assistant');
  const [assistantNameDraft, setAssistantNameDraft] = useState('Assistant');
  const [assistantNameStatus, setAssistantNameStatus] = useState<string | null>(null);
  const [emailReplyScope, setEmailReplyScope] = useState<EmailReplyScope>('to_only');
  const [emailGlobalInstructionsDraft, setEmailGlobalInstructionsDraft] = useState('');
  const [emailDoRulesDraft, setEmailDoRulesDraft] = useState('');
  const [emailDontRulesDraft, setEmailDontRulesDraft] = useState('');
  const [emailSignatureDraft, setEmailSignatureDraft] = useState('');
  const [emailAiRulesStatus, setEmailAiRulesStatus] = useState<string | null>(null);
  const [learningEmailRules, setLearningEmailRules] = useState(false);
  const [emailLearningStatus, setEmailLearningStatus] = useState<string | null>(null);
  const [professionalEmailDraft, setProfessionalEmailDraft] = useState('');
  const [professionalEmailStatus, setProfessionalEmailStatus] = useState<string | null>(null);

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

  useEffect(() => {
    if (!user) return;

    const loadAssistantSettings = async () => {
      const { data, error } = await supabase
        .from('user_ai_settings')
        .select('assistant_name,email_reply_scope,email_global_instructions,email_do_rules,email_dont_rules,email_signature')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('assistant settings load error', error);
        return;
      }

      const name = String(data?.assistant_name || 'Assistant').trim();
      setAssistantName(name || 'Assistant');
      setAssistantNameDraft(name || 'Assistant');

      const scopeRaw = String(data?.email_reply_scope || 'to_only');
      const scope: EmailReplyScope = scopeRaw === 'all' || scopeRaw === 'none' ? scopeRaw : 'to_only';
      setEmailReplyScope(scope);
      setEmailGlobalInstructionsDraft(String(data?.email_global_instructions || ''));
      setEmailDoRulesDraft(Array.isArray(data?.email_do_rules) ? data.email_do_rules.join('\n') : '');
      setEmailDontRulesDraft(Array.isArray(data?.email_dont_rules) ? data.email_dont_rules.join('\n') : '');
      setEmailSignatureDraft(String(data?.email_signature || ''));
    };

    loadAssistantSettings();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const loadProfessionalEmail = async () => {
      try {
        const response = await fetch('/api/calendar/preferences', {
          headers: await getAuthHeaders(false),
        });
        const json = await response.json();
        if (!response.ok) {
          return;
        }

        const value = String(json?.preferences?.professional_email || '').trim();
        setProfessionalEmailDraft(value);
      } catch {
        // Silent fail to avoid blocking settings page
      }
    };

    loadProfessionalEmail();
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

  const saveAssistantName = async () => {
    if (!user) return;

    const name = assistantNameDraft.trim() || 'Assistant';
    setAssistantNameStatus(null);

    const { error } = await supabase
      .from('user_ai_settings')
      .upsert({
        user_id: user.id,
        assistant_name: name,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      setAssistantNameStatus('Erreur sauvegarde nom IA');
      return;
    }

    setAssistantName(name);
    setAssistantNameDraft(name);
    setAssistantNameStatus('Nom IA sauvegarde');
  };

  const saveEmailAiRules = async () => {
    if (!user) return;

    setEmailAiRulesStatus(null);

    const doRules = emailDoRulesDraft
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 30)
      .map((entry) => entry.slice(0, 200));

    const dontRules = emailDontRulesDraft
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, 30)
      .map((entry) => entry.slice(0, 200));

    const dedupe = (values: string[]) => Array.from(new Map(values.map((value) => [value.toLowerCase(), value])).values());

    const { error } = await supabase
      .from('user_ai_settings')
      .upsert({
        user_id: user.id,
        email_reply_scope: emailReplyScope,
        email_global_instructions: emailGlobalInstructionsDraft.trim().slice(0, 5000),
        email_do_rules: dedupe(doRules),
        email_dont_rules: dedupe(dontRules),
        email_signature: emailSignatureDraft.trim().slice(0, 1000),
        updated_at: new Date().toISOString(),
      });

    if (error) {
      setEmailAiRulesStatus('Erreur sauvegarde regles IA email');
      return;
    }

    setEmailAiRulesStatus('Regles IA email sauvegardees');
  };

  const learnEmailAiRulesFromCorrections = async () => {
    if (!user) return;

    setLearningEmailRules(true);
    setEmailLearningStatus(null);

    try {
      const response = await fetch('/api/settings/email-ai-rules/learn', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ apply: true, maxSamples: 60 }),
      });

      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
        summary?: string;
        editedSamples?: number;
        suggested?: { doRules?: string[]; dontRules?: string[] };
        merged?: { doRules?: string[]; dontRules?: string[] };
      };

      if (!response.ok) {
        setEmailLearningStatus(json.error || 'Erreur apprentissage IA email');
        return;
      }

      const mergedDo = Array.isArray(json.merged?.doRules) ? json.merged?.doRules : [];
      const mergedDont = Array.isArray(json.merged?.dontRules) ? json.merged?.dontRules : [];
      setEmailDoRulesDraft((mergedDo || []).join('\n'));
      setEmailDontRulesDraft((mergedDont || []).join('\n'));

      const edited = Number(json.editedSamples || 0);
      const doCount = Array.isArray(json.suggested?.doRules) ? json.suggested?.doRules.length : 0;
      const dontCount = Array.isArray(json.suggested?.dontRules) ? json.suggested?.dontRules.length : 0;

      setEmailLearningStatus(
        `${json.summary || 'Apprentissage termine.'} Echantillons corriges: ${edited}. Regles ajoutees: ${doCount} do / ${dontCount} dont.`
      );
    } catch {
      setEmailLearningStatus('Erreur reseau apprentissage IA email');
    } finally {
      setLearningEmailRules(false);
    }
  };

  const saveProfessionalEmail = async () => {
    if (!user) return;

    const value = professionalEmailDraft.trim().toLowerCase();
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setProfessionalEmailStatus('Adresse email professionnelle invalide');
      return;
    }

    const { error } = await supabase
      .from('scheduling_preferences')
      .upsert({
        user_id: user.id,
        professional_email: value || null,
      }, { onConflict: 'user_id' });

    if (error) {
      setProfessionalEmailStatus('Erreur sauvegarde adresse email pro');
      return;
    }

    setProfessionalEmailDraft(value);
    setProfessionalEmailStatus('Adresse email professionnelle sauvegardee');
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-3 pb-20 text-slate-100 sm:space-y-6 sm:px-0">
      <section className="rounded-3xl border border-cyan-200/10 bg-gradient-to-r from-slate-900/80 via-slate-900/75 to-cyan-950/60 p-4 sm:p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">Control</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">{t("settings.title")}</h1>
        <p className="mt-2 text-sm text-slate-300">Configure ton environnement, les modules visibles et les automatismes memoire.</p>
      </section>

      {/* COMPTE */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4 shadow-xl shadow-slate-950/40 backdrop-blur space-y-6 sm:p-6">

        <h2 className="text-lg font-semibold text-white">{t("settings.account")}</h2>

        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">

          <div
            onClick={handleAvatarClick}
            className="group relative h-24 w-24 cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-slate-800"
          >
            {previewAvatar && (
              <img
                src={previewAvatar}
                className="w-full h-full object-cover"
              />
            )}

            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs text-white opacity-0 transition group-hover:opacity-100">
              {t("settings.change")}
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleAvatarChange}
            className="hidden"
          />

          <div className="space-y-1 text-sm text-slate-200">
            <p><strong>{t("settings.username")} :</strong> {profile?.username}</p>
            <p><strong>{t("settings.email")} :</strong> {user.email}</p>
            <p className="text-xs text-slate-400">
              ID : {user.id}
            </p>

            {uploadStatus && (
              <p className={`text-xs mt-2 ${
                uploadStatus === "success"
                  ? "text-green-600"
                  : uploadStatus === "error"
                  ? "text-red-600"
                    : "text-slate-400"
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

        <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
          <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
            Mon adresse mail pro
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={professionalEmailDraft}
              onChange={(event) => setProfessionalEmailDraft(event.target.value)}
              placeholder="prenom.nom@entreprise.com"
              className="min-h-11 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-300"
            />
            <button
              type="button"
              onClick={saveProfessionalEmail}
              className="min-h-11 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              {t('common.save')}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Adresse utilisee pour les flux professionnels (agenda, transferts, routage email pro).
          </p>
          {professionalEmailStatus && <p className="mt-1 text-xs text-emerald-300">{professionalEmailStatus}</p>}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          <button
            onClick={handleLogout}
            className="min-h-11 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900"
          >
            {t("settings.logout")}
          </button>

          <button
            onClick={handleSignOutAll}
            className="min-h-11 rounded-xl border border-cyan-300/30 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-100"
          >
            {t("settings.logoutAll")}
          </button>
        </div>

      </div>


      <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4 shadow-xl shadow-slate-950/40 backdrop-blur space-y-4 sm:p-6">
        <h2 className="text-lg font-semibold text-white">{t("language.title")}</h2>
        <p className="text-sm text-slate-300">{t("language.description")}</p>
        <div className="flex flex-wrap gap-2">
          {(["fr", "en", "es"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              className={`min-h-10 rounded-lg px-4 py-2 text-sm font-medium ${
                language === lang ? "bg-cyan-400 text-slate-950" : "border border-white/10 bg-slate-800 text-slate-200"
              }`}
            >
              {t(`language.${lang}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4 shadow-xl shadow-slate-950/40 backdrop-blur space-y-4 sm:p-6">
        <h2 className="text-lg font-semibold text-white">{t('settings.myAi.title')}</h2>
        <p className="text-sm text-slate-300">{t('settings.myAi.subtitle')}</p>

        <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
          <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
            {t('settings.myAi.nameLabel')}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={assistantNameDraft}
              onChange={(event) => setAssistantNameDraft(event.target.value)}
              placeholder="Assistant"
              className="min-h-11 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-300"
            />
            <button
              type="button"
              onClick={saveAssistantName}
              className="min-h-11 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              {t('common.save')}
            </button>
          </div>

          <p className="mt-2 text-xs text-slate-300">
            {t('settings.myAi.currentName')}: <span className="font-semibold text-cyan-100">{assistantName}</span>
          </p>
          {assistantNameStatus && <p className="mt-1 text-xs text-emerald-300">{assistantNameStatus}</p>}
        </div>

        <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3 space-y-3">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
              Reponses IA automatiques
            </label>
            <select
              value={emailReplyScope}
              onChange={(event) => setEmailReplyScope(event.target.value as EmailReplyScope)}
              className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-300"
            >
              <option value="to_only">Uniquement si je suis en A</option>
              <option value="all">Si je suis en A ou CC</option>
              <option value="none">Desactive (jamais de brouillon auto)</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
              Instruction globale
            </label>
            <textarea
              value={emailGlobalInstructionsDraft}
              onChange={(event) => setEmailGlobalInstructionsDraft(event.target.value)}
              rows={3}
              placeholder="Ex: Priorise les actions concretes, style court, ton professionnel"
              className="w-full resize-y rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
                Regles a appliquer (1/ligne)
              </label>
              <textarea
                value={emailDoRulesDraft}
                onChange={(event) => setEmailDoRulesDraft(event.target.value)}
                rows={4}
                placeholder="Ex: Toujours proposer une date\nEx: Commencer par Bonjour"
                className="w-full resize-y rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
                Regles a eviter (1/ligne)
              </label>
              <textarea
                value={emailDontRulesDraft}
                onChange={(event) => setEmailDontRulesDraft(event.target.value)}
                rows={4}
                placeholder="Ex: Eviter les longs paragraphes\nEx: Pas de formulation trop informelle"
                className="w-full resize-y rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">
              Signature email
            </label>
            <input
              value={emailSignatureDraft}
              onChange={(event) => setEmailSignatureDraft(event.target.value)}
              placeholder="Ex: Bien cordialement, Frederic"
              className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-300"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={saveEmailAiRules}
              className="min-h-11 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              Sauvegarder regles IA email
            </button>
            <button
              type="button"
              onClick={learnEmailAiRulesFromCorrections}
              disabled={learningEmailRules}
              className="min-h-11 rounded-xl border border-cyan-300/35 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-50"
            >
              {learningEmailRules ? 'Apprentissage en cours...' : 'Apprendre depuis mes corrections'}
            </button>
            {emailAiRulesStatus && <p className="text-xs text-emerald-300">{emailAiRulesStatus}</p>}
          </div>
          {emailLearningStatus && <p className="text-xs text-slate-300">{emailLearningStatus}</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4 shadow-xl shadow-slate-950/40 backdrop-blur space-y-4 sm:p-6">
        <h2 className="text-lg font-semibold text-white">Modules dashboard</h2>
        <p className="text-sm text-slate-300">
          Activez les modules visibles sur la page d accueil.
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {DASHBOARD_MODULES.map((module) => (
            <label
              key={module.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-950/30 px-3 py-2 text-sm"
            >
              <span className="text-slate-100">
                {module.icon} {module.title}
              </span>
              <input
                type="checkbox"
                checked={enabledModules.includes(module.id)}
                onChange={() => toggleDashboardModule(module.id)}
                className="h-4 w-4 accent-cyan-400"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4 shadow-xl shadow-slate-950/40 backdrop-blur space-y-4 sm:p-6">
        <h2 className="text-lg font-semibold text-white">{t('settings.memoryZone.title')}</h2>
        <p className="text-sm text-slate-300">
          {t('settings.memoryZone.subtitleSettingsCard')}
        </p>
        <button
          onClick={() => router.push('/dashboard/settings/memory')}
          className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950"
        >
          {t('settings.memoryZone.addFieldCta')}
        </button>
      </div>

      {FULL_ACCESS_USER_IDS.has(user.id) && (
        <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-6 shadow-xl shadow-slate-950/40 backdrop-blur space-y-4">
          <h2 className="text-lg font-semibold text-white">Memory action mappings (admin)</h2>
          <p className="text-sm text-slate-300">
            Definissez l action prioritaire proposee pour chaque type detecte apres un scan.
          </p>

          {loadingMemoryActions && (
            <p className="text-sm text-slate-400">Chargement...</p>
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
                    <label className="text-sm font-medium text-slate-200">{label}</label>
                    <select
                      className="rounded-lg border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white"
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
                className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950"
              >
                Sauvegarder mappings
              </button>
            </div>
          )}

          {memoryActionsStatus && (
            <p className="text-xs text-slate-300">{memoryActionsStatus}</p>
          )}
        </div>
      )}

      {/* EMAILS */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4 shadow-xl shadow-slate-950/40 backdrop-blur space-y-6 sm:p-6">
        <EmailSettingsForm />
      </div>

      {/* IA + ABONNEMENT */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4 shadow-xl shadow-slate-950/40 backdrop-blur space-y-6 sm:p-6">
        <h2 className="text-lg font-semibold text-white">{t("settings.aiSection")}</h2>

        {loadingBilling ? (
          <p className="text-sm text-slate-400">{t("settings.loadingAi")}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-xs text-slate-400">{t("settings.totalUsage")}</p>
                <p className="text-lg font-semibold">{usage?.totals.tokens || 0} {t("settings.aiTokens")}</p>
                <p className="text-sm text-slate-300">~ {Number(usage?.totals.costEstimate || 0).toFixed(4)} EUR</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-xs text-slate-400">{t("settings.thisMonth")}</p>
                <p className="text-lg font-semibold">{usage?.thisMonth.tokens || 0} {t("settings.aiTokens")}</p>
                <p className="text-sm text-slate-300">~ {Number(usage?.thisMonth.costEstimate || 0).toFixed(4)} EUR</p>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4 space-y-3">
              <p className="text-sm font-semibold">{t("settings.activePlan")}</p>

              <div className="flex flex-wrap gap-2">
                {(["BASIC", "PLUS", "PRO"] as PlanName[]).map((plan) => (
                  <button
                    key={plan}
                    onClick={() => handlePlanChange(plan)}
                    className={`px-3 py-2 rounded-lg text-sm ${
                      subscription?.plan === plan
                        ? "bg-cyan-400 text-slate-950"
                        : "border border-white/10 bg-slate-800 text-slate-200"
                    }`}
                  >
                    {plan}
                  </button>
                ))}
              </div>

              <p className="text-xs text-slate-300">
                {t("settings.monthlyPrice")}: {Number(subscription?.price || 0).toFixed(2)} EUR
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                {(Object.entries(subscription?.features || {}) as Array<[keyof PlanFeatures, boolean]>).map(([key, value]) => (
                  <label key={key} className="flex items-center justify-between rounded-lg border border-white/10 bg-slate-800/60 px-3 py-2 text-sm">
                    <span>{key}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(e) => handleFeatureToggle(key, e.target.checked)}
                      className="h-4 w-4 accent-cyan-400"
                    />
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {billingMessage && (
          <p className="text-xs text-slate-300">{billingMessage}</p>
        )}
      </div>

      {/* PARTAGER */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4 shadow-xl shadow-slate-950/40 backdrop-blur space-y-4 sm:p-6">
        <h2 className="text-lg font-semibold text-white">
          {t("settings.shareApp")}
        </h2>

        <button
          onClick={handleShare}
          className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950"
        >
          {t("common.share")}
        </button>
      </div>

      {/* ACCÈS RAPIDE */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4 shadow-xl shadow-slate-950/40 backdrop-blur space-y-4 sm:p-6">
        <h2 className="text-lg font-semibold text-white">
          {t("settings.quickAccess")}
        </h2>

        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:gap-4">

                  <button
                    onClick={() => router.push("/dashboard")}
                    className="min-h-11 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-sm"
                  >
                    {t("settings.dashboard")}
                  </button>

                  <button
                    onClick={() => router.push("/dashboard/tasks")}
                    className="min-h-11 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-sm"
                  >
                    {t("settings.tasks")}
                  </button>

                  <button
                    onClick={() => router.push("/dashboard/memoire")}
                    className="min-h-11 rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-sm"
                  >
                    {t("settings.memory")}
                  </button>

                  <button
                    onClick={() => router.push('/dashboard/settings/memory')}
                    className="min-h-11 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-medium text-slate-950"
                  >
                    {t('settings.memoryZone.title')}
                  </button>

                  {/* 🔔 NOUVEAU */}
                  <button
                    onClick={() =>
                      router.push("/dashboard/settings/notifications")
                    }
                    className="min-h-11 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-400"
                  >
                    🔔 {t("settings.notifications")}
                  </button>

                  <button
                    onClick={() => router.push('/dashboard/settings/calendar')}
                    className="min-h-11 rounded-xl bg-teal-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-teal-300"
                  >
                    Calendrier pro
                  </button>

                  <a
                    href="/docs/notice-utilisation-control-center.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-11 rounded-xl border border-cyan-300/30 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/25"
                  >
                    {t("settings.documentation")}
                  </a>

        </div>

      </div>

      {/* DONNÉES */}
      <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-4 shadow-xl shadow-slate-950/40 backdrop-blur space-y-4 sm:p-6">
        <h2 className="text-lg font-semibold text-white">
          {t("settings.data")}
        </h2>

        <div className="flex gap-4 flex-wrap">
          <button
            onClick={handleExport}
            className="rounded-xl border border-white/10 bg-slate-800 px-4 py-2 text-sm"
          >
            {t("settings.export")}
          </button>

          <button
            onClick={() => setShowDeleteModal(true)}
            className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white"
          >
            {t("settings.deleteAccount")}
          </button>
        </div>
      </div>

      {/* VERSION */}
      <div className="pt-10 text-center text-xs text-slate-400">
        My Hyppocampe<br />
        Version 2.4<br />
        {t("settings.versionBuiltBy")}
      </div>

    </div>
  );
}
