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

type AiProposal = {
  id: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  action: string;
  why: string;
  sender: string;
  email_message_id: string;
  source_type: string;
  status: string;
  generated_at: string;
  batch_id: string;
};

type SourceEventData = {
  subject: string | null;
  sender_name: string | null;
  sender_email: string | null;
  body_text: string | null;
  received_at: string | null;
  ai_summary: string | null;
  status?: string | null;
  archived?: boolean | null;
};

type SourceMarker = {
  id: string;
  action_type: string;
  action_label: string;
  action_comment: string;
  created_at: string;
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
  const [assistantSidebarOpen, setAssistantSidebarOpen] = useState(false);
  const [assistantName, setAssistantName] = useState('Assistant');
  const [assistantSummaryModalOpen, setAssistantSummaryModalOpen] = useState(false);
  const [assistantSummaryPreview, setAssistantSummaryPreview] = useState<string | null>(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);

  // — Propositions IA
  const [proposals, setProposals] = useState<AiProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [proposalsGeneratedAt, setProposalsGeneratedAt] = useState<string | null>(null);
  const [proposalsSummary, setProposalsSummary] = useState('');
  const [proposalsError, setProposalsError] = useState<string | null>(null);
  const [validatingProposalId, setValidatingProposalId] = useState<string | null>(null);
  const [validatingAllProposals, setValidatingAllProposals] = useState(false);
  const [propositionsOpen, setPropositionsOpen] = useState(false);
  // — Code mise à jour IA
  const [updateCodeOpen, setUpdateCodeOpen] = useState(false);
  const [updateCodeInput, setUpdateCodeInput] = useState('');
  const [updateCodeLoading, setUpdateCodeLoading] = useState(false);
  // — Feedback proposition (corriger / annuler / classer)
  const [proposalActionOpen, setProposalActionOpen] = useState(false);
  const [proposalActionType, setProposalActionType] = useState<'correct' | 'cancel' | 'classify'>('correct');
  const [proposalActionComment, setProposalActionComment] = useState('');
  const [proposalActionCorrected, setProposalActionCorrected] = useState('');
  const [proposalActionTarget, setProposalActionTarget] = useState<AiProposal | null>(null);
  const [proposalActionLoading, setProposalActionLoading] = useState(false);
  // — Guide animation
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideText, setGuideText] = useState('');
  // — Événement source d'une proposition
  const [sourceEventOpen, setSourceEventOpen] = useState(false);
  const [sourceEventData, setSourceEventData] = useState<SourceEventData | null>(null);
  const [sourceEventLoading, setSourceEventLoading] = useState(false);
  const [sourceEventMarkers, setSourceEventMarkers] = useState<SourceMarker[]>([]);
  const [processedEmailsCount, setProcessedEmailsCount] = useState(0);
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

  // Charge les propositions depuis la DB et auto-génère si besoin (toutes les 2h, 8h-18h)
  useEffect(() => {
    if (!user) return;

    const loadProposals = async () => {
      setProposalsLoading(true);
      setProposalsError(null);
      try {
        const res = await fetch('/api/email/proposals', {
          headers: await getAuthHeaders(false),
        });
        const json = (await res.json().catch(() => ({}))) as {
          proposals?: AiProposal[];
          generated_at?: string;
          error?: string;
        };
        if (!res.ok) {
          setProposalsError(json.error || 'Impossible de charger les propositions.');
          return;
        }
        const sorted = [...(json.proposals || [])].sort(
          (a, b) => proposalPriorityWeight(b.priority) - proposalPriorityWeight(a.priority)
        );
        setProposals(sorted.filter((p) => p.status === 'pending'));
        setProposalsGeneratedAt(json.generated_at || null);
      } catch {
        setProposalsError('Erreur reseau lors du chargement des propositions.');
      } finally {
        setProposalsLoading(false);
      }
    };

    const autoGenerate = async () => {
      try {
        const res = await fetch('/api/email/proposals', {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ mode: 'auto' }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          proposals?: AiProposal[];
          summary?: string;
          generated_at?: string;
          error?: string;
        };
        if (!res.ok) return;
        const sorted = [...(json.proposals || [])].sort(
          (a, b) => proposalPriorityWeight(b.priority) - proposalPriorityWeight(a.priority)
        );
        setProposals(sorted.filter((p) => p.status === 'pending'));
        setProposalsSummary(String(json.summary || ''));
        setProposalsGeneratedAt(json.generated_at || null);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('ai-proposals-last-gen', new Date().toISOString());
        }
      } catch {
        // Silencieux
      }
    };

    // Charge d'abord les données existantes
    loadProposals().then(() => {
      if (typeof window === 'undefined') return;
      const now = new Date();
      const hour = now.getHours();
      if (hour < 8 || hour >= 18) return;
      const lastGenStr = window.localStorage.getItem('ai-proposals-last-gen');
      if (!lastGenStr) {
        autoGenerate();
        return;
      }
      const diffHours = (now.getTime() - new Date(lastGenStr).getTime()) / (1000 * 60 * 60);
      if (diffHours >= 2) autoGenerate();
    });
  }, [user]);

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
    if (!user) return;

    const loadProcessedEmailKpi = async () => {
      const { count } = await supabase
        .from('email_messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('archived', true)
        .is('deleted_at', null);

      setProcessedEmailsCount(count || 0);
    };

    loadProcessedEmailKpi();
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

  const formatChatDayLabel = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;
    if (key === todayKey) return 'Aujourd hui';
    if (key === yesterdayKey) return 'Hier';
    return new Intl.DateTimeFormat(language, { weekday: 'short', day: '2-digit', month: 'short' }).format(date);
  };

  const assistantQuickPrompts = useMemo(
    () => [
      'Priorise ma journee en 3 actions.',
      'Que dois-je traiter en premier ?',
      'Resume mes urgences de ce matin.',
      'Prepare un plan d execution simple.',
    ],
    []
  );

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
          { label: 'Emails traites', value: String(processedEmailsCount) },
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
    processedEmailsCount,
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
    setAssistantSidebarOpen(false);
    setAssistantSummaryModalOpen(false);
    setAssistantSummaryPreview(null);
    setAssistantShowFeedback(false);
    setAssistantSaveProgress(0);
    setAssistantFlowStatus(null);
  };

  const openAssistantModal = () => {
    setAssistantModalOpen(true);
    setAssistantSidebarOpen(false);
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

  // openOnboardingShowcase est défini plus bas comme alias de openGuide

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
    setAssistantSidebarOpen(false);
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

  // Valide une proposition en créant une tâche pro
  const validateProposal = async (proposal: AiProposal) => {
    const emailId = String(proposal.email_message_id || '').trim();
    if (!emailId || validatingProposalId === proposal.id) return;

    setValidatingProposalId(proposal.id);
    setProposalsError(null);

    try {
      const response = await fetch(`/api/email/messages/${emailId}/task`, {
        method: 'POST',
        headers: await getAuthHeaders(),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setProposalsError(json.error || 'Impossible de creer la tache depuis la proposition.');
        return;
      }

      await fetch('/api/email/proposals', {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          proposalId: proposal.id,
          decision: 'validate',
          comment: 'Validation utilisateur',
        }),
      });

      // Retire la proposition validée de la liste
      setProposals((prev) => prev.filter((p) => p.id !== proposal.id));
      await fetchTasks();
      setProcessedEmailsCount((prev) => prev + 1);
    } catch {
      setProposalsError('Erreur reseau pendant la validation.');
    } finally {
      setValidatingProposalId(null);
    }
  };

  const openProposalActionModal = (
    proposal: AiProposal,
    decision: 'correct' | 'cancel' | 'classify'
  ) => {
    setProposalActionTarget(proposal);
    setProposalActionType(decision);
    setProposalActionComment('');
    setProposalActionCorrected(decision === 'correct' ? proposal.action : '');
    setProposalActionOpen(true);
  };

  const submitProposalActionFeedback = async () => {
    if (!proposalActionTarget?.id) return;
    const comment = proposalActionComment.trim();
    if (comment.length < 6) {
      setProposalsError('Ajoute un commentaire (minimum 6 caracteres).');
      return;
    }

    setProposalActionLoading(true);
    setProposalsError(null);
    try {
      const response = await fetch('/api/email/proposals', {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          proposalId: proposalActionTarget.id,
          decision: proposalActionType,
          comment,
          correctedAction: proposalActionType === 'correct' ? proposalActionCorrected.trim() : '',
        }),
      });

      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setProposalsError(json.error || 'Impossible d enregistrer ton retour.');
        return;
      }

      setProposals((prev) => prev.filter((p) => p.id !== proposalActionTarget.id));
      setProposalActionOpen(false);
      setProposalActionTarget(null);
      await fetchTasks();
      if (proposalActionType === 'classify') {
        setProcessedEmailsCount((prev) => prev + 1);
      }
    } catch {
      setProposalsError('Erreur reseau pendant l enregistrement du retour.');
    } finally {
      setProposalActionLoading(false);
    }
  };

  // Valide toutes les propositions en une fois
  const validateAllProposals = async () => {
    const pending = proposals.filter((p) => p.status === 'pending');
    if (pending.length === 0 || validatingAllProposals) return;

    setValidatingAllProposals(true);
    setProposalsError(null);

    const priorities = Array.from(new Set(pending.map((p) => p.priority))).filter(
      (priority): priority is 'urgent' | 'high' | 'normal' | 'low' =>
        ['urgent', 'high', 'normal', 'low'].includes(priority)
    );

    try {
      const response = await fetch('/api/email/summary/daily', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ priorities }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setProposalsError(json.error || 'Impossible de valider toutes les propositions.');
        return;
      }
      setProposals([]);
      await fetchTasks();
    } catch {
      setProposalsError('Erreur reseau pendant la validation globale.');
    } finally {
      setValidatingAllProposals(false);
    }
  };

  // Ouvre la modale de saisie du code securite configure dans Parametres > Mon IA
  const openUpdateCodeModal = () => {
    setUpdateCodeInput('');
    setUpdateCodeOpen(true);
  };

  // Verifie le code securite utilisateur et lance la generation manuelle
  const confirmUpdateCode = async () => {
    if (!updateCodeInput.trim()) return;
    setUpdateCodeOpen(false);
    setUpdateCodeLoading(true);
    setProposalsError(null);
    setProposalsLoading(true);
    try {
      const res = await fetch('/api/email/proposals', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          mode: 'manual',
          securityCode: updateCodeInput.trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        proposals?: AiProposal[];
        summary?: string;
        generated_at?: string;
        error?: string;
      };
      if (!res.ok) {
        setProposalsError(json.error || 'Erreur lors de la génération.');
        return;
      }
      const sorted = [...(json.proposals || [])].sort(
        (a, b) => proposalPriorityWeight(b.priority) - proposalPriorityWeight(a.priority)
      );
      setProposals(sorted.filter((p) => p.status === 'pending'));
      setProposalsSummary(String(json.summary || ''));
      setProposalsGeneratedAt(json.generated_at || null);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('ai-proposals-last-gen', new Date().toISOString());
      }
    } catch {
      setProposalsError('Erreur reseau lors de la generation.');
    } finally {
      setUpdateCodeLoading(false);
      setProposalsLoading(false);
    }
  };

  // Charge et affiche l'événement source d'une proposition
  const openSourceEvent = async (sourceId: string, sourceType: string) => {
    if (!sourceId) return;
    setSourceEventLoading(true);
    setSourceEventData(null);
    setSourceEventMarkers([]);
    setSourceEventOpen(true);
    try {
      if (sourceType === 'mail' || sourceType === 'courrier') {
        const [sourceRes, markerRes] = await Promise.all([
          fetch(`/api/mail/${sourceId}`, { headers: await getAuthHeaders(false) }),
          fetch(`/api/source-markers?source_type=${encodeURIComponent(sourceType)}&source_id=${encodeURIComponent(sourceId)}`, {
            headers: await getAuthHeaders(false),
          }),
        ]);

        const sourceJson = (await sourceRes.json().catch(() => ({}))) as { item?: any };
        const markerJson = (await markerRes.json().catch(() => ({}))) as { markers?: SourceMarker[] };

        if (sourceRes.ok && sourceJson.item) {
          setSourceEventData({
            subject: String(sourceJson.item.subject || ''),
            sender_name: String(sourceJson.item.sender_name || ''),
            sender_email: String(sourceJson.item.sender_email || ''),
            body_text: String(sourceJson.item.full_text || ''),
            received_at: String(sourceJson.item.received_at || ''),
            ai_summary: String(sourceJson.item.summary || ''),
            status: String(sourceJson.item.status || ''),
          });
        }

        if (markerRes.ok) {
          setSourceEventMarkers(markerJson.markers || []);
        }
        return;
      }

      const [res, markerRes] = await Promise.all([
        fetch(`/api/email/messages/${sourceId}`, {
          headers: await getAuthHeaders(false),
        }),
        fetch(`/api/source-markers?source_type=${encodeURIComponent(sourceType || 'email')}&source_id=${encodeURIComponent(sourceId)}`, {
          headers: await getAuthHeaders(false),
        }),
      ]);

      const json = (await res.json().catch(() => ({}))) as { item?: SourceEventData; error?: string };
      const markerJson = (await markerRes.json().catch(() => ({}))) as { markers?: SourceMarker[] };
      if (res.ok && json.item) setSourceEventData(json.item);
      if (markerRes.ok) setSourceEventMarkers(markerJson.markers || []);
    } catch {
      // Silencieux
    } finally {
      setSourceEventLoading(false);
    }
  };

  // Lance l'animation Guide (présentation de l'app)
  const openGuide = async () => {
    setGuideOpen(true);
    setGuideLoading(true);
    setGuideText('');
    try {
      const response = await fetch('/api/dashboard/assistant', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ action: 'onboarding_showcase' }),
      });
      const json = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!response.ok) {
        setGuideText(json.error || 'Impossible de lancer la presentation.');
        return;
      }
      setGuideText(String(json.message || 'Presentation indisponible.'));
      speakText(String(json.message || ''));
    } catch {
      setGuideText('Erreur reseau pendant la presentation.');
    } finally {
      setGuideLoading(false);
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

  const openOnboardingShowcase = openGuide; // alias conservé pour la section newcomer

  return (
    <div className="min-h-screen px-3 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        <section className="relative overflow-hidden rounded-2xl border border-cyan-200/15 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.22),transparent_48%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(15,23,42,0.82)_45%,rgba(8,47,73,0.7))] p-4 shadow-[0_35px_80px_-40px_rgba(14,116,144,0.95)] sm:rounded-3xl sm:p-5">
          <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-28 w-28 rounded-full bg-sky-400/10 blur-2xl" />

          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100/80">{t('dashboard.overview')}</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">Control Center</h1>
              <p className="mt-1 text-sm text-slate-300">Vue operationnelle centralisee pour piloter tes actions critiques.</p>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/45 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
              Systeme actif
            </div>
          </div>

          <div className="relative mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-3 sm:p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-300">Mon assistant</p>
              <p className="mt-1 text-base font-semibold text-cyan-100">{assistantName} te guide sur les emails, taches et priorites du jour.</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium text-slate-200">
                <span className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2.5 py-1">Contexte temps reel</span>
                <span className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2.5 py-1">Synthese immediate</span>
                <span className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2.5 py-1">Actions recommandees</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:min-w-72">
              <button
                type="button"
                onClick={openAssistantModal}
                className="group relative inline-flex min-h-16 items-center justify-between gap-3 overflow-hidden rounded-2xl border border-cyan-100/80 bg-[linear-gradient(125deg,#cffafe_0%,#93c5fd_50%,#67e8f9_100%)] px-5 py-3 text-left text-slate-950 shadow-[0_28px_62px_-26px_rgba(56,189,248,0.95)] transition duration-300 hover:-translate-y-0.5"
              >
                <span className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/35 blur-2xl transition group-hover:scale-110" />
                <span className="relative flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-900/15 bg-slate-950/10 text-xl shadow-inner">
                    🗣️
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-900/80">Assistant IA</span>
                    <span className="text-sm font-extrabold leading-tight">Discuter avec {assistantName}</span>
                  </span>
                </span>
                <span className="relative rounded-full border border-slate-900/20 bg-white/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-900">
                  Prioritaire
                </span>
              </button>

              <button
                type="button"
                onClick={openAssistantWithVoice}
                className="rounded-2xl border border-cyan-300/55 bg-cyan-500/15 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-500/25"
              >
                Demarrer en vocal
              </button>
            </div>
          </div>
        </section>

        {/* — Boutons Guide + Proposition IA — */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={openGuide}
            className="flex-1 rounded-2xl border border-indigo-300/30 bg-indigo-500/10 py-3 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-500/20 active:scale-95"
          >
            🎬 Guide
          </button>
          <button
            type="button"
            onClick={() => setPropositionsOpen((prev) => !prev)}
            className={`relative flex-1 rounded-2xl border py-3 text-sm font-semibold transition active:scale-95 ${
              propositionsOpen
                ? 'border-cyan-300/40 bg-cyan-500/15 text-cyan-100'
                : 'border-white/15 bg-slate-900/60 text-slate-200 hover:border-white/25'
            }`}
          >
            🤖 Proposition IA
            {proposals.length > 0 && (
              <span className="ml-2 rounded-full border border-cyan-300/50 bg-cyan-500/25 px-1.5 py-0.5 text-[11px] font-bold text-cyan-100">
                {proposals.length}
              </span>
            )}
          </button>
        </div>

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

        {/* — Panneau Propositions IA — */}
        {propositionsOpen && (
          <section className="rounded-3xl border border-white/10 bg-slate-900/75 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-200/80">Assistant IA</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Propositions d actions a valider</h2>
                <p className="mt-1 text-xs text-slate-300">
                  Generees automatiquement toutes les 2h de 8h a 18h et stockees.
                </p>
                {proposalsGeneratedAt && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Derniere generation : {new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(proposalsGeneratedAt))}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openUpdateCodeModal}
                  disabled={updateCodeLoading || proposalsLoading}
                  className="rounded-xl border border-indigo-300/35 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-100 transition hover:bg-indigo-500/20 disabled:opacity-50"
                >
                  {updateCodeLoading ? 'Generation...' : '🔄 Mettre a jour'}
                </button>
                <button
                  type="button"
                  onClick={validateAllProposals}
                  disabled={proposals.length === 0 || validatingAllProposals || proposalsLoading}
                  className="rounded-xl border border-emerald-300/35 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {validatingAllProposals ? 'Validation...' : 'Valider tout'}
                </button>
              </div>
            </div>

            {proposalsSummary && (
              <p className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
                {proposalsSummary}
              </p>
            )}
            {proposalsError && (
              <p className="mt-3 rounded-xl border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {proposalsError}
              </p>
            )}

            {proposalsLoading ? (
              <p className="mt-4 text-sm text-slate-300">Chargement des propositions...</p>
            ) : proposals.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">
                Aucune proposition en attente. Utilise "Mettre a jour" pour en generer.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {proposals.map((proposal) => {
                  const isValidating = validatingProposalId === proposal.id;
                  return (
                    <div key={proposal.id} className="rounded-2xl border border-white/10 bg-slate-950/45 p-3">
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${suggestionPriorityPill(proposal.priority)}`}>
                            {proposal.priority}
                          </span>
                          <span className="truncate text-xs text-slate-400">{proposal.sender || 'Expediteur'}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-100">{proposal.action}</p>
                        <p className="mt-1 text-xs text-slate-400">{proposal.why}</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {proposal.email_message_id && (
                          <button
                            type="button"
                            onClick={() => openSourceEvent(proposal.email_message_id, proposal.source_type || 'email')}
                            className="rounded-lg border border-slate-300/20 bg-slate-800/60 px-2.5 py-1 text-[11px] text-slate-300 transition hover:border-slate-300/40 hover:text-slate-100"
                            title="Voir l evenement source"
                          >
                            Origine 🔍
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openProposalActionModal(proposal, 'correct')}
                          className="rounded-lg border border-indigo-300/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-100 transition hover:bg-indigo-500/20"
                        >
                          Corriger
                        </button>
                        <button
                          type="button"
                          onClick={() => openProposalActionModal(proposal, 'cancel')}
                          className="rounded-lg border border-rose-300/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-500/20"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={() => openProposalActionModal(proposal, 'classify')}
                          className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-500/20"
                        >
                          Classer
                        </button>
                        <button
                          type="button"
                          onClick={() => validateProposal(proposal)}
                          disabled={!proposal.email_message_id || isValidating}
                          className="rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-50"
                        >
                          {isValidating ? 'Creation...' : 'Valider'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {assistantModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-2 sm:p-5" onClick={closeAssistantModal}>
            <div
              className="relative mx-auto flex h-[95dvh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-cyan-200/20 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 shadow-[0_40px_120px_-40px_rgba(34,211,238,0.55)] sm:h-[95vh]"
              onClick={(event) => event.stopPropagation()}
            >
              <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-200/75">Assistant IA</p>
                  <h2 className="text-base font-semibold text-white">Discuter avec {assistantName}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAssistantSidebarOpen((prev) => !prev)}
                    className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 lg:hidden"
                  >
                    {assistantSidebarOpen ? 'Masquer conversations' : 'Conversations'}
                  </button>
                  <button
                    type="button"
                    onClick={startNewConversation}
                    className="rounded-xl border border-emerald-300/35 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/25"
                  >
                    Nouvelle discussion
                  </button>
                  <button
                    type="button"
                    onClick={closeAssistantModal}
                    className="rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
                  >
                    Fermer
                  </button>
                </div>
              </header>

              <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_1fr]">
                <aside className={`${assistantSidebarOpen ? 'block' : 'hidden'} min-h-0 border-b border-white/10 bg-slate-950/35 p-3 lg:block lg:border-b-0 lg:border-r`}>
                  <label className="mb-3 inline-flex w-full items-center gap-2 rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={assistantAllowInternet}
                      onChange={(event) => setAssistantAllowInternet(event.target.checked)}
                      className="h-3.5 w-3.5 accent-cyan-400"
                    />
                    Autoriser recherche internet
                  </label>

                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Conversations</p>
                    <span className="text-[11px] text-slate-500">{assistantConversations.length}</span>
                  </div>

                  <div className="max-h-[28vh] space-y-1 overflow-y-auto lg:max-h-[62vh]">
                    {assistantConversations.length === 0 ? (
                      <p className="rounded-xl border border-white/10 bg-slate-900/40 p-3 text-xs text-slate-400">
                        Aucune conversation pour le moment.
                      </p>
                    ) : (
                      assistantConversations.map((conversation) => (
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={() => openConversation(conversation)}
                          className={`w-full rounded-xl border p-2.5 text-left transition ${
                            assistantConversationId === conversation.id
                              ? 'border-cyan-300/35 bg-cyan-500/12'
                              : 'border-white/10 bg-slate-900/45 hover:border-white/25'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-semibold text-slate-100">{conversation.title || 'Discussion'}</p>
                            <span className="text-[10px] text-slate-500">{formatRelativeDate(conversation.last_message_at)}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{conversation.summary || 'Sans resume'}</p>
                        </button>
                      ))
                    )}
                  </div>
                </aside>

                <section className={`${assistantSidebarOpen ? 'hidden' : 'flex'} min-h-0 flex-col lg:flex`}>
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-950/20 px-4 py-4">
                    {assistantMessages.length === 0 ? (
                      <div className="mx-auto mt-8 max-w-xl rounded-2xl border border-white/10 bg-slate-900/45 p-5 text-center">
                        <p className="text-sm font-semibold text-cyan-100">Commence une discussion avec Noa</p>
                        <p className="mt-2 text-xs text-slate-400">
                          1. Choisis une conversation a gauche ou cree-en une nouvelle.
                          2. Pose ta question en bas.
                          3. Utilise le micro si tu preferes parler.
                        </p>
                      </div>
                    ) : (
                      assistantMessages.map((message, index) => {
                        const previous = index > 0 ? assistantMessages[index - 1] : null;
                        const dayKey = new Date(message.created_at).toDateString();
                        const previousDayKey = previous ? new Date(previous.created_at).toDateString() : null;
                        const showDaySeparator = !previous || dayKey !== previousDayKey;

                        return (
                          <div key={message.id}>
                            {showDaySeparator && (
                              <div className="my-2 flex items-center gap-2">
                                <div className="h-px flex-1 bg-white/10" />
                                <p className="text-[10px] uppercase tracking-wide text-slate-500">
                                  {formatChatDayLabel(message.created_at)}
                                </p>
                                <div className="h-px flex-1 bg-white/10" />
                              </div>
                            )}
                            <div
                              className={`max-w-[92%] rounded-2xl border px-3 py-2.5 text-sm ${
                                message.role === 'assistant'
                                  ? 'mr-auto border-cyan-300/25 bg-cyan-500/10 text-cyan-50'
                                  : 'ml-auto border-white/10 bg-slate-800/95 text-slate-100'
                              }`}
                            >
                              <p className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
                                {message.role === 'assistant' ? assistantName : userLabel}
                              </p>
                              <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                              {message.role === 'assistant' && (
                                <button
                                  type="button"
                                  onClick={() => speakText(message.content)}
                                  className="mt-2 rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-100 transition hover:bg-cyan-500/20"
                                >
                                  Lire
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}

                    {assistantConversationId && assistantMessages.length > 0 && !assistantShowFeedback && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={closeConversation}
                          disabled={assistantFinalizing || selectedConversation?.status === 'closed'}
                          className="rounded-xl border border-cyan-300/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-60"
                        >
                          {assistantFinalizing ? 'Cloture...' : 'Fin de conversation'}
                        </button>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="border-t border-white/10 bg-slate-900/90 px-4 py-3">
                    {assistantConversationId && assistantShowFeedback && (
                      <div className="mb-2 flex flex-wrap items-center gap-2">
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

                    {!assistantShowFeedback && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {assistantQuickPrompts.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => setAssistantQuestion(prompt)}
                            className="rounded-full border border-white/15 bg-slate-800/65 px-3 py-1 text-[11px] text-slate-300 transition hover:border-cyan-300/40 hover:text-cyan-100"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        value={assistantQuestion}
                        onChange={(event) => setAssistantQuestion(event.target.value)}
                        placeholder={displayName}
                        disabled={assistantShowFeedback}
                        className="min-h-12 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-300"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={assistantListening ? stopVoiceInput : startVoiceInput}
                          disabled={assistantShowFeedback}
                          className={`min-h-12 rounded-xl px-3 text-xs font-semibold ${
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
                          className="min-h-12 rounded-xl bg-cyan-400 px-4 text-sm font-semibold text-slate-950 disabled:opacity-50"
                        >
                          {assistantLoading ? 'Analyse...' : 'Envoyer'}
                        </button>
                      </div>
                    </div>
                    {assistantError && <p className="mt-2 text-xs text-rose-300">{assistantError}</p>}
                  </div>
                </section>
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

        {/* — Modale Guide : animation de presentation — */}
        {guideOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setGuideOpen(false)}>
            <div
              className="relative w-full max-w-2xl rounded-3xl border border-indigo-300/20 bg-gradient-to-br from-slate-900 via-indigo-950/60 to-slate-900 p-6 shadow-[0_40px_80px_-30px_rgba(99,102,241,0.5)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-indigo-300/80">Presentation interactive</p>
                  <h2 className="mt-1 text-xl font-bold text-white">Guide Control Center</h2>
                </div>
                <button type="button" onClick={() => setGuideOpen(false)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                  Fermer
                </button>
              </div>
              {guideLoading ? (
                <div className="space-y-3 py-6">
                  <div className="flex items-center justify-center gap-3">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.3s]" />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.15s]" />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-indigo-400" />
                  </div>
                  <p className="text-center text-sm text-slate-300">Preparation de la presentation...</p>
                </div>
              ) : (
                <div className="max-h-[60vh] overflow-y-auto">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">{guideText}</p>
                </div>
              )}
              {!guideLoading && guideText && (
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => speakText(guideText)}
                    className="rounded-lg border border-indigo-300/30 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-100 hover:bg-indigo-500/20"
                  >
                    Ecouter
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* — Modale code IA pour mise a jour — */}
        {updateCodeOpen && (
          <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Code securite</p>
              <h2 className="mt-1 text-lg font-bold text-white">Mise a jour des propositions</h2>
              <p className="mt-2 text-sm text-slate-300">
                Saisis ton code de securite configure dans Parametres &gt; Mon IA.
              </p>
              <input
                type="tel"
                value={updateCodeInput}
                onChange={(e) => setUpdateCodeInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                placeholder="Entrez votre code"
                maxLength={10}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                enterKeyHint="done"
                className="w-full rounded-xl border border-white/15 bg-slate-800 px-4 py-3 text-center text-xl font-mono tracking-[0.3em] text-white outline-none focus:border-cyan-300"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') confirmUpdateCode(); }}
              />
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setUpdateCodeOpen(false)}
                  className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={confirmUpdateCode}
                  disabled={updateCodeInput.trim().length < 4}
                  className="flex-1 rounded-xl bg-cyan-400 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                >
                  Confirmer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* — Modale feedback proposition — */}
        {proposalActionOpen && proposalActionTarget && (
          <div className="fixed inset-0 z-[66] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => !proposalActionLoading && setProposalActionOpen(false)}>
            <div
              className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-200/80">Retour utilisateur</p>
              <h2 className="mt-1 text-lg font-bold text-white">
                {proposalActionType === 'correct' ? 'Corriger la proposition' : proposalActionType === 'cancel' ? 'Annuler la proposition' : 'Classer la demande'}
              </h2>
              <p className="mt-2 text-sm text-slate-300">Ton commentaire est obligatoire et sert a ajuster le prompt IA.</p>

              <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/50 p-3">
                <p className="text-xs text-slate-400">Action proposee</p>
                <p className="mt-1 text-sm text-slate-100">{proposalActionTarget.action}</p>
              </div>

              {proposalActionType === 'correct' && (
                <div className="mt-3 space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Action corrigee</label>
                  <input
                    value={proposalActionCorrected}
                    onChange={(e) => setProposalActionCorrected(e.target.value)}
                    placeholder="Ex: Repondre avec proposition de rendez-vous jeudi 14h"
                    className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-cyan-400/60"
                  />
                </div>
              )}

              <div className="mt-3 space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Commentaire (obligatoire)</label>
                <textarea
                  value={proposalActionComment}
                  onChange={(e) => setProposalActionComment(e.target.value)}
                  rows={4}
                  placeholder="Explique l erreur IA pour ameliorer les prochaines propositions..."
                  className="w-full resize-y rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
                />
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setProposalActionOpen(false)}
                  disabled={proposalActionLoading}
                  className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  onClick={submitProposalActionFeedback}
                  disabled={proposalActionLoading || proposalActionComment.trim().length < 6 || (proposalActionType === 'correct' && !proposalActionCorrected.trim())}
                  className="flex-1 rounded-xl bg-cyan-400 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                >
                  {proposalActionLoading ? 'Enregistrement...' : 'Confirmer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* — Modale evenement source d'une proposition — */}
        {sourceEventOpen && (
          <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setSourceEventOpen(false)}>
            <div
              className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Email source</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Origine de la proposition</h2>
                </div>
                <button type="button" onClick={() => setSourceEventOpen(false)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
                  Fermer
                </button>
              </div>
              {sourceEventLoading ? (
                <p className="text-sm text-slate-300">Chargement de l email source...</p>
              ) : !sourceEventData ? (
                <p className="text-sm text-slate-400">Email source introuvable.</p>
              ) : (
                <div className="space-y-3">
                  {sourceEventMarkers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {sourceEventMarkers.map((marker) => (
                        <span
                          key={marker.id}
                          className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-500/12 px-2.5 py-1 text-[11px] font-medium text-cyan-100"
                          title={marker.action_comment || marker.action_label}
                        >
                          {marker.action_label}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                    <p className="text-sm font-semibold text-white">{sourceEventData.subject || '(sans objet)'}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      De : {sourceEventData.sender_name || sourceEventData.sender_email || '—'} · {sourceEventData.received_at ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(sourceEventData.received_at)) : ''}
                    </p>
                    {(sourceEventData.status || typeof sourceEventData.archived === 'boolean') && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        Statut source: {sourceEventData.status || (sourceEventData.archived ? 'traitee' : 'active')}
                      </p>
                    )}
                  </div>
                  {sourceEventData.ai_summary && (
                    <div className="rounded-xl border border-indigo-300/15 bg-indigo-500/5 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-indigo-300">Resume IA</p>
                      <p className="mt-1 text-sm text-slate-200">{sourceEventData.ai_summary}</p>
                    </div>
                  )}
                  {sourceEventData.body_text && (
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/60 p-3">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">Contenu</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-slate-300">{sourceEventData.body_text.slice(0, 1200)}{sourceEventData.body_text.length > 1200 ? '...' : ''}</p>
                    </div>
                  )}
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

// Alias utilisé pour les propositions stockées en DB
function proposalPriorityWeight(priority: string): number {
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
