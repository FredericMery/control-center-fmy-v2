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
            <button
              type="button"
              onClick={openAssistantModal}
              className="group relative inline-flex min-h-16 items-center gap-3 overflow-hidden rounded-2xl border border-cyan-100/80 bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-300 px-6 py-3 text-base font-extrabold tracking-wide text-slate-950 shadow-[0_18px_46px_-18px_rgba(56,189,248,0.95)] transition hover:scale-[1.03] hover:from-cyan-200 hover:to-blue-200"
            >
              <span className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white/40 to-transparent opacity-60 transition group-hover:opacity-90" />
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/10 text-xl">
                ✨
              </span>
              <span className="rounded-full border border-slate-900/20 bg-white/35 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-900">
                {assistantName}
              </span>
              Lancer la conversation avec {assistantName}
            </button>
          </div>
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
                      {assistantListening ? 'Stop micro' : 'Micro'}
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
