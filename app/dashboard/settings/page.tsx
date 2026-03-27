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
  const [activeTab, setActiveTab] = useState<string>('profil');

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

  const tabs = [
    { id: 'profil', icon: '👤', label: 'Profil' },
    { id: 'ia', icon: '🤖', label: 'Mon IA' },
    { id: 'modules', icon: '🧩', label: 'Modules' },
    { id: 'email', icon: '✉️', label: 'Email' },
    { id: 'abonnement', icon: '💳', label: 'Abonnement' },
    { id: 'donnees', icon: '🗃️', label: 'Données' },
    ...(FULL_ACCESS_USER_IDS.has(user.id) ? [{ id: 'admin', icon: '🔧', label: 'Admin' }] : []),
  ];

  return (
    <div className="mx-auto max-w-2xl px-3 pb-24 text-slate-100 sm:px-0">
      {/* Header */}
      <section className="py-6">
        <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/80">Control</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">{t("settings.title")}</h1>
      </section>

      {/* Tab nav */}
      <div className="flex gap-2 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-medium transition ${
              activeTab === tab.id
                ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/20'
                : 'border border-white/10 bg-slate-800/80 text-slate-300 hover:bg-slate-700/80'
            }`}
          >
            <span className="text-base leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-4">

        {/* ── PROFIL ── */}
        {activeTab === 'profil' && (
          <div className="space-y-4">

            <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 shadow-xl shadow-slate-950/40 backdrop-blur">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">{t("settings.account")}</h2>
              <div className="flex items-center gap-4 mb-5">
                <div
                  onClick={handleAvatarClick}
                  className="group relative h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-slate-800"
                >
                  {previewAvatar && (
                    <img src={previewAvatar} className="w-full h-full object-cover" alt="avatar" />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs text-white opacity-0 transition group-hover:opacity-100">
                    {t("settings.change")}
                  </div>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleAvatarChange} className="hidden" />
                <div className="space-y-1 min-w-0">
                  <p className="text-base font-semibold text-white truncate">{profile?.username}</p>
                  <p className="text-sm text-slate-400 truncate">{user.email}</p>
                  {uploadStatus === 'success' && <p className="text-xs text-emerald-400">Photo mise à jour</p>}
                  {uploadStatus === 'error' && <p className="text-xs text-rose-400">Erreur upload</p>}
                  {uploadStatus === 'loading' && <p className="text-xs text-slate-400">Upload...</p>}
                </div>
              </div>

              <div className="space-y-1.5 mb-5">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Email professionnel</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={professionalEmailDraft}
                    onChange={(e) => setProfessionalEmailDraft(e.target.value)}
                    placeholder="prenom.nom@entreprise.com"
                    className="min-h-11 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400/60"
                  />
                  <button
                    type="button"
                    onClick={saveProfessionalEmail}
                    className="min-h-11 rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950"
                  >
                    {t('common.save')}
                  </button>
                </div>
                {professionalEmailStatus && <p className="text-xs text-emerald-400">{professionalEmailStatus}</p>}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleLogout}
                  className="rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700 transition"
                >
                  {t("settings.logout")}
                </button>
                <button
                  onClick={handleSignOutAll}
                  className="rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 transition"
                >
                  {t("settings.logoutAll")}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 shadow-xl shadow-slate-950/40 backdrop-blur">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{t("language.title")}</h2>
              <div className="flex gap-2">
                {(["fr", "en", "es"] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setLanguage(lang)}
                    className={`rounded-full px-5 py-2.5 text-sm font-medium transition ${
                      language === lang ? 'bg-cyan-400 text-slate-950' : 'border border-white/10 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    {t(`language.${lang}`)}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* ── MON IA ── */}
        {activeTab === 'ia' && (
          <div className="space-y-4">

            <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 shadow-xl shadow-slate-950/40 backdrop-blur">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('settings.myAi.title')}</h2>
              <p className="mb-4 text-sm text-slate-400">{t('settings.myAi.subtitle')}</p>
              <div className="flex gap-2">
                <input
                  value={assistantNameDraft}
                  onChange={(e) => setAssistantNameDraft(e.target.value)}
                  placeholder="Assistant"
                  className="min-h-11 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400/60"
                />
                <button
                  type="button"
                  onClick={saveAssistantName}
                  className="min-h-11 rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950"
                >
                  {t('common.save')}
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {t('settings.myAi.currentName')} : <span className="font-semibold text-cyan-100">{assistantName}</span>
              </p>
              {assistantNameStatus && <p className="mt-1 text-xs text-emerald-400">{assistantNameStatus}</p>}
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 shadow-xl shadow-slate-950/40 backdrop-blur space-y-4">
              <div>
                <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Règles IA — Email</h2>
                <p className="text-sm text-slate-400">Comportement lors de la génération de brouillons.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Réponses automatiques</label>
                <select
                  value={emailReplyScope}
                  onChange={(e) => setEmailReplyScope(e.target.value as EmailReplyScope)}
                  className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400/60"
                >
                  <option value="to_only">Uniquement si je suis en A</option>
                  <option value="all">Si je suis en A ou CC</option>
                  <option value="none">Désactivé (jamais de brouillon auto)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Instruction globale</label>
                <textarea
                  value={emailGlobalInstructionsDraft}
                  onChange={(e) => setEmailGlobalInstructionsDraft(e.target.value)}
                  rows={3}
                  placeholder="Ex: Style court, ton professionnel, priorise les actions concrètes"
                  className="w-full resize-y rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-emerald-400">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                    À faire (1 règle / ligne)
                  </label>
                  <textarea
                    value={emailDoRulesDraft}
                    onChange={(e) => setEmailDoRulesDraft(e.target.value)}
                    rows={5}
                    placeholder={"Toujours proposer une date\nCommencer par Bonjour"}
                    className="w-full resize-y rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-400/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-rose-400">
                    <span className="inline-block h-2 w-2 rounded-full bg-rose-400" />
                    À éviter (1 règle / ligne)
                  </label>
                  <textarea
                    value={emailDontRulesDraft}
                    onChange={(e) => setEmailDontRulesDraft(e.target.value)}
                    rows={5}
                    placeholder={"Éviter les longs paragraphes\nPas de formulation trop informelle"}
                    className="w-full resize-y rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-rose-400/50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Signature</label>
                <input
                  value={emailSignatureDraft}
                  onChange={(e) => setEmailSignatureDraft(e.target.value)}
                  placeholder="Bien cordialement, Frédéric"
                  className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400/60"
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={saveEmailAiRules}
                  className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950"
                >
                  Sauvegarder
                </button>
                <button
                  type="button"
                  onClick={learnEmailAiRulesFromCorrections}
                  disabled={learningEmailRules}
                  className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 transition disabled:opacity-50"
                >
                  {learningEmailRules ? 'Apprentissage...' : '✦ Apprendre depuis mes corrections'}
                </button>
              </div>
              {emailAiRulesStatus && <p className="text-xs text-emerald-400">{emailAiRulesStatus}</p>}
              {emailLearningStatus && <p className="text-xs text-slate-300">{emailLearningStatus}</p>}
            </div>

          </div>
        )}

        {/* ── MODULES ── */}
        {activeTab === 'modules' && (
          <div className="space-y-4">

            <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 shadow-xl shadow-slate-950/40 backdrop-blur">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Modules dashboard</h2>
              <p className="mb-4 text-sm text-slate-400">Active les modules visibles sur l&#39;accueil.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DASHBOARD_MODULES.map((module) => (
                  <button
                    key={module.id}
                    onClick={() => toggleDashboardModule(module.id)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
                      enabledModules.includes(module.id)
                        ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100'
                        : 'border-white/10 bg-slate-950/30 text-slate-400 hover:bg-slate-800/60'
                    }`}
                  >
                    <span>{module.icon} {module.title}</span>
                    <span className={`h-2.5 w-2.5 rounded-full transition ${enabledModules.includes(module.id) ? 'bg-cyan-400' : 'bg-slate-600'}`} />
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 shadow-xl shadow-slate-950/40 backdrop-blur">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('settings.memoryZone.title')}</h2>
              <p className="mb-4 text-sm text-slate-400">{t('settings.memoryZone.subtitleSettingsCard')}</p>
              <button
                onClick={() => router.push('/dashboard/settings/memory')}
                className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950"
              >
                {t('settings.memoryZone.addFieldCta')}
              </button>
            </div>

          </div>
        )}

        {/* ── EMAIL ── */}
        {activeTab === 'email' && (
          <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 shadow-xl shadow-slate-950/40 backdrop-blur">
            <EmailSettingsForm />
          </div>
        )}

        {/* ── ABONNEMENT ── */}
        {activeTab === 'abonnement' && (
          <div className="space-y-4">
            {loadingBilling ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 text-center text-sm text-slate-400">
                {t("settings.loadingAi")}
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 shadow-xl shadow-slate-950/40 backdrop-blur">
                  <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Consommation IA</h2>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                      <p className="text-xs text-slate-400 mb-1">{t("settings.totalUsage")}</p>
                      <p className="text-2xl font-bold text-white">{usage?.totals.tokens || 0}</p>
                      <p className="text-xs text-slate-500">{t("settings.aiTokens")}</p>
                      <p className="mt-1.5 text-xs text-cyan-300">~ {Number(usage?.totals.costEstimate || 0).toFixed(4)} EUR</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                      <p className="text-xs text-slate-400 mb-1">{t("settings.thisMonth")}</p>
                      <p className="text-2xl font-bold text-white">{usage?.thisMonth.tokens || 0}</p>
                      <p className="text-xs text-slate-500">{t("settings.aiTokens")}</p>
                      <p className="mt-1.5 text-xs text-cyan-300">~ {Number(usage?.thisMonth.costEstimate || 0).toFixed(4)} EUR</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 shadow-xl shadow-slate-950/40 backdrop-blur space-y-4">
                  <div>
                    <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{t("settings.activePlan")}</h2>
                    <p className="text-xs text-slate-500">{t("settings.monthlyPrice")} : {Number(subscription?.price || 0).toFixed(2)} EUR</p>
                  </div>
                  <div className="flex gap-2">
                    {(["BASIC", "PLUS", "PRO"] as PlanName[]).map((plan) => (
                      <button
                        key={plan}
                        onClick={() => handlePlanChange(plan)}
                        className={`flex-1 rounded-xl py-3 text-sm font-semibold transition ${
                          subscription?.plan === plan
                            ? 'bg-cyan-400 text-slate-950 shadow-md shadow-cyan-400/20'
                            : 'border border-white/10 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {plan}
                      </button>
                    ))}
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Fonctionnalités</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {(Object.entries(subscription?.features || {}) as Array<[keyof PlanFeatures, boolean]>).map(([key, value]) => (
                        <button
                          key={key}
                          onClick={() => handleFeatureToggle(key, !value)}
                          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
                            value
                              ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100'
                              : 'border-white/10 bg-slate-950/30 text-slate-400'
                          }`}
                        >
                          <span>{key}</span>
                          <span className={`h-2.5 w-2.5 rounded-full ${value ? 'bg-cyan-400' : 'bg-slate-600'}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
            {billingMessage && <p className="text-xs text-slate-300 px-1">{billingMessage}</p>}
          </div>
        )}

        {/* ── DONNÉES ── */}
        {activeTab === 'donnees' && (
          <div className="space-y-4">

            <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 shadow-xl shadow-slate-950/40 backdrop-blur">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400">Accès rapide</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button
                  onClick={() => router.push('/dashboard/settings/notifications')}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-sm text-slate-200 hover:bg-slate-700 transition"
                >
                  🔔 <span>{t("settings.notifications")}</span>
                </button>
                <button
                  onClick={() => router.push('/dashboard/settings/calendar')}
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-sm text-slate-200 hover:bg-slate-700 transition"
                >
                  📅 <span>Calendrier pro</span>
                </button>
                <a
                  href="/docs/notice-utilisation-control-center.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-sm text-slate-200 hover:bg-slate-700 transition"
                >
                  📄 <span>{t("settings.documentation")}</span>
                </a>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 shadow-xl shadow-slate-950/40 backdrop-blur">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{t("settings.data")}</h2>
              <p className="mb-4 text-sm text-slate-400">Exporte ou partage tes données personnelles.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleExport}
                  className="rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700 transition"
                >
                  {t("settings.export")}
                </button>
                <button
                  onClick={handleShare}
                  className="rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700 transition"
                >
                  {t("common.share")}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-rose-500/25 bg-rose-950/20 p-5">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-rose-400">Zone dangereuse</h2>
              <p className="mb-4 text-sm text-slate-400">Cette action est irréversible. Toutes tes données seront effacées.</p>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="rounded-xl bg-rose-500/80 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 transition"
              >
                {t("settings.deleteAccount")}
              </button>
            </div>

            <p className="text-center text-xs text-slate-500 pt-2">
              My Hyppocampe · v2.4 · {t("settings.versionBuiltBy")}
            </p>

          </div>
        )}

        {/* ── ADMIN ── */}
        {activeTab === 'admin' && FULL_ACCESS_USER_IDS.has(user.id) && (
          <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-5 shadow-xl shadow-slate-950/40 backdrop-blur space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Memory action mappings</h2>
            <p className="text-sm text-slate-400">Action prioritaire proposée pour chaque type détecté après scan.</p>
            {loadingMemoryActions && <p className="text-sm text-slate-400">Chargement...</p>}
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
                        className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-sm text-white outline-none"
                        value={memoryActionsDraft[detectedType] || options[0] || ''}
                        onChange={(e) =>
                          setMemoryActionsDraft((prev) => ({ ...prev, [detectedType]: e.target.value }))
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
                  className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950"
                >
                  Sauvegarder
                </button>
              </div>
            )}
            {memoryActionsStatus && <p className="text-xs text-slate-300">{memoryActionsStatus}</p>}
          </div>
        )}

      </div>

      {/* Modal suppression compte */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-rose-500/30 bg-slate-900 p-6 space-y-4">
            <h3 className="text-lg font-semibold text-rose-400">Supprimer mon compte</h3>
            <p className="text-sm text-slate-300">
              Cette action est irréversible. Tape <span className="font-mono font-bold text-white">SUPPRIMER</span> pour confirmer.
            </p>
            <input
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder="SUPPRIMER"
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-rose-400/60"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowDeleteModal(false); setDeleteInput(''); }}
                className="rounded-xl border border-white/10 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200"
              >
                Annuler
              </button>
              <button
                onClick={confirmDeleteAccount}
                disabled={deleteInput !== 'SUPPRIMER' || isDeleting}
                className="rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {isDeleting ? 'Suppression...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
