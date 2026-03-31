"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTaskStore } from "@/store/taskStore";
import { useAuthStore } from "@/store/authStore";
import { getMonthNameFr } from "@/lib/monthHelper";
import { supabase } from "@/lib/supabase/client";
import { getAuthHeaders } from "@/lib/auth/clientSession";
import { useI18n } from "@/components/providers/LanguageProvider";
import {
  DASHBOARD_MODULES,
  loadEnabledDashboardModules,
  type DashboardModuleId,
} from "@/lib/modules/dashboardModules";

type AssistantConversation = {
  id: string;
  title: string | null;
  allow_internet: boolean;
  status: string;
  summary: string | null;
  liked: boolean | null;
  ended_at: string | null;
  last_message_at: string;
};

type AssistantMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
};

type DailySuggestion = {
  priority: 'urgent' | 'high' | 'normal' | 'low';
  action: string;
  why: string;
  sender: string;
  email_message_id: string;
};

type GuideStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
};

type GuideProgress = {
  day: string;
  doneStepIds: string[];
};

type SetupCompanyDraft = {
  name: string;
  paymentEmail: string;
  ndfEmail: string;
};

export default function DashboardPage() {
  const { t, language } = useI18n();
  const user = useAuthStore((state) => state.user);
  const { tasks, fetchTasks } = useTaskStore();
  const [visionCountMonth, setVisionCountMonth] = useState(0);
  const [activeMemoryCount, setActiveMemoryCount] = useState(0);
  const [enabledModules, setEnabledModules] = useState<DashboardModuleId[]>([]);
  const [recentMemoryItems, setRecentMemoryItems] = useState<Array<{
    id: string;
    item_title: string;
    created_at: string;
    section_id: string;
    section_name: string;
  }>>([]);
  const [swipeOffsets, setSwipeOffsets] = useState<Record<string, number>>({});
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const swipeStartRef = useRef<{ id: string; x: number } | null>(null);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAllowInternet, setAssistantAllowInternet] = useState(false);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantConversations, setAssistantConversations] = useState<AssistantConversation[]>([]);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const [assistantConversationId, setAssistantConversationId] = useState<string | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantFinalizing, setAssistantFinalizing] = useState(false);
  const [assistantRatingLoading, setAssistantRatingLoading] = useState(false);
  const [assistantShowFeedback, setAssistantShowFeedback] = useState(false);
  const [assistantSaveProgress, setAssistantSaveProgress] = useState(0);
  const [assistantFlowStatus, setAssistantFlowStatus] = useState<string | null>(null);
  const [assistantListening, setAssistantListening] = useState(false);
  const [assistantModalOpen, setAssistantModalOpen] = useState(false);
  const [assistantName, setAssistantName] = useState('Assistant');
  const [assistantSummaryModalOpen, setAssistantSummaryModalOpen] = useState(false);
  const [assistantSummaryPreview, setAssistantSummaryPreview] = useState<string | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [dailySuggestions, setDailySuggestions] = useState<DailySuggestion[]>([]);
  const [dailySuggestionsSummary, setDailySuggestionsSummary] = useState('');
  const [dailySuggestionsLoading, setDailySuggestionsLoading] = useState(false);
  const [validatingSuggestionIds, setValidatingSuggestionIds] = useState<Record<string, boolean>>({});
  const [validatingAllSuggestions, setValidatingAllSuggestions] = useState(false);
  const [dailySuggestionsError, setDailySuggestionsError] = useState<string | null>(null);
  const [pendingExpensesCount, setPendingExpensesCount] = useState(0);
  const [agendaProposalCount, setAgendaProposalCount] = useState(0);
  const [guideSignalsLoading, setGuideSignalsLoading] = useState(false);
  const [guideModeActive, setGuideModeActive] = useState(true);
  const [guideProgress, setGuideProgress] = useState<GuideProgress>({ day: dayKey(new Date()), doneStepIds: [] });
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const [showcaseLoading, setShowcaseLoading] = useState(false);
  const [showcaseText, setShowcaseText] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupCompanyCount, setSetupCompanyCount] = useState(1);
  const [setupCompanies, setSetupCompanies] = useState<SetupCompanyDraft[]>([{ name: '', paymentEmail: '', ndfEmail: '' }]);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupSuccess, setSetupSuccess] = useState<string | null>(null);
  const [autoLearnLoading, setAutoLearnLoading] = useState(false);
  const [autoLearnStatus, setAutoLearnStatus] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const monthName =
    language === "fr"
      ? getMonthNameFr()
      : new Intl.DateTimeFormat(language, { month: "long" }).format(new Date());

  useEffect(() => {
    if (user) {
      fetchTasks();
    }
  }, [user]);

  useEffect(() => {
    setEnabledModules(loadEnabledDashboardModules());
  }, []);

  useEffect(() => {
    if (!user) return;

    const loadConversations = async () => {
      try {
        const response = await fetch("/api/dashboard/assistant", {
          headers: await getAuthHeaders(false),
        });
        const json = await response.json();
        if (!response.ok) return;

        const conversations = (json.conversations || []) as AssistantConversation[];
        setAssistantConversations(conversations);
      } catch {
        // Non bloquant
      }
    };

    loadConversations();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const loadDailySuggestions = async () => {
      setDailySuggestionsLoading(true);
      setDailySuggestionsError(null);

      try {
        const response = await fetch('/api/email/summary/daily', {
          headers: await getAuthHeaders(false),
        });

        const json = (await response.json().catch(() => ({}))) as {
          summary?: string;
          actions?: DailySuggestion[];
          error?: string;
        };

        if (!response.ok) {
          setDailySuggestionsError(json.error || 'Impossible de charger les propositions IA.');
          return;
        }

        const sorted = [...(json.actions || [])].sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority));
        setDailySuggestions(sorted);
        setDailySuggestionsSummary(String(json.summary || ''));
      } catch {
        setDailySuggestionsError('Erreur reseau lors du chargement des propositions IA.');
      } finally {
        setDailySuggestionsLoading(false);
      }
    };

    loadDailySuggestions();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const loadGuideSignals = async () => {
      setGuideSignalsLoading(true);
      try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        const [expensesResponse, agendaResponse] = await Promise.all([
          fetch(`/api/expenses/report?month=${month}&year=${year}`, {
            headers: await getAuthHeaders(false),
          }),
          fetch('/api/calendar/proposals', {
            headers: await getAuthHeaders(false),
          }),
        ]);

        if (expensesResponse.ok) {
          const expensesJson = (await expensesResponse.json().catch(() => ({}))) as {
            rows?: Array<{ status?: string; payment_method?: 'cb_perso' | 'cb_pro'; email_sent?: boolean }>;
          };

          const pendingCount = (expensesJson.rows || []).filter((row) => {
            const status = String(row.status || '').toLowerCase();
            return status === 'pending' || status === 'pending_ndf' || (row.payment_method === 'cb_pro' && row.email_sent !== true);
          }).length;

          setPendingExpensesCount(pendingCount);
        }

        if (agendaResponse.ok) {
          const agendaJson = (await agendaResponse.json().catch(() => ({}))) as {
            proposals?: Array<{ workflow_status?: string }>;
          };

          const openProposals = (agendaJson.proposals || []).filter((proposal) => {
            const workflow = String(proposal.workflow_status || '').toLowerCase();
            return workflow === 'created' || workflow === 'sent' || workflow === 'relanced';
          }).length;

          setAgendaProposalCount(openProposals);
        }
      } catch {
        // Non bloquant
      } finally {
        setGuideSignalsLoading(false);
      }
    };

    loadGuideSignals();
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('dashboard-guide-progress-v1');
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as GuideProgress;
      if (parsed?.day && Array.isArray(parsed.doneStepIds)) {
        setGuideProgress(parsed);
      }
    } catch {
      // ignore malformed local storage
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('dashboard-guide-progress-v1', JSON.stringify(guideProgress));
  }, [guideProgress]);

  useEffect(() => {
    if (!user) return;

    const loadAssistantName = async () => {
      const { data } = await supabase
        .from('user_ai_settings')
        .select('assistant_name')
        .eq('user_id', user.id)
        .maybeSingle();

      const name = String(data?.assistant_name || 'Assistant').trim();
      setAssistantName(name || 'Assistant');
    };

    loadAssistantName();
  }, [user]);

  useEffect(() => {
    if (!assistantConversationId || !user) return;

    const loadMessages = async () => {
      try {
        const response = await fetch(`/api/dashboard/assistant?conversationId=${assistantConversationId}`, {
          headers: await getAuthHeaders(false),
        });
        const json = await response.json();
        if (!response.ok) return;

        setAssistantMessages((json.messages || []) as AssistantMessage[]);
        if (json.conversation) {
          setAssistantAllowInternet(Boolean(json.conversation.allow_internet));
        }
      } catch {
        // Non bloquant
      }
    };

    loadMessages();
  }, [assistantConversationId, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [assistantMessages.length]);

  useEffect(() => {
    const fetchMonthlyStats = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Erreur récupération session:", error);
          return;
        }

        const token = data.session?.access_token;
        if (!token) return;

        const response = await fetch('/api/tracking/monthly-stats', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setVisionCountMonth(data.stats.google_vision || 0);
        }
      } catch (error) {
        console.error('Erreur récupération stats mois:', error);
      }
    };

    if (user) {
      fetchMonthlyStats();
    }
  }, [user]);

  useEffect(() => {
    const fetchRecentMemoryItems = async () => {
      if (!user) return;

      const [{ data: sectionRows, error: sectionsError }, { data: itemRows, error: itemsError }] = await Promise.all([
        supabase
          .from('memory_sections')
          .select('id, section_name')
          .eq('user_id', user.id),
        supabase
          .from('memory_items')
          .select('id, item_title, created_at, section_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(6),
      ]);

      if (sectionsError || itemsError) {
        console.error('Erreur chargement entrees memoire dashboard:', sectionsError || itemsError);
        return;
      }

      const sectionNameById = new Map((sectionRows || []).map((row) => [row.id, row.section_name || 'Memoire']));
      const merged = (itemRows || [])
        .filter((row) => sectionNameById.has(row.section_id))
        .map((row) => ({
          ...row,
          section_name: sectionNameById.get(row.section_id) || 'Memoire',
        }));

      setRecentMemoryItems(merged);
    };

    fetchRecentMemoryItems();
  }, [user, tasks.length]);

  useEffect(() => {
    const fetchMemoryCount = async () => {
      if (!user) return;

      const { count } = await supabase
        .from('memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      setActiveMemoryCount(count || 0);
    };

    fetchMemoryCount();
  }, [user, recentMemoryItems.length]);

  const proTodoCount = useMemo(
    () => tasks.filter(t => t.type === "pro" && t.status === "todo" && !t.archived).length,
    [tasks]
  );

  const persoTodoCount = useMemo(
    () => tasks.filter(t => t.type === "perso" && t.status === "todo" && !t.archived).length,
    [tasks]
  );

  const todayDoneCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return tasks.filter(t => {
      if (t.status !== "done" || !t.created_at) return false;
      const createdDate = new Date(t.created_at);
      createdDate.setHours(0, 0, 0, 0);
      return createdDate.getTime() === today.getTime();
    }).length;
  }, [tasks]);

  const cards = useMemo(() => {
    const enabled = new Set(enabledModules);
    const selected = DASHBOARD_MODULES.filter((module) => enabled.has(module.id));
    return selected.length > 0 ? selected : DASHBOARD_MODULES;
  }, [enabledModules]);

  const isNewcomer = useMemo(
    () => assistantConversations.length === 0 && tasks.length === 0 && activeMemoryCount === 0,
    [assistantConversations.length, tasks.length, activeMemoryCount]
  );

  const displayName = useMemo(() => {
    const mail = user?.email || "";
    const local = mail.split("@")[0] || "";
    if (!local) return "Pose ta question";
    const pretty = local.replace(/[._-]+/g, " ").trim();
    return `${pretty.charAt(0).toUpperCase()}${pretty.slice(1)} pose ta question...`;
  }, [user?.email]);

  const userLabel = useMemo(() => {
    const mail = user?.email || "";
    const local = mail.split("@")[0] || "user";
    const pretty = local.replace(/[._-]+/g, " ").trim() || "user";
    return `[${pretty}]`;
  }, [user?.email]);

  const selectedConversation = useMemo(() => {
    if (!assistantConversationId) return null;
    return assistantConversations.find((entry) => entry.id === assistantConversationId) || null;
  }, [assistantConversations, assistantConversationId]);

  const formatRelativeDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(language, { day: '2-digit', month: 'short' }).format(date);
  };

  const getModuleBadge = (moduleId: DashboardModuleId) => {
    if (moduleId === 'pro') return { value: proTodoCount, label: t('dashboard.proToLaunch') };
    if (moduleId === 'perso') return { value: persoTodoCount, label: t('dashboard.persoToLaunch') };
    if (moduleId === 'memoire') return { value: activeMemoryCount, label: t('dashboard.activeMemories') };
    if (moduleId === 'courrier') return { value: '📬', label: 'Gestionnaire courrier' };
    if (moduleId === 'emails') return { value: 'IA', label: 'Traitement et reponses emails' };
    if (moduleId === 'planning') return { value: 'IA', label: 'Planification intelligente' };
    return { value: visionCountMonth, label: t('dashboard.visionCalls', { month: monthName }) };
  };

  const themedStats = useMemo(() => {
    const activeTasks = tasks.filter((task) => !task.archived).length;
    const archivedTasks = tasks.filter((task) => task.archived).length;
    const doneTasks = tasks.filter((task) => task.status === 'done' && !task.archived).length;
    const progress = activeTasks > 0 ? Math.round((doneTasks / activeTasks) * 100) : 0;
    const enabledCount = cards.length;

    return [
      {
        id: 'tasks',
        title: 'Taches',
        icon: '✅',
        accent: 'border-cyan-300/25 bg-cyan-500/10',
        stats: [
          { label: 'Actives', value: String(activeTasks) },
          { label: 'Done', value: String(doneTasks) },
          { label: 'Archives', value: String(archivedTasks) },
          { label: 'Progression', value: `${progress}%` },
          { label: 'Pro todo', value: String(proTodoCount) },
          { label: 'Perso todo', value: String(persoTodoCount) },
          { label: 'Done today', value: String(todayDoneCount) },
        ],
      },
      {
        id: 'memory',
        title: 'Memoire',
        icon: '📚',
        accent: 'border-emerald-300/25 bg-emerald-500/10',
        stats: [
          { label: 'Memoires actives', value: String(activeMemoryCount) },
          { label: 'Entrees recentes', value: String(recentMemoryItems.length) },
          {
            label: 'Section recente',
            value: recentMemoryItems[0]?.section_name ? String(recentMemoryItems[0].section_name) : 'Aucune',
          },
        ],
      },
      {
        id: 'automation',
        title: 'IA & Automations',
        icon: '🧠',
        accent: 'border-fuchsia-300/25 bg-fuchsia-500/10',
        stats: [
          { label: `Vision (${monthName})`, value: String(visionCountMonth) },
          { label: 'Conversations IA', value: String(assistantConversations.length) },
          {
            label: 'Conversations ouvertes',
            value: String(assistantConversations.filter((entry) => entry.status !== 'closed').length),
          },
          {
            label: 'Conversations cloturees',
            value: String(assistantConversations.filter((entry) => entry.status === 'closed').length),
          },
        ],
      },
      {
        id: 'modules',
        title: 'Modules',
        icon: '🧩',
        accent: 'border-amber-300/25 bg-amber-500/10',
        stats: [
          { label: 'Modules visibles', value: String(enabledCount) },
          { label: 'Total modules', value: String(DASHBOARD_MODULES.length) },
          {
            label: 'Couverture',
            value: `${Math.round((enabledCount / Math.max(1, DASHBOARD_MODULES.length)) * 100)}%`,
          },
          {
            label: 'Dernier module',
            value: cards[cards.length - 1]?.title ? String(cards[cards.length - 1].title) : 'N/A',
          },
        ],
      },
    ] as const;
  }, [
    tasks,
    cards,
    proTodoCount,
    persoTodoCount,
    todayDoneCount,
    activeMemoryCount,
    recentMemoryItems,
    visionCountMonth,
    assistantConversations,
    monthName,
  ]);

  const resetSwipe = (id: string) => {
    setSwipeOffsets((prev) => ({ ...prev, [id]: 0 }));
  };

  const onSwipeStart = (id: string, x: number) => {
    swipeStartRef.current = { id, x };
    if (armedDeleteId && armedDeleteId !== id) {
      setArmedDeleteId(null);
    }
  };

  const onSwipeMove = (id: string, x: number) => {
    if (!swipeStartRef.current || swipeStartRef.current.id !== id) return;
    const delta = x - swipeStartRef.current.x;
    const next = Math.min(0, Math.max(-112, delta));
    setSwipeOffsets((prev) => ({ ...prev, [id]: next }));
  };

  const onSwipeEnd = (id: string) => {
    const currentOffset = swipeOffsets[id] || 0;
    if (currentOffset <= -72) {
      setArmedDeleteId(id);
      setSwipeOffsets((prev) => ({ ...prev, [id]: -96 }));
    } else {
      if (armedDeleteId === id) {
        setArmedDeleteId(null);
      }
      resetSwipe(id);
    }
    swipeStartRef.current = null;
  };

  const deleteRecentMemoryItem = async (itemId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('memory_items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Erreur suppression entree memoire:', error);
      return;
    }

    setRecentMemoryItems((prev) => prev.filter((entry) => entry.id !== itemId));
    setArmedDeleteId(null);
  };

  const speakText = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === "en" ? "en-US" : language === "es" ? "es-ES" : "fr-FR";
    utterance.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const startVoiceInput = () => {
    if (typeof window === "undefined") return;
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      setAssistantError("La reconnaissance vocale n est pas disponible sur cet appareil.");
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore stale recognition instance cleanup errors.
      }
      recognitionRef.current = null;
    }

    const recognition = new Ctor();
    recognition.lang = language === "en" ? "en-US" : language === "es" ? "es-ES" : "fr-FR";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setAssistantError(null);
      setAssistantListening(true);
    };
    recognition.onend = () => {
      setAssistantListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = (event: any) => {
      setAssistantListening(false);
      setAssistantError(`Micro indisponible: ${event?.error || 'erreur inconnue'}.`);
      recognitionRef.current = null;
    };
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      setAssistantQuestion(transcript.trim());
    };

    try {
      recognition.start();
    } catch {
      setAssistantListening(false);
      setAssistantError('Impossible de lancer le micro. Autorise la permission microphone et reessaie.');
      recognitionRef.current = null;
    }
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setAssistantListening(false);
  };

  const closeAssistantModal = () => {
    stopVoiceInput();
    setAssistantModalOpen(false);
    setAssistantSummaryModalOpen(false);
    setAssistantSummaryPreview(null);
    setAssistantShowFeedback(false);
    setAssistantSaveProgress(0);
    setAssistantFlowStatus(null);
  };

  const openAssistantModal = () => {
    setAssistantModalOpen(true);
    setAssistantConversationId(null);
    setAssistantMessages([]);
    setAssistantQuestion('');
    setAssistantError(null);
    setAssistantSummaryModalOpen(false);
    setAssistantSummaryPreview(null);
    setAssistantShowFeedback(false);
    setAssistantSaveProgress(0);
    setAssistantFlowStatus(null);
  };

  const openAssistantWithVoice = () => {
    openAssistantModal();
    window.setTimeout(() => {
      startVoiceInput();
    }, 140);
  };

  const openOnboardingShowcase = async () => {
    setShowcaseOpen(true);
    setShowcaseLoading(true);
    setShowcaseText('');

    try {
      const response = await fetch('/api/dashboard/assistant', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: 'onboarding_showcase' }),
      });

      const json = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) {
        setShowcaseText(json.error || 'Impossible de lancer la presentation.');
        return;
      }

      setShowcaseText(String(json.message || 'Presentation indisponible.'));
      speakText(String(json.message || ''));
    } catch {
      setShowcaseText('Erreur reseau pendant la presentation.');
    } finally {
      setShowcaseLoading(false);
    }
  };

  const resizeSetupCompanies = (count: number) => {
    const safeCount = Math.min(8, Math.max(1, count));
    setSetupCompanyCount(safeCount);
    setSetupCompanies((prev) => {
      const next = [...prev];
      while (next.length < safeCount) {
        next.push({ name: '', paymentEmail: '', ndfEmail: '' });
      }
      return next.slice(0, safeCount);
    });
  };

  const updateSetupCompany = (index: number, field: keyof SetupCompanyDraft, value: string) => {
    setSetupCompanies((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const runSetupWizard = async () => {
    const companies = setupCompanies
      .map((company) => ({
        name: company.name.trim(),
        paymentEmail: company.paymentEmail.trim(),
        ndfEmail: company.ndfEmail.trim(),
      }))
      .filter((company) => company.name && company.paymentEmail && company.ndfEmail);

    if (companies.length === 0) {
      setSetupError('Ajoute au moins une societe complete (nom + justificatifs + NDF).');
      return;
    }

    setSetupSaving(true);
    setSetupError(null);
    setSetupSuccess(null);

    try {
      const recipientIdsByPaymentEmail = new Map<string, string[]>();
      const recipientIdsByNdfEmail = new Map<string, string[]>();
      const allPaymentEmails: string[] = [];
      const allNdfEmails: string[] = [];

      for (const company of companies) {
        const createRecipientResponse = await fetch('/api/settings/expense-recipients', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(await getAuthHeaders()),
          },
          body: JSON.stringify({ name: company.name, destination: company.paymentEmail }),
        });

        const recipientJson = (await createRecipientResponse.json().catch(() => ({}))) as {
          error?: string;
          recipient?: { id?: string };
        };

        if (!createRecipientResponse.ok || !recipientJson.recipient?.id) {
          throw new Error(recipientJson.error || `Erreur creation societe ${company.name}`);
        }

        const recipientId = String(recipientJson.recipient.id);

        const paymentKey = company.paymentEmail.toLowerCase();
        const ndfKey = company.ndfEmail.toLowerCase();

        allPaymentEmails.push(company.paymentEmail);
        allNdfEmails.push(company.ndfEmail);

        recipientIdsByPaymentEmail.set(paymentKey, [
          ...(recipientIdsByPaymentEmail.get(paymentKey) || []),
          recipientId,
        ]);
        recipientIdsByNdfEmail.set(ndfKey, [
          ...(recipientIdsByNdfEmail.get(ndfKey) || []),
          recipientId,
        ]);
      }

      const paymentEmailList = uniqueNormalizedEmails(allPaymentEmails);
      const ndfEmailList = uniqueNormalizedEmails(allNdfEmails);

      const [saveFactureResponse, saveNdfResponse] = await Promise.all([
        fetch('/api/settings/emails', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(await getAuthHeaders()),
          },
          body: JSON.stringify({ type: 'facture', email: paymentEmailList.join(', ') }),
        }),
        fetch('/api/settings/emails', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(await getAuthHeaders()),
          },
          body: JSON.stringify({ type: 'ndf', email: ndfEmailList.join(', ') }),
        }),
      ]);

      const saveFactureJson = (await saveFactureResponse.json().catch(() => ({}))) as { error?: string };
      const saveNdfJson = (await saveNdfResponse.json().catch(() => ({}))) as { error?: string };
      if (!saveFactureResponse.ok) throw new Error(saveFactureJson.error || 'Erreur sauvegarde emails justificatifs');
      if (!saveNdfResponse.ok) throw new Error(saveNdfJson.error || 'Erreur sauvegarde emails NDF');

      const factureLinksPayload = paymentEmailList.map((email) => ({
        email,
        companyRecipientIds: uniqueNormalizedEmails(recipientIdsByPaymentEmail.get(email.toLowerCase()) || []),
      }));

      const ndfLinksPayload = ndfEmailList.map((email) => ({
        email,
        companyRecipientIds: uniqueNormalizedEmails(recipientIdsByNdfEmail.get(email.toLowerCase()) || []),
      }));

      const [saveFactureLinksResponse, saveNdfLinksResponse] = await Promise.all([
        fetch('/api/settings/email-company-links', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(await getAuthHeaders()),
          },
          body: JSON.stringify({ type: 'facture', links: factureLinksPayload }),
        }),
        fetch('/api/settings/email-company-links', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(await getAuthHeaders()),
          },
          body: JSON.stringify({ type: 'ndf', links: ndfLinksPayload }),
        }),
      ]);

      const saveFactureLinksJson = (await saveFactureLinksResponse.json().catch(() => ({}))) as { error?: string };
      const saveNdfLinksJson = (await saveNdfLinksResponse.json().catch(() => ({}))) as { error?: string };
      if (!saveFactureLinksResponse.ok) throw new Error(saveFactureLinksJson.error || 'Erreur liens societes justificatifs');
      if (!saveNdfLinksResponse.ok) throw new Error(saveNdfLinksJson.error || 'Erreur liens societes NDF');

      setSetupSuccess('Parametrage termine. L assistant est pret avec tes societes et tes destinataires.');
      setSetupOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur parametrage guide.';
      setSetupError(message);
    } finally {
      setSetupSaving(false);
    }
  };

  const runAutoLearning = async (source: 'auto' | 'manual') => {
    if (autoLearnLoading) return;

    setAutoLearnLoading(true);
    setAutoLearnStatus(null);

    try {
      const response = await fetch('/api/settings/email-ai-rules/learn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ apply: true, maxSamples: 80 }),
      });

      const json = (await response.json().catch(() => ({}))) as { summary?: string; error?: string; editedSamples?: number };

      if (!response.ok) {
        setAutoLearnStatus(json.error || 'Auto-apprentissage indisponible.');
        return;
      }

      const summary = String(json.summary || 'Regles mises a jour.');
      setAutoLearnStatus(
        source === 'auto'
          ? `Auto-apprentissage execute: ${summary}`
          : `Apprentissage lance: ${summary}`
      );

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('email-ai-auto-learn-last-day', dayKey(new Date()));
      }
    } catch {
      setAutoLearnStatus('Erreur reseau auto-apprentissage.');
    } finally {
      setAutoLearnLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (typeof window === 'undefined') return;

    const today = dayKey(new Date());
    const alreadyDone = window.localStorage.getItem('email-ai-auto-learn-last-day');
    if (alreadyDone === today) return;

    runAutoLearning('auto');
  }, [user]);

  const openConversation = (conversation: AssistantConversation) => {
    setAssistantConversationId(conversation.id);
    setAssistantAllowInternet(Boolean(conversation.allow_internet));
    setAssistantError(null);
    if (conversation.summary) {
      setAssistantSummaryPreview(conversation.summary);
      setAssistantSummaryModalOpen(true);
    } else {
      setAssistantSummaryPreview(null);
      setAssistantSummaryModalOpen(false);
    }
    setAssistantShowFeedback(false);
    setAssistantSaveProgress(0);
    setAssistantFlowStatus(null);
  };

  const askAssistant = async () => {
    const question = assistantQuestion.trim();
    if (!question || assistantLoading) return;
    const targetConversationId = selectedConversation?.status === 'closed' ? null : assistantConversationId;

    setAssistantError(null);
    setAssistantShowFeedback(false);
    setAssistantFlowStatus(null);
    setAssistantLoading(true);

    try {
      const response = await fetch("/api/dashboard/assistant", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: "ask",
          question,
          allowInternet: assistantAllowInternet,
          conversationId: targetConversationId,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        setAssistantError(json?.error || "Erreur assistant.");
        return;
      }

      setAssistantConversationId(json.conversationId || null);
      setAssistantMessages((json.messages || []) as AssistantMessage[]);
      setAssistantQuestion("");

      const listResponse = await fetch("/api/dashboard/assistant", {
        headers: await getAuthHeaders(false),
      });
      const listJson = await listResponse.json();
      if (listResponse.ok) {
        setAssistantConversations((listJson.conversations || []) as AssistantConversation[]);
      }
    } catch {
      setAssistantError("Erreur reseau assistant.");
    } finally {
      setAssistantLoading(false);
    }
  };

  const validateSuggestion = async (suggestion: DailySuggestion) => {
    const emailId = String(suggestion.email_message_id || '').trim();
    if (!emailId) return;

    setValidatingSuggestionIds((prev) => ({ ...prev, [emailId]: true }));
    setDailySuggestionsError(null);

    try {
      const response = await fetch(`/api/email/messages/${emailId}/task`, {
        method: 'POST',
        headers: await getAuthHeaders(),
      });

      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setDailySuggestionsError(json.error || 'Impossible de creer la tache depuis la proposition.');
        return;
      }

      setDailySuggestions((prev) => prev.filter((entry) => entry.email_message_id !== emailId));
      await fetchTasks();
    } catch {
      setDailySuggestionsError('Erreur reseau pendant la validation de la proposition.');
    } finally {
      setValidatingSuggestionIds((prev) => {
        const clone = { ...prev };
        delete clone[emailId];
        return clone;
      });
    }
  };

  const validateAllSuggestions = async () => {
    const priorities = Array.from(new Set(dailySuggestions.map((entry) => entry.priority))).filter(
      (priority): priority is 'urgent' | 'high' | 'normal' | 'low' =>
        ['urgent', 'high', 'normal', 'low'].includes(priority)
    );

    if (priorities.length === 0) return;

    setValidatingAllSuggestions(true);
    setDailySuggestionsError(null);

    try {
      const response = await fetch('/api/email/summary/daily', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ priorities }),
      });

      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setDailySuggestionsError(json.error || 'Impossible de valider toutes les propositions.');
        return;
      }

      setDailySuggestions([]);
      await fetchTasks();
    } catch {
      setDailySuggestionsError('Erreur reseau pendant la validation globale.');
    } finally {
      setValidatingAllSuggestions(false);
    }
  };

  const closeConversation = async () => {
    if (!assistantConversationId || assistantFinalizing) return;

    setAssistantFinalizing(true);
    setAssistantError(null);
    try {
      const response = await fetch("/api/dashboard/assistant", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: "close",
          conversationId: assistantConversationId,
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setAssistantError(json?.error || "Cloture impossible.");
        return;
      }

      const listResponse = await fetch('/api/dashboard/assistant', {
        headers: await getAuthHeaders(false),
      });
      const listJson = await listResponse.json();
      if (listResponse.ok) {
        setAssistantConversations((listJson.conversations || []) as AssistantConversation[]);
      }
      setAssistantShowFeedback(true);
      setAssistantFlowStatus('Conversation cloturee. Donne ton avis.');
    } catch {
      setAssistantError("Erreur reseau pendant la cloture.");
    } finally {
      setAssistantFinalizing(false);
    }
  };

  const rateConversation = async (liked: boolean) => {
    if (!assistantConversationId || assistantRatingLoading) return;

    setAssistantRatingLoading(true);
    setAssistantError(null);
    setAssistantFlowStatus(null);

    let progressTimer: ReturnType<typeof setInterval> | null = null;
    if (liked) {
      setAssistantSaveProgress(8);
      progressTimer = setInterval(() => {
        setAssistantSaveProgress((prev) => {
          if (prev >= 92) return prev;
          return prev + 7;
        });
      }, 180);
    }

    try {
      const response = await fetch('/api/dashboard/assistant', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: 'rate',
          conversationId: assistantConversationId,
          liked,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        setAssistantError(json?.error || 'Evaluation impossible.');
        return;
      }

      if (liked) {
        setAssistantSaveProgress(100);
        setAssistantFlowStatus('Enregistrement OK');
      } else {
        setAssistantFlowStatus('Conversation fermee sans enregistrement');
      }

      const listResponse = await fetch('/api/dashboard/assistant', {
        headers: await getAuthHeaders(false),
      });
      const listJson = await listResponse.json();
      if (listResponse.ok) {
        setAssistantConversations((listJson.conversations || []) as AssistantConversation[]);
      }

      setTimeout(() => {
        startNewConversation();
      }, liked ? 900 : 500);
    } catch {
      setAssistantError('Erreur reseau pendant le feedback.');
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setAssistantRatingLoading(false);
    }
  };

  const startNewConversation = () => {
    stopVoiceInput();
    setAssistantConversationId(null);
    setAssistantMessages([]);
    setAssistantError(null);
    setAssistantQuestion("");
    setAssistantSummaryModalOpen(false);
    setAssistantSummaryPreview(null);
    setAssistantShowFeedback(false);
    setAssistantSaveProgress(0);
    setAssistantFlowStatus(null);
  };

  const discreetMenuLinks = useMemo(
    () => cards.slice(0, 8).map((card) => ({
      id: card.id,
      title: card.title,
      icon: card.icon,
      link: card.link,
    })),
    [cards]
  );

  const quickCreateOptions = useMemo(() => {
    const byModuleId: Partial<Record<DashboardModuleId, { id: string; label: string; icon: string; link: string }>> = {
      pro: { id: 'task-pro', label: 'Tache Pro', icon: '💼', link: '/dashboard/tasks?type=pro&new=1' },
      perso: { id: 'task-perso', label: 'Tache Perso', icon: '🎯', link: '/dashboard/tasks?type=perso&new=1' },
      memoire: { id: 'memoire', label: 'Memoire', icon: '📚', link: '/dashboard/memoire/quick-add' },
      courrier: { id: 'courrier', label: 'Courrier', icon: '📬', link: '/dashboard/courrier' },
      emails: { id: 'emails', label: 'Email', icon: '✉️', link: '/dashboard/emails' },
      planning: { id: 'planning', label: 'Agenda', icon: '📅', link: '/dashboard/agenda/pro' },
      expenses: { id: 'expenses', label: 'Depense', icon: '💰', link: '/dashboard/expenses' },
    };

    return cards
      .map((card) => byModuleId[card.id])
      .filter((entry): entry is { id: string; label: string; icon: string; link: string } => Boolean(entry));
  }, [cards]);

  const guidedSteps = useMemo<GuideStep[]>(() => {
    const steps: GuideStep[] = [];

    if (dailySuggestions.length > 0) {
      steps.push({
        id: 'ia-suggestions',
        title: `Maintenant fais ceci: valide ${dailySuggestions.length} proposition(s) IA`,
        description: 'Ces actions sont deja preparees. Tu confirmes, la tache se cree automatiquement.',
        href: '/dashboard',
        actionLabel: 'Valider dans la section IA',
      });
    }

    if (pendingExpensesCount > 0) {
      steps.push({
        id: 'expenses',
        title: `Puis fais cela: traite ${pendingExpensesCount} depense(s) en attente`,
        description: 'Le but est de finaliser les justificatifs et les envois email en retard.',
        href: '/expenses/list',
        actionLabel: 'Ouvrir Depenses',
      });
    }

    if (agendaProposalCount > 0) {
      steps.push({
        id: 'agenda',
        title: `Ensuite fais cela: confirme ${agendaProposalCount} proposition(s) agenda`,
        description: 'Tu reduis les allers-retours en confirmant les propositions en attente.',
        href: '/dashboard/agenda/propositions',
        actionLabel: 'Ouvrir Propositions agenda',
      });
    }

    if (steps.length === 0) {
      steps.push({
        id: 'assistant-chat',
        title: 'Maintenant fais ceci: parle a ton assistant pour la prochaine action',
        description: 'Demande-lui une priorisation de ta journee et execute etape par etape.',
        href: '/dashboard',
        actionLabel: 'Parler a l assistant',
      });
    }

    return steps.slice(0, 3);
  }, [dailySuggestions.length, pendingExpensesCount, agendaProposalCount]);

  useEffect(() => {
    const today = dayKey(new Date());
    if (guideProgress.day !== today) {
      setGuideProgress({ day: today, doneStepIds: [] });
      return;
    }

    const validIds = new Set(guidedSteps.map((step) => step.id));
    const filtered = guideProgress.doneStepIds.filter((id) => validIds.has(id));
    if (filtered.length !== guideProgress.doneStepIds.length) {
      setGuideProgress((prev) => ({ ...prev, doneStepIds: filtered }));
    }
  }, [guidedSteps, guideProgress.day, guideProgress.doneStepIds]);

  const nextGuideStep = useMemo(
    () => guidedSteps.find((step) => !guideProgress.doneStepIds.includes(step.id)) || null,
    [guidedSteps, guideProgress.doneStepIds]
  );

  const completeGuideStep = (stepId: string) => {
    setGuideProgress((prev) => {
      if (prev.doneStepIds.includes(stepId)) return prev;
      return {
        ...prev,
        doneStepIds: [...prev.doneStepIds, stepId],
      };
    });
  };

  const reopenGuideStep = (stepId: string) => {
    setGuideProgress((prev) => ({
      ...prev,
      doneStepIds: prev.doneStepIds.filter((id) => id !== stepId),
    }));
  };

  const resetGuideProgress = () => {
    setGuideProgress({ day: dayKey(new Date()), doneStepIds: [] });
  };

  return (
    <div className="min-h-screen px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <section className="overflow-hidden rounded-2xl border border-cyan-200/10 bg-gradient-to-r from-slate-900/80 via-slate-900/70 to-cyan-950/50 p-4 shadow-[0_30px_70px_-40px_rgba(8,145,178,0.9)] sm:rounded-3xl sm:p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">{t('dashboard.overview')}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">Control Center</h1>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-3 sm:p-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-300">Mon assistant</p>
              <p className="mt-1 truncate text-sm text-cyan-100">{assistantName} est pret a repondre a tes questions</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openAssistantModal}
                className="group relative inline-flex min-h-16 items-center gap-3 overflow-hidden rounded-2xl border border-cyan-100/80 bg-[linear-gradient(130deg,#a5f3fc_0%,#7dd3fc_42%,#93c5fd_100%)] px-5 py-3 text-left text-slate-950 shadow-[0_24px_56px_-20px_rgba(56,189,248,0.95)] transition duration-300 hover:scale-[1.03]"
              >
                <span className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/35 blur-2xl transition group-hover:scale-110" />
                <span className="relative flex h-11 w-11 items-center justify-center rounded-full border border-slate-900/15 bg-slate-950/10 text-xl shadow-inner">
                  🗣️
                </span>
                <span className="relative flex flex-col">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-900/80">Assistant IA</span>
                  <span className="text-sm font-extrabold leading-tight">Discuter avec {assistantName}</span>
                </span>
                <span className="relative ml-2 rounded-full border border-slate-900/20 bg-white/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-900">
                  Live
                </span>
              </button>

              <button
                type="button"
                onClick={openAssistantWithVoice}
                className="rounded-2xl border border-cyan-300/50 bg-cyan-500/15 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-cyan-100 transition hover:bg-cyan-500/25"
              >
                Parler
              </button>
            </div>
          </div>
        </section>

        {isNewcomer && (
          <section className="rounded-3xl border border-cyan-300/30 bg-cyan-500/10 p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Nouveau ici</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Demarrage assiste</h2>
            <p className="mt-1 text-sm text-slate-200">
              En 2 minutes max, je t explique tout. Ensuite je configure l app avec toi (societes, justificatifs, NDF).
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openOnboardingShowcase}
                className="rounded-lg border border-cyan-300/45 bg-cyan-500/20 px-3 py-2 text-xs font-semibold text-cyan-100"
              >
                Lancer Mission Flash 120
              </button>
              <button
                type="button"
                onClick={() => setSetupOpen((prev) => !prev)}
                className="rounded-lg border border-emerald-300/45 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100"
              >
                Parametrage guide
              </button>
            </div>

            {showcaseOpen && (
              <div className="mt-3 rounded-xl border border-cyan-300/30 bg-slate-950/45 p-3">
                <p className="text-[11px] uppercase tracking-wide text-cyan-200">Mission Flash 120</p>
                {showcaseLoading ? (
                  <p className="mt-2 text-sm text-slate-300">Preparation de la presentation...</p>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-100">{showcaseText}</p>
                )}
              </div>
            )}

            {setupOpen && (
              <div className="mt-3 rounded-xl border border-emerald-300/30 bg-slate-950/45 p-3 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-emerald-100">Etape 1 - Combien de societes as-tu ?</p>
                  <p className="text-[11px] text-slate-400">Objectif: preparer les circuits d envoi des justificatifs et NDF.</p>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={setupCompanyCount}
                    onChange={(event) => resizeSetupCompanies(Number(event.target.value || 1))}
                    className="mt-2 w-24 rounded-lg border border-white/15 bg-slate-900/80 px-2 py-1 text-sm text-white"
                  />
                </div>

                <div className="space-y-2">
                  {setupCompanies.map((company, index) => (
                    <div key={`setup-company-${index}`} className="rounded-lg border border-white/10 bg-slate-900/55 p-2">
                      <p className="text-[11px] uppercase tracking-wide text-slate-400">Societe {index + 1}</p>
                      <div className="mt-2 grid gap-2 md:grid-cols-3">
                        <input
                          value={company.name}
                          onChange={(event) => updateSetupCompany(index, 'name', event.target.value)}
                          placeholder="Nom de la societe"
                          className="rounded-lg border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white"
                        />
                        <input
                          value={company.paymentEmail}
                          onChange={(event) => updateSetupCompany(index, 'paymentEmail', event.target.value)}
                          placeholder="Email justificatifs"
                          className="rounded-lg border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white"
                        />
                        <input
                          value={company.ndfEmail}
                          onChange={(event) => updateSetupCompany(index, 'ndfEmail', event.target.value)}
                          placeholder="Email NDF"
                          className="rounded-lg border border-white/15 bg-slate-900/80 px-2 py-1.5 text-sm text-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {setupError && <p className="text-xs text-rose-300">{setupError}</p>}
                {setupSuccess && <p className="text-xs text-emerald-300">{setupSuccess}</p>}

                <button
                  type="button"
                  onClick={runSetupWizard}
                  disabled={setupSaving}
                  className="rounded-lg border border-emerald-300/45 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50"
                >
                  {setupSaving ? 'Configuration...' : 'Appliquer le parametrage'}
                </button>
              </div>
            )}
          </section>
        )}

        <section className="rounded-3xl border border-white/10 bg-slate-900/75 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Mode guide</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Maintenant fais ca, puis fais ca</h2>
            </div>
            <div className="flex items-center gap-2">
              {guideSignalsLoading && <p className="text-xs text-slate-400">Analyse en cours...</p>}
              <button
                type="button"
                onClick={() => setGuideModeActive((prev) => !prev)}
                className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-slate-200"
              >
                {guideModeActive ? 'Pause guide' : 'Reprendre guide'}
              </button>
              <button
                type="button"
                onClick={resetGuideProgress}
                className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-slate-300"
              >
                Reinitialiser
              </button>
            </div>
          </div>

          {guideModeActive && nextGuideStep && (
            <div className="mt-3 rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-3">
              <p className="text-[11px] uppercase tracking-wide text-emerald-200">Prochaine action</p>
              <p className="mt-1 text-sm font-semibold text-emerald-100">{nextGuideStep.title}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {nextGuideStep.href === '/dashboard' ? (
                  <button
                    type="button"
                    onClick={openAssistantWithVoice}
                    className="rounded-lg border border-emerald-300/45 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100"
                  >
                    {nextGuideStep.actionLabel}
                  </button>
                ) : (
                  <Link
                    href={nextGuideStep.href}
                    className="inline-flex rounded-lg border border-emerald-300/45 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100"
                  >
                    {nextGuideStep.actionLabel}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => completeGuideStep(nextGuideStep.id)}
                  className="rounded-lg border border-emerald-300/45 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-emerald-100"
                >
                  Termine
                </button>
              </div>
            </div>
          )}

          {guideModeActive && !nextGuideStep && (
            <div className="mt-3 rounded-2xl border border-cyan-300/30 bg-cyan-500/10 p-3">
              <p className="text-sm text-cyan-100">Toutes les etapes du guide sont terminees pour aujourd hui.</p>
            </div>
          )}

          <div className="mt-3 space-y-2">
            {guidedSteps.map((step, index) => (
              <div key={step.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Etape {index + 1}</p>
                  {guideProgress.doneStepIds.includes(step.id) ? (
                    <span className="rounded-full border border-emerald-300/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">
                      Terminee
                    </span>
                  ) : (
                    <span className="rounded-full border border-amber-300/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                      A faire
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-100">{step.title}</p>
                <p className="mt-1 text-xs text-slate-400">{step.description}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {step.href === '/dashboard' ? (
                    <button
                      type="button"
                      onClick={openAssistantWithVoice}
                      className="rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100"
                    >
                      {step.actionLabel}
                    </button>
                  ) : (
                    <Link
                      href={step.href}
                      className="inline-flex rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100"
                    >
                      {step.actionLabel}
                    </Link>
                  )}
                  {guideProgress.doneStepIds.includes(step.id) ? (
                    <button
                      type="button"
                      onClick={() => reopenGuideStep(step.id)}
                      className="rounded-lg border border-white/15 bg-slate-900/45 px-3 py-1.5 text-xs font-semibold text-slate-200"
                    >
                      Remettre a faire
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => completeGuideStep(step.id)}
                      className="rounded-lg border border-emerald-300/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100"
                    >
                      Marquer terminee
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/75 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Auto-apprentissage</p>
              <h2 className="mt-1 text-lg font-semibold text-white">L assistant s adapte a tes corrections</h2>
              <p className="mt-1 text-xs text-slate-400">Les regles IA se mettent a jour automatiquement a partir de tes modifications.</p>
            </div>
            <button
              type="button"
              onClick={() => runAutoLearning('manual')}
              disabled={autoLearnLoading}
              className="rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 disabled:opacity-50"
            >
              {autoLearnLoading ? 'Apprentissage...' : 'Lancer maintenant'}
            </button>
          </div>
          {autoLearnStatus && <p className="mt-2 text-xs text-emerald-200">{autoLearnStatus}</p>}
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/75 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Assistant qui propose</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Propositions IA a valider</h2>
              <p className="mt-1 text-xs text-slate-300">L IA prepare les actions. Tu valides en 1 clic.</p>
            </div>
            <button
              type="button"
              onClick={validateAllSuggestions}
              disabled={dailySuggestions.length === 0 || validatingAllSuggestions || dailySuggestionsLoading}
              className="rounded-xl border border-emerald-300/35 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50"
            >
              {validatingAllSuggestions ? 'Validation...' : 'Valider toutes les propositions'}
            </button>
          </div>

          {dailySuggestionsSummary && (
            <p className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
              {dailySuggestionsSummary}
            </p>
          )}

          {dailySuggestionsError && (
            <p className="mt-3 rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {dailySuggestionsError}
            </p>
          )}

          {dailySuggestionsLoading ? (
            <p className="mt-4 text-sm text-slate-300">Chargement des propositions IA...</p>
          ) : dailySuggestions.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">Aucune proposition prioritaire a valider pour le moment.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {dailySuggestions.map((suggestion, index) => {
                const emailId = String(suggestion.email_message_id || '').trim();
                const validating = Boolean(validatingSuggestionIds[emailId]);
                return (
                  <div
                    key={`${emailId}-${index}`}
                    className="rounded-2xl border border-white/10 bg-slate-950/45 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${suggestionPriorityPill(suggestion.priority)}`}>
                            {suggestion.priority}
                          </span>
                          <span className="truncate text-xs text-slate-400">{suggestion.sender || 'Expediteur'}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-100">{suggestion.action}</p>
                        <p className="mt-1 text-xs text-slate-400">{suggestion.why}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => validateSuggestion(suggestion)}
                        disabled={!emailId || validating}
                        className="rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 disabled:opacity-50"
                      >
                        {validating ? 'Creation...' : 'Valider'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {assistantModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 p-3 sm:p-6" onClick={closeAssistantModal}>
            <div
              className="relative mx-auto flex h-[96vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-slate-900 shadow-2xl shadow-black/40"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-3 sm:px-4">
                <div>
                  <p className="text-sm font-semibold text-cyan-100">{assistantName}</p>
                  <p className="text-[11px] text-slate-400">Assistant conversationnel</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeAssistantModal}
                    className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    Fermer
                  </button>
                </div>
              </div>

              <div className="border-b border-white/10 px-3 py-2 sm:px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={startNewConversation}
                    className="rounded-full border border-emerald-300/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/25"
                  >
                    Nouvelle discussion
                  </button>

                  <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/65 px-3 py-1.5 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={assistantAllowInternet}
                      onChange={(event) => setAssistantAllowInternet(event.target.checked)}
                      className="h-3.5 w-3.5 accent-cyan-400"
                    />
                    Autoriser recherche internet
                  </label>
                </div>

                <div className="mt-2 overflow-hidden rounded-xl border border-white/10">
                  <div className="grid grid-cols-[76px_1fr_1.2fr_96px] bg-slate-950/70 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">
                    <span>Date</span>
                    <span>Sujet</span>
                    <span>Resume</span>
                    <span className="text-right">Conversation</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto bg-slate-900/35">
                    {assistantConversations.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-400">Aucune conversation pour le moment.</p>
                    ) : (
                      assistantConversations.map((conversation) => (
                        <div
                          key={conversation.id}
                          className={`grid grid-cols-[76px_1fr_1.2fr_96px] items-center gap-2 border-t border-white/10 px-2 py-1.5 text-xs ${
                            assistantConversationId === conversation.id ? 'bg-cyan-500/10' : 'bg-transparent'
                          }`}
                        >
                          <span className="text-slate-400">{formatRelativeDate(conversation.last_message_at)}</span>
                          <button
                            type="button"
                            onClick={() => openConversation(conversation)}
                            className="truncate text-left text-slate-100 hover:text-cyan-100"
                            title={conversation.title || 'Discussion'}
                          >
                            {conversation.title || 'Discussion'}
                          </button>
                          <span className="truncate text-slate-400" title={conversation.summary || 'Aucun resume'}>
                            {conversation.summary || '-'}
                          </span>
                          <div className="text-right">
                            <button
                              type="button"
                              onClick={() => openConversation(conversation)}
                              className="rounded-md border border-cyan-300/30 px-2 py-1 text-[11px] text-cyan-100"
                            >
                              Ouvrir
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto bg-slate-950/35 px-3 py-3 sm:px-4">
                {assistantMessages.length === 0 ? (
                  <p className="text-sm text-slate-300">Selectionne une conversation ou commence une nouvelle discussion.</p>
                ) : (
                  assistantMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${
                        message.role === 'assistant'
                          ? 'mr-auto border border-cyan-300/20 bg-cyan-500/10 text-cyan-50'
                          : 'ml-auto border border-white/10 bg-slate-800/95 text-slate-100'
                      }`}
                    >
                      <p className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
                        {message.role === 'assistant' ? assistantName : userLabel}
                      </p>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                      {message.role === 'assistant' && (
                        <button
                          type="button"
                          onClick={() => speakText(message.content)}
                          className="mt-2 rounded-md border border-cyan-300/30 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-100"
                        >
                          Lire
                        </button>
                      )}
                    </div>
                  ))
                )}

                {assistantConversationId && assistantMessages.length > 0 && !assistantShowFeedback && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={closeConversation}
                      disabled={assistantFinalizing || selectedConversation?.status === 'closed'}
                      className="rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-60"
                    >
                      {assistantFinalizing ? 'Cloture...' : 'Fin de conversation'}
                    </button>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-white/10 bg-slate-900/95 px-3 py-3 sm:px-4">
                {assistantConversationId && assistantShowFeedback && (
                  <div className="mb-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => rateConversation(true)}
                      disabled={assistantRatingLoading}
                      className="rounded-lg border border-emerald-300/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 disabled:opacity-60"
                    >
                      Pouce haut (memoriser)
                    </button>
                    <button
                      type="button"
                      onClick={() => rateConversation(false)}
                      disabled={assistantRatingLoading}
                      className="rounded-lg border border-rose-300/40 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-100 disabled:opacity-60"
                    >
                      Pouce bas (ne pas memoriser)
                    </button>
                  </div>
                )}
                {assistantFlowStatus && <p className="mb-2 text-xs text-emerald-300">{assistantFlowStatus}</p>}
                {assistantRatingLoading && assistantSaveProgress > 0 && (
                  <div className="mb-2">
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all duration-200"
                        style={{ width: `${assistantSaveProgress}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-emerald-200">Enregistrement du resume... {assistantSaveProgress}%</p>
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={assistantQuestion}
                    onChange={(event) => setAssistantQuestion(event.target.value)}
                    placeholder={displayName}
                    disabled={assistantShowFeedback}
                    className="min-h-11 flex-1 rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white outline-none focus:border-cyan-300"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={assistantListening ? stopVoiceInput : startVoiceInput}
                      disabled={assistantShowFeedback}
                      className={`min-h-11 rounded-xl px-3 text-xs font-semibold ${
                        assistantListening
                          ? 'bg-rose-500 text-white'
                          : 'border border-cyan-300/30 bg-slate-800 text-cyan-100'
                      }`}
                    >
                      {assistantListening ? 'Stop' : 'Parler'}
                    </button>
                    <button
                      type="button"
                      onClick={askAssistant}
                      disabled={assistantLoading || assistantShowFeedback || !assistantQuestion.trim()}
                      className="min-h-11 rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950 disabled:opacity-50"
                    >
                      {assistantLoading ? 'Analyse...' : 'Envoyer'}
                    </button>
                  </div>
                </div>
                {assistantError && <p className="mt-2 text-xs text-rose-300">{assistantError}</p>}
              </div>

              {assistantSummaryModalOpen && assistantSummaryPreview && (
                <div className="pointer-events-none absolute inset-0 flex items-start justify-center bg-black/45 p-4">
                  <div className="pointer-events-auto w-full max-w-xl rounded-2xl border border-emerald-300/30 bg-slate-900 p-4 shadow-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-emerald-100">Synthese conversation</p>
                        <p className="mt-1 text-[11px] text-slate-400">Grandes idees uniquement</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAssistantSummaryModalOpen(false)}
                        className="rounded-md border border-white/15 px-2 py-1 text-xs text-slate-200"
                      >
                        X
                      </button>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-slate-100">{assistantSummaryPreview}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/85 via-slate-900/75 to-slate-950/90 p-4 sm:p-6">
          <div className="flex flex-col items-center justify-center py-4 sm:py-8">
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-slate-400">Ajout rapide</p>
            <p className="mb-8 text-center text-sm text-slate-300">Clique sur le + et choisis ce que tu souhaites ajouter</p>

            <div className="relative flex h-[320px] w-[320px] items-center justify-center sm:h-[420px] sm:w-[420px]">
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.16)_0%,rgba(15,23,42,0)_68%)]" />
              <div className="absolute h-44 w-44 rounded-full border border-cyan-300/20 bg-cyan-300/5 sm:h-56 sm:w-56" />
              <div className="absolute h-60 w-60 rounded-full border border-cyan-300/10 sm:h-72 sm:w-72" />

              {quickCreateOptions.map((option, index) => {
                const angle = (-90 + index * (360 / quickCreateOptions.length)) * (Math.PI / 180);
                const radius = quickCreateOpen ? 142 : 0;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;

                return (
                  <Link
                    key={option.id}
                    href={option.link}
                    className={`absolute inline-flex h-20 w-20 flex-col items-center justify-center rounded-full border border-cyan-200/35 bg-slate-900/90 text-center shadow-[0_16px_30px_-20px_rgba(56,189,248,0.8)] transition-all duration-300 hover:border-cyan-200/70 hover:bg-slate-800 ${
                      quickCreateOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                    }`}
                    style={{
                      transform: `translate(${x}px, ${y}px) scale(${quickCreateOpen ? 1 : 0.5})`,
                    }}
                  >
                    <span className="text-lg">{option.icon}</span>
                    <span className="mt-1 px-1 text-[10px] font-medium leading-tight text-slate-100">{option.label}</span>
                  </Link>
                );
              })}

              <button
                type="button"
                onClick={() => setQuickCreateOpen((prev) => !prev)}
                className="relative z-10 inline-flex h-28 w-28 items-center justify-center rounded-full border border-cyan-100/80 bg-[conic-gradient(from_240deg,_#67e8f9,_#38bdf8,_#93c5fd,_#67e8f9)] text-6xl font-light leading-none text-slate-950 shadow-[0_24px_70px_-24px_rgba(34,211,238,0.95)] transition hover:scale-105"
              >
                <span className="absolute inset-1 rounded-full bg-gradient-to-br from-cyan-200 via-sky-200 to-blue-200" />
                <span className="relative">+</span>
              </button>
            </div>

            <div className="mt-7 flex w-full flex-wrap items-center justify-center gap-2 border-t border-white/10 pt-4">
              {discreetMenuLinks.map((entry) => (
                <Link
                  key={entry.id}
                  href={entry.link}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-300/50 hover:text-cyan-100"
                >
                  <span>{entry.icon}</span>
                  <span>{entry.title}</span>
                </Link>
              ))}
              <Link
                href="/dashboard/settings"
                className="inline-flex items-center rounded-full border border-white/15 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/30 hover:text-white"
              >
                Parametres
              </Link>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

function priorityWeight(priority: 'urgent' | 'high' | 'normal' | 'low'): number {
  if (priority === 'urgent') return 4;
  if (priority === 'high') return 3;
  if (priority === 'normal') return 2;
  return 1;
}

function suggestionPriorityPill(priority: 'urgent' | 'high' | 'normal' | 'low'): string {
  if (priority === 'urgent') return 'border-rose-300/45 bg-rose-500/20 text-rose-100';
  if (priority === 'high') return 'border-amber-300/45 bg-amber-500/20 text-amber-100';
  if (priority === 'normal') return 'border-cyan-300/40 bg-cyan-500/20 text-cyan-100';
  return 'border-slate-300/35 bg-slate-500/20 text-slate-200';
}

function uniqueNormalizedEmails(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const raw = String(value || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(raw);
  }

  return result;
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
