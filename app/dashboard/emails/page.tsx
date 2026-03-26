"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { getAuthHeaders } from '@/lib/auth/clientSession';
import type { EmailMessage, EmailReplyDraft } from '@/types/emailAssistant';

type MessageWithDrafts = EmailMessage & {
  email_reply_drafts?: EmailReplyDraft[];
};

type StatsPayload = {
  stats: {
    total: number;
    to_reply: number;
    drafts_ready: number;
    sent: number;
    archived: number;
    addressed_to_me: number;
    copied_me: number;
  };
  latest: Array<{
    id: string;
    subject: string | null;
    sender_email: string | null;
    received_at: string | null;
    ai_action: string;
    response_status: string;
  }>;
};

type DailySummaryPayload = {
  day: string;
  count: number;
  summary: string;
  actions: Array<{
    priority: 'urgent' | 'high' | 'normal' | 'low';
    action: string;
    why: string;
    sender: string;
    email_message_id: string;
  }>;
};

const priorityLabel: Record<string, string> = {
  urgent: 'Urgent',
  high: 'Haute',
  normal: 'Normale',
  low: 'Basse',
};

const actionLabel: Record<string, string> = {
  classer: 'Classer',
  repondre: 'Repondre',
};

export default function EmailAssistantPage() {
  const user = useAuthStore((s) => s.user);
  const userEmail = String(user?.email || '').trim().toLowerCase();

  const [items, setItems] = useState<MessageWithDrafts[]>([]);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threadItems, setThreadItems] = useState<MessageWithDrafts[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);

  const showOk = (msg: string) => {
    setFeedback({ type: 'ok', message: msg });
    setTimeout(() => setFeedback(null), 3500);
  };
  const showErr = (msg: string) => {
    setFeedback({ type: 'err', message: msg });
    setTimeout(() => setFeedback(null), 5000);
  };

  const [actionFilter, setActionFilter] = useState<'all' | 'classer' | 'repondre'>('all');
  const [responseFilter, setResponseFilter] = useState<'all' | 'none' | 'draft_ready' | 'sent' | 'cancelled'>('all');
  const [archiveView, setArchiveView] = useState<'active' | 'archived' | 'all'>('active');
  const [recipientRole, setRecipientRole] = useState<'all' | 'to' | 'cc'>('all');

  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [daySummary, setDaySummary] = useState<DailySummaryPayload | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [creatingSummaryTasks, setCreatingSummaryTasks] = useState(false);
  const [autoCreateScope, setAutoCreateScope] = useState<'urgent' | 'urgent_high' | 'all'>('urgent_high');
  const [summaryDate, setSummaryDate] = useState(() => toDateInputValue(new Date()));

  const selected = useMemo(
    () => items.find((entry) => entry.id === selectedId) || null,
    [items, selectedId]
  );

  const currentDraft = useMemo(() => {
    if (!selected?.email_reply_drafts?.length) return null;
    return selected.email_reply_drafts.find((draft) => draft.is_current) || selected.email_reply_drafts[0];
  }, [selected]);

  useEffect(() => {
    setDraftSubject(currentDraft?.proposed_subject || selected?.subject || '');
    setDraftBody(currentDraft?.proposed_body || '');
  }, [currentDraft?.id, selected?.id]);

  useEffect(() => {
    if (!selected?.id) return;

    const hasBody = Boolean(String(selected.body_text || '').trim() || String(selected.body_html || '').trim());
    if (hasBody) return;

    let cancelled = false;

    const hydrateBody = async () => {
      const res = await fetch(`/api/email/messages/${selected.id}`, {
        headers: await getAuthHeaders(false),
      });
      const json = (await res.json().catch(() => ({}))) as { item?: MessageWithDrafts };
      if (!res.ok || !json.item || cancelled) return;

      setItems((prev) => prev.map((entry) => (entry.id === selected.id ? { ...entry, ...json.item } : entry)));
    };

    hydrateBody();
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.body_text, selected?.body_html]);

  const loadStats = useCallback(async () => {
    if (!user) return;
    const statsQs = new URLSearchParams();
    if (userEmail) statsQs.set('me', userEmail);
    const res = await fetch(`/api/email/stats?${statsQs.toString()}`, {
      headers: await getAuthHeaders(false),
    });
    const json = (await res.json()) as StatsPayload;
    if (res.ok) setStats(json);
  }, [user, userEmail]);

  const loadThreadMessages = useCallback(
    async (message: MessageWithDrafts | null) => {
      if (!user || !message) return;
      if (!message.thread_id) {
        setThreadItems([message]);
        return;
      }

      setThreadLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set('thread_id', message.thread_id);
        qs.set('limit', '200');
        const res = await fetch(`/api/email/messages?${qs.toString()}`, {
          headers: await getAuthHeaders(false),
        });
        const json = (await res.json().catch(() => ({}))) as { items?: MessageWithDrafts[] };
        if (!res.ok) {
          setThreadItems([message]);
          return;
        }
        const thread = (json.items || []).sort((a, b) => {
          const dateA = new Date(a.received_at || a.created_at).getTime();
          const dateB = new Date(b.received_at || b.created_at).getTime();
          return dateA - dateB;
        });
        setThreadItems(thread.length > 0 ? thread : [message]);
      } finally {
        setThreadLoading(false);
      }
    },
    [user]
  );

  const loadMessages = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const qs = new URLSearchParams();
    if (actionFilter !== 'all') qs.set('action', actionFilter);
    if (responseFilter !== 'all') qs.set('response_status', responseFilter);
    if (archiveView === 'active') qs.set('archived', '0');
    if (archiveView === 'archived') qs.set('archived', '1');
    if (recipientRole !== 'all') qs.set('recipient_role', recipientRole);
    if (userEmail) qs.set('me', userEmail);

    try {
      const res = await fetch(`/api/email/messages?${qs.toString()}`, {
        headers: await getAuthHeaders(false),
      });
      const json = (await res.json()) as { items?: MessageWithDrafts[] };
      if (!res.ok) return;
      const nextItems = json.items || [];
      setItems(nextItems);
      setSelectedId((prev) => {
        if (prev && nextItems.some((entry) => entry.id === prev)) return prev;
        return nextItems[0]?.id || null;
      });
    } finally {
      setLoading(false);
    }
  }, [user, actionFilter, responseFilter, archiveView, recipientRole, userEmail]);

  useEffect(() => {
    if (!user) return;
    loadMessages();
    loadStats();
  }, [user, loadMessages, loadStats]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (user) loadMessages();
    }, 280);
    return () => clearTimeout(timer);
  }, [actionFilter, responseFilter, archiveView, recipientRole]);

  const refreshAll = async () => {
    await Promise.all([loadMessages(), loadStats()]);
  };

  const openResponseManager = () => {
    setArchiveView('active');
    setRecipientRole('all');
    setActionFilter('repondre');
    setResponseFilter('all');
  };

  const openRecipientList = (role: 'to' | 'cc') => {
    setArchiveView('active');
    setActionFilter('all');
    setResponseFilter('all');
    setRecipientRole(role);
  };

  const openVolume = (volume: 'total' | 'to_reply' | 'drafts' | 'sent' | 'archives') => {
    setRecipientRole('all');
    setActionFilter('all');
    setResponseFilter('all');
    setArchiveView('active');

    if (volume === 'to_reply') {
      setActionFilter('repondre');
      return;
    }
    if (volume === 'drafts') {
      setResponseFilter('draft_ready');
      return;
    }
    if (volume === 'sent') {
      setResponseFilter('sent');
      return;
    }
    if (volume === 'archives') {
      setArchiveView('archived');
    }
  };

  const openMessageModal = async (message: MessageWithDrafts) => {
    setSelectedId(message.id);
    setMessageModalOpen(true);
    await loadThreadMessages(message);
  };

  const openDailySummary = async () => {
    setLoadingSummary(true);
    setSummaryOpen(true);
    try {
      const query = new URLSearchParams();
      if (summaryDate) query.set('date', summaryDate);
      const res = await fetch(`/api/email/summary/daily?${query.toString()}`, {
        headers: await getAuthHeaders(false),
      });
      const json = (await res.json().catch(() => ({}))) as DailySummaryPayload & { error?: string };
      if (!res.ok) {
        showErr(json.error || `Erreur ${res.status} lors de la synthese`);
        setSummaryOpen(false);
        return;
      }
      setDaySummary(json);
    } finally {
      setLoadingSummary(false);
    }
  };

  const autoCreateSummaryTasks = async () => {
    setCreatingSummaryTasks(true);
    try {
      const priorities =
        autoCreateScope === 'urgent'
          ? ['urgent']
          : autoCreateScope === 'all'
            ? ['urgent', 'high', 'normal', 'low']
            : ['urgent', 'high'];

      const res = await fetch('/api/email/summary/daily', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ priorities, date: summaryDate }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        created?: number;
        skipped?: number;
      };

      if (!res.ok) {
        showErr(json.error || `Erreur ${res.status} lors de la creation auto des taches`);
        return;
      }

      const created = Number(json.created || 0);
      const skipped = Number(json.skipped || 0);
      showOk(`Taches IA-MAIL creees: ${created} (ignorees: ${skipped})`);
    } finally {
      setCreatingSummaryTasks(false);
    }
  };

  const generateDraft = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/email/messages/${selected.id}/draft`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ tone: 'professionnel' }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        showErr(err.error || `Erreur ${res.status} lors de la generation du brouillon`);
        return;
      }
      showOk('Brouillon genere avec succes.');
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/email/messages/${selected.id}/draft`, {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ subject: draftSubject, body: draftBody }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        showErr(err.error || `Erreur ${res.status} lors de la sauvegarde`);
        return;
      }
      showOk('Brouillon sauvegarde.');
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const sendDraft = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/email/messages/${selected.id}/send`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ subject: draftSubject, body: draftBody }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        showErr(err.error || `Erreur ${res.status} lors de l'envoi`);
        return;
      }
      showOk('Email envoye avec succes.');
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const deleteDraft = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/email/messages/${selected.id}/draft`, {
        method: 'DELETE',
        headers: await getAuthHeaders(false),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        showErr(err.error || `Erreur ${res.status} lors de la suppression du brouillon`);
        return;
      }
      showOk('Brouillon supprime.');
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const archiveMessage = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/email/messages/${selected.id}`, {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ archived: true, ai_action: 'classer', response_required: false }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        showErr(err.error || `Erreur ${res.status} lors du classement`);
        return;
      }
      showOk('Email classe sans action.');
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const createProTask = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/email/messages/${selected.id}/task`, {
        method: 'POST',
        headers: await getAuthHeaders(false),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        task?: { title?: string | null };
        generated?: { action_note?: string | null };
      };

      if (!res.ok) {
        showErr(json.error || `Erreur ${res.status} lors de la creation de la tache`);
        return;
      }

      const taskTitle = String(json.task?.title || '').trim();
      const actionNote = String(json.generated?.action_note || '').trim();
      const successMessage = taskTitle
        ? `Tache pro creee: ${taskTitle}${actionNote ? ` | Action: ${actionNote}` : ''}`
        : 'Tache pro creee avec succes.';
      showOk(successMessage);
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const removeMessage = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/email/messages/${selected.id}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(false),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        showErr(err.error || `Erreur ${res.status} lors de la suppression`);
        return;
      }
      showOk('Email supprime.');
      await refreshAll();
    } finally {
      setBusy(false);
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) return 'N/A';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-3 pb-24 sm:px-4">
      {feedback && (
        <div className={`fixed right-4 top-4 z-50 max-w-sm rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl transition ${
          feedback.type === 'ok'
            ? 'border-emerald-300/30 bg-emerald-500/15 text-emerald-100'
            : 'border-rose-300/30 bg-rose-500/15 text-rose-100'
        }`}>
          {feedback.message}
        </div>
      )}
      <section className="rounded-3xl border border-indigo-200/10 bg-gradient-to-r from-slate-900/80 via-slate-900/75 to-indigo-950/60 p-4 sm:p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-indigo-200/70">Email Assistant</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">Gestion intelligente des emails</h1>
        <p className="mt-2 text-sm text-slate-300">Tri IA, proposition de reponse, validation avant envoi, journalisation complete.</p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            onClick={openResponseManager}
            className="min-h-11 w-full rounded-xl bg-indigo-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-indigo-300 sm:w-auto"
          >
            Gerer les reponses
          </button>
          <button
            onClick={openDailySummary}
            className="min-h-11 w-full rounded-xl border border-cyan-300/35 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/20 sm:w-auto"
          >
            Synthese journee
          </button>
          <button
            onClick={refreshAll}
            className="min-h-11 w-full rounded-xl border border-white/15 bg-slate-900/50 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800 sm:w-auto"
          >
            Actualiser
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-7">
        <StatCard
          label="Total"
          value={String(stats?.stats.total ?? 0)}
          color="text-slate-100"
          active={archiveView === 'active' && actionFilter === 'all' && responseFilter === 'all' && recipientRole === 'all'}
          onClick={() => openVolume('total')}
        />
        <StatCard
          label="A repondre"
          value={String(stats?.stats.to_reply ?? 0)}
          color="text-amber-300"
          active={actionFilter === 'repondre' && archiveView === 'active' && recipientRole === 'all'}
          onClick={() => openVolume('to_reply')}
        />
        <StatCard
          label="Brouillons"
          value={String(stats?.stats.drafts_ready ?? 0)}
          color="text-indigo-300"
          active={responseFilter === 'draft_ready' && archiveView === 'active' && recipientRole === 'all'}
          onClick={() => openVolume('drafts')}
        />
        <StatCard
          label="Envoyes"
          value={String(stats?.stats.sent ?? 0)}
          color="text-emerald-300"
          active={responseFilter === 'sent' && archiveView === 'active' && recipientRole === 'all'}
          onClick={() => openVolume('sent')}
        />
        <button
          onClick={() => openRecipientList('to')}
          className={`rounded-xl border p-3 text-left transition ${
            recipientRole === 'to'
              ? 'border-cyan-300/35 bg-cyan-500/10'
              : 'border-white/10 bg-slate-900/65 hover:border-white/20'
          }`}
        >
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Adresses (A)</p>
          <p className="mt-1 text-xl font-semibold text-cyan-200">{String(stats?.stats.addressed_to_me ?? 0)}</p>
        </button>
        <button
          onClick={() => openRecipientList('cc')}
          className={`rounded-xl border p-3 text-left transition ${
            recipientRole === 'cc'
              ? 'border-violet-300/35 bg-violet-500/10'
              : 'border-white/10 bg-slate-900/65 hover:border-white/20'
          }`}
        >
          <p className="text-[11px] uppercase tracking-wide text-slate-400">En copie (CC)</p>
          <p className="mt-1 text-xl font-semibold text-violet-200">{String(stats?.stats.copied_me ?? 0)}</p>
        </button>
        <button
          onClick={() => openVolume('archives')}
          className={`rounded-xl border p-3 text-left transition ${
            archiveView === 'archived'
              ? 'border-indigo-300/35 bg-indigo-500/10'
              : 'border-white/10 bg-slate-900/65 hover:border-white/20'
          }`}
        >
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Archives</p>
          <p className="mt-1 text-xl font-semibold text-slate-400">{String(stats?.stats.archived ?? 0)}</p>
        </button>
      </section>

      <section className="grid grid-cols-1 gap-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/65 p-2">
          <div className="mb-2 px-2 text-xs text-slate-400">
            {archiveView === 'archived'
              ? `Messages archives (${items.length})`
              : archiveView === 'all'
                ? `Tous les messages (${items.length})`
                : `Inbox IA (${items.length})`}
          </div>
          <div className="space-y-1.5">
            {loading && <p className="rounded-xl border border-white/10 bg-slate-950/35 p-3 text-xs text-slate-400">Chargement...</p>}
            {!loading && items.length === 0 && (
              <p className="rounded-xl border border-white/10 bg-slate-950/35 p-3 text-xs text-slate-400">Aucun email pour ces filtres.</p>
            )}
            {!loading && items.map((item) => {
              const isSelected = selectedId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => openMessageModal(item)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? 'border-indigo-300/40 bg-indigo-500/10'
                      : 'border-white/10 bg-slate-950/35 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-white">{item.subject || '(sans objet)'}</p>
                    <span className="rounded-full border border-white/10 bg-slate-900/80 px-2 py-0.5 text-[10px] text-slate-300">
                      {actionLabel[item.ai_action] || item.ai_action}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-400">{item.sender_name || item.sender_email || 'expediteur inconnu'}</p>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{formatDate(item.received_at)}</span>
                    <span>{item.response_status}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {messageModalOpen && selected && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Echange email</h2>
                <p className="text-xs text-slate-400">Thread complet + actions IA</p>
              </div>
              <button
                onClick={() => setMessageModalOpen(false)}
                className="min-h-10 rounded-lg border border-white/15 bg-slate-900/60 px-2.5 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
                aria-label="Fermer le detail email"
                title="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{selected.subject || '(sans objet)'}</h2>
                    <p className="text-xs text-slate-400">De: {selected.sender_name || '-'} &lt;{selected.sender_email || '-'}&gt;</p>
                    <p className="mt-1 text-xs text-slate-500">A: {(selected.to_emails || []).join(', ') || '-'}</p>
                    {selected.cc_emails?.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">CC: {selected.cc_emails.join(', ')}</p>
                    )}
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <p>{formatDate(selected.received_at)}</p>
                    <p className="mt-1">Priorite: {priorityLabel[selected.ai_priority || 'normal'] || 'Normale'}</p>
                  </div>
                </div>
                <p className="mt-3 break-words text-sm text-slate-200">{selected.ai_summary || 'Aucun resume IA.'}</p>
                <p className="mt-2 text-xs text-slate-500">Decision IA: <span className="text-slate-200">{actionLabel[selected.ai_action] || selected.ai_action}</span> · Confiance: {selected.ai_confidence ?? 0}</p>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-950/35 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Fil de discussion</p>
                {threadLoading && <p className="text-sm text-slate-400">Chargement du thread...</p>}
                {!threadLoading && threadItems.length === 0 && (
                  <p className="text-sm text-slate-400">Aucun message dans cet echange.</p>
                )}
                {!threadLoading && threadItems.length > 0 && (
                  <div className="space-y-2">
                    {threadItems.map((msg) => (
                      <div key={msg.id} className={`rounded-lg border p-3 ${msg.id === selected.id ? 'border-indigo-300/35 bg-indigo-500/10' : 'border-white/10 bg-slate-900/60'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                          <span>{msg.sender_name || msg.sender_email || '-'}</span>
                          <span>{formatDate(msg.received_at)}</span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-white">{msg.subject || '(sans objet)'}</p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">{msg.body_text || msg.body_html || '(contenu vide)'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-indigo-300/20 bg-indigo-500/5 p-3">
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-indigo-100">Brouillon de reponse</p>
                  <button
                    onClick={generateDraft}
                    disabled={busy}
                    className="min-h-10 rounded-lg border border-indigo-300/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-100 hover:bg-indigo-500/20 disabled:opacity-50"
                  >
                    {busy ? '...' : 'Generer / Regenerer IA'}
                  </button>
                </div>

                <input
                  value={draftSubject}
                  onChange={(event) => setDraftSubject(event.target.value)}
                  placeholder="Objet de reponse"
                  className="mb-2 w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none focus:border-indigo-300"
                />
                <textarea
                  value={draftBody}
                  onChange={(event) => setDraftBody(event.target.value)}
                  placeholder="Reponse proposee"
                  rows={8}
                  className="w-full resize-y rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white outline-none focus:border-indigo-300"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={createProTask}
                    disabled={busy}
                    className="min-h-11 w-full rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50 sm:w-auto"
                  >
                    Creer une tache pro (IA)
                  </button>
                  <button
                    onClick={sendDraft}
                    disabled={busy || !draftBody.trim()}
                    className="min-h-11 w-full rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50 sm:w-auto"
                  >
                    Envoyer
                  </button>
                  <button
                    onClick={saveDraft}
                    disabled={busy || !draftBody.trim()}
                    className="min-h-11 w-full rounded-lg border border-white/15 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-50 sm:w-auto"
                  >
                    Modifier / Sauvegarder
                  </button>
                  <button
                    onClick={deleteDraft}
                    disabled={busy}
                    className="min-h-11 w-full rounded-lg border border-rose-300/35 bg-rose-500/10 px-4 py-2 text-sm text-rose-100 hover:bg-rose-500/20 disabled:opacity-50 sm:w-auto"
                  >
                    Supprimer brouillon
                  </button>
                  <button
                    onClick={archiveMessage}
                    disabled={busy}
                    className="min-h-11 w-full rounded-lg border border-amber-300/35 bg-amber-500/10 px-4 py-2 text-sm text-amber-100 hover:bg-amber-500/20 disabled:opacity-50 sm:w-auto"
                  >
                    Classer sans action
                  </button>
                  <button
                    onClick={removeMessage}
                    disabled={busy}
                    className="min-h-11 w-full rounded-lg border border-red-300/35 bg-red-500/10 px-4 py-2 text-sm text-red-100 hover:bg-red-500/20 disabled:opacity-50 sm:w-auto"
                  >
                    Supprimer email
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {summaryOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Synthese de la journee</h2>
                <p className="text-xs text-slate-400">Priorisation des actions sur les emails du jour</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  onClick={() => setSummaryOpen(false)}
                  className="min-h-10 rounded-lg border border-white/15 bg-slate-900/60 px-2.5 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
                  aria-label="Fermer la synthese"
                  title="Fermer"
                >
                  ✕
                </button>
                <select
                  value={autoCreateScope}
                  onChange={(event) => setAutoCreateScope(event.target.value as typeof autoCreateScope)}
                  disabled={creatingSummaryTasks || loadingSummary}
                  className="min-h-10 rounded-lg border border-white/15 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-100 disabled:opacity-50"
                >
                  <option value="urgent">Auto: urgent uniquement</option>
                  <option value="urgent_high">Auto: urgent + high</option>
                  <option value="all">Auto: toutes priorites</option>
                </select>
                <button
                  onClick={autoCreateSummaryTasks}
                  disabled={creatingSummaryTasks || loadingSummary || !daySummary}
                  className="min-h-10 rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
                >
                  {creatingSummaryTasks ? 'Creation...' : 'Auto-creer taches pro (IA-MAIL)'}
                </button>
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-900/60 p-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="flex min-w-[180px] flex-col">
                <label className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Date de synthese</label>
                <input
                  type="date"
                  value={summaryDate}
                  onChange={(event) => setSummaryDate(event.target.value)}
                  className="min-h-11 rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSummaryDate(toDateInputValue(new Date()))}
                  className="min-h-10 rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                >
                  Aujourd'hui
                </button>
                <button
                  onClick={() => setSummaryDate(toDateInputValue(shiftDays(new Date(), -1)))}
                  className="min-h-10 rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                >
                  Hier
                </button>
                <button
                  onClick={() => setSummaryDate(toDateInputValue(startOfWeekMonday(new Date())))}
                  className="min-h-10 rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"
                >
                  Lundi semaine
                </button>
              </div>
              <button
                onClick={openDailySummary}
                disabled={loadingSummary}
                className="min-h-11 rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
              >
                {loadingSummary ? 'Chargement...' : 'Actualiser la synthese'}
              </button>
            </div>

            {loadingSummary && <p className="text-sm text-slate-300">Generation de la synthese...</p>}

            {!loadingSummary && daySummary && (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                  <p className="text-xs text-slate-400">{daySummary.day} · {daySummary.count} emails</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-100">{daySummary.summary}</p>
                </div>

                <div className="space-y-2">
                  {daySummary.actions.length === 0 && (
                    <p className="rounded-xl border border-white/10 bg-slate-900/60 p-3 text-sm text-slate-300">
                      Aucune action prioritaire detectee pour le moment.
                    </p>
                  )}

                  {daySummary.actions.map((action, index) => (
                    <div key={`${action.email_message_id}-${index}`} className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${priorityBadge(action.priority)}`}>
                          {action.priority}
                        </span>
                        <span className="text-xs text-slate-400">{action.sender}</span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-white">{action.action}</p>
                      <p className="mt-1 text-xs text-slate-300">{action.why}</p>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setSummaryOpen(false)}
                    className="rounded-lg border border-white/15 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                  >
                    Fermer la modale
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function priorityBadge(priority: 'urgent' | 'high' | 'normal' | 'low'): string {
  if (priority === 'urgent') return 'bg-rose-500/20 text-rose-200 border border-rose-300/40';
  if (priority === 'high') return 'bg-amber-500/20 text-amber-200 border border-amber-300/40';
  if (priority === 'low') return 'bg-slate-500/20 text-slate-200 border border-slate-300/40';
  return 'bg-indigo-500/20 text-indigo-200 border border-indigo-300/40';
}

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shiftDays(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

function startOfWeekMonday(date: Date): Date {
  const next = new Date(date);
  const day = next.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + delta);
  return next;
}

function StatCard(props: { label: string; value: string; color: string; onClick?: () => void; active?: boolean }) {
  const baseClass = `rounded-xl border p-3 text-left transition ${
    props.active
      ? 'border-indigo-300/35 bg-indigo-500/10'
      : 'border-white/10 bg-slate-900/65 hover:border-white/20'
  }`;

  if (props.onClick) {
    return (
      <button onClick={props.onClick} className={baseClass}>
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{props.label}</p>
        <p className={`mt-1 text-xl font-semibold ${props.color}`}>{props.value}</p>
      </button>
    );
  }

  return (
    <article className={baseClass}>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{props.label}</p>
      <p className={`mt-1 text-xl font-semibold ${props.color}`}>{props.value}</p>
    </article>
  );
}
