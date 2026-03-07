'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/auth/clientSession';
import { useI18n } from '@/components/providers/LanguageProvider';

type Memory = {
  id: string;
  title: string;
  type: string;
  content: string | null;
  structured_data: Record<string, unknown>;
  source_image?: string | null;
  rating: number | null;
  created_at: string;
};

type MemoryRelation = {
  id: string;
  relationType: string;
  relatedMemory: {
    id: string;
    title: string;
    type: string;
    rating: number | null;
  };
};

type ThemeProfile = {
  tokenSet: Set<string>;
  frequency: number;
};

type EnrichedMemory = Memory & {
  theme: string;
  scanDetail: string;
  thumbnail: string | null;
  searchableText: string;
  relevanceScore: number;
};

const DETECTED_THEME_LABELS: Record<string, { fr: string; en: string; es: string }> = {
  wine_label: { fr: 'Vin', en: 'Wine', es: 'Vino' },
  invoice: { fr: 'Facture', en: 'Invoice', es: 'Factura' },
  receipt: { fr: 'Ticket', en: 'Receipt', es: 'Recibo' },
  business_card: { fr: 'Carte de visite', en: 'Business card', es: 'Tarjeta' },
  document: { fr: 'Document', en: 'Document', es: 'Documento' },
  product: { fr: 'Produit', en: 'Product', es: 'Producto' },
  note: { fr: 'Note', en: 'Note', es: 'Nota' },
  unknown: { fr: 'General', en: 'General', es: 'General' },
};

function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function truncate(value: string, max = 160): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}...`;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .slice(0, 120);
}

function getTheme(memory: Memory, language: 'fr' | 'en' | 'es'): string {
  const structured = memory.structured_data || {};
  const explicitTheme = safeString(structured.theme || structured.category || structured.topic).trim();
  if (explicitTheme) return explicitTheme;

  const detectedType = safeString(structured.detected_type).trim().toLowerCase();
  if (detectedType && DETECTED_THEME_LABELS[detectedType]) {
    return DETECTED_THEME_LABELS[detectedType][language];
  }

  const type = memory.type?.trim();
  if (type) {
    return type
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  return 'General';
}

function getScanDetail(memory: Memory): string {
  const structured = memory.structured_data || {};
  const fromStructured = [
    safeString(structured.summary),
    safeString(structured.description),
    safeString(structured.raw_ocr_text),
  ]
    .find((entry) => entry.trim().length > 0)
    ?.trim();

  if (fromStructured) {
    return truncate(fromStructured.replace(/\s+/g, ' '), 180);
  }

  const content = safeString(memory.content).trim();
  if (content) {
    return truncate(content.replace(/\s+/g, ' '), 180);
  }

  return '';
}

function getThumbnail(memory: Memory): string | null {
  const source = safeString(memory.source_image).trim();
  if (!source) return null;

  const isDataImage = source.startsWith('data:image/');
  const isUrlImage = source.startsWith('http://') || source.startsWith('https://');
  return isDataImage || isUrlImage ? source : null;
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function MemoryListPage() {
  const { t, language } = useI18n();
  const locale = language === 'en' ? 'en-US' : language === 'es' ? 'es-ES' : 'fr-FR';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Memory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [relations, setRelations] = useState<MemoryRelation[]>([]);
  const [activeTheme, setActiveTheme] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'board'>('cards');
  const [validationCode, setValidationCode] = useState('');
  const [movingMemoryId, setMovingMemoryId] = useState<string | null>(null);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTheme, setEditTheme] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingMemoryId, setDeletingMemoryId] = useState<string | null>(null);

  const draftItems = useMemo(() => {
    return items.map((memory) => {
      const theme = getTheme(memory, language);
      const scanDetail = getScanDetail(memory);
      const thumbnail = getThumbnail(memory);
      const searchableText = [memory.title, memory.type, memory.content || '', theme, scanDetail]
        .join(' ')
        .toLowerCase();
      const tokenSet = new Set(tokenize(searchableText));

      return {
        ...memory,
        theme,
        scanDetail,
        thumbnail,
        searchableText,
        tokenSet,
      };
    });
  }, [items, language]);

  const themeProfiles = useMemo(() => {
    const buckets = new Map<string, Map<string, number>>();

    for (const item of draftItems) {
      const map = buckets.get(item.theme) || new Map<string, number>();
      for (const token of item.tokenSet) {
        map.set(token, (map.get(token) || 0) + 1);
      }
      buckets.set(item.theme, map);
    }

    const profiles = new Map<string, ThemeProfile>();
    for (const [theme, tokenMap] of buckets.entries()) {
      const sortedTokens = Array.from(tokenMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 24)
        .map(([token]) => token);

      profiles.set(theme, {
        tokenSet: new Set(sortedTokens),
        frequency: tokenMap.size,
      });
    }

    return profiles;
  }, [draftItems]);

  const enrichedItems = useMemo<EnrichedMemory[]>(() => {
    return draftItems.map((item) => {
      const profile = themeProfiles.get(item.theme);
      const overlap = profile
        ? Array.from(item.tokenSet).filter((token) => profile.tokenSet.has(token)).length
        : 0;
      const semanticDensity = profile ? overlap / Math.max(1, profile.tokenSet.size) : 0;
      const ratingBoost = (item.rating || 0) / 5;
      const recencyBoost = Math.max(0, 1 - (Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24 * 45));

      const relevanceScore = Number((semanticDensity * 0.55 + ratingBoost * 0.25 + recencyBoost * 0.2).toFixed(3));

      return {
        ...item,
        relevanceScore,
      };
    });
  }, [draftItems, themeProfiles]);

  const themeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of enrichedItems) {
      counts.set(item.theme, (counts.get(item.theme) || 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([theme, count]) => ({ theme, count }))
      .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));
  }, [enrichedItems]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    const selected = enrichedItems.filter((item) => {
      if (activeTheme !== 'all' && item.theme !== activeTheme) return false;
      if (query && !item.searchableText.includes(query)) return false;
      return true;
    });

    return selected.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }, [enrichedItems, activeTheme, search]);

  const boardThemes = useMemo(() => {
    const themes = themeCounts.map((entry) => entry.theme);
    return themes.slice(0, 8);
  }, [themeCounts]);

  const selectedMemory = useMemo(
    () => filteredItems.find((item) => item.id === selectedId) || filteredItems[0] || null,
    [filteredItems, selectedId]
  );

  async function loadMemories() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/memory/cards?limit=300', {
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json?.error || t('memory.list.errors.load'));
        return;
      }

      const memoryItems = (json.memories || []) as Memory[];
      setItems(memoryItems);
    } catch {
      setError(t('memory.list.errors.network'));
    } finally {
      setLoading(false);
    }
  }

  async function loadRelations(memoryId: string) {
    try {
      const response = await fetch(`/api/memory/relations/${memoryId}`, {
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (!response.ok) {
        setRelations([]);
        return;
      }
      setRelations((json.relations || []) as MemoryRelation[]);
    } catch {
      setRelations([]);
    }
  }

  async function setRating(memoryId: string, rating: number) {
    const response = await fetch(`/api/memory/cards/${memoryId}/rating`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ rating }),
    });

    if (!response.ok) return;
    await loadMemories();
    await loadRelations(memoryId);
  }

  async function moveMemoryToTheme(memoryId: string, targetTheme: string) {
    const memory = items.find((entry) => entry.id === memoryId);
    if (!memory) return;

    if (!validationCode.trim()) {
      setError(t('memory.list.validationCodeRequiredToMove'));
      return;
    }

    setMovingMemoryId(memoryId);
    setError(null);

    try {
      const response = await fetch(`/api/memory/cards/${memoryId}`, {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          validationCode,
          structured_data: {
            ...(memory.structured_data || {}),
            theme: targetTheme,
          },
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        setError(json?.error || t('memory.list.moveError'));
        return;
      }

      setItems((current) =>
        current.map((entry) =>
          entry.id === memoryId
            ? {
                ...entry,
                structured_data: {
                  ...(entry.structured_data || {}),
                  theme: targetTheme,
                },
              }
            : entry
        )
      );
    } catch {
      setError(t('memory.list.errors.network'));
    } finally {
      setMovingMemoryId(null);
    }
  }

  function openEdit(memory: EnrichedMemory) {
    setEditingMemoryId(memory.id);
    setEditTitle(memory.title || '');
    setEditContent(memory.content || '');
    setEditTheme(memory.theme || 'General');
    setError(null);
  }

  function closeEdit() {
    setEditingMemoryId(null);
    setEditTitle('');
    setEditContent('');
    setEditTheme('');
    setSavingEdit(false);
  }

  async function saveEdit() {
    if (!editingMemoryId) return;

    if (!validationCode.trim()) {
      setError(t('memory.list.validationCodeRequiredToEdit'));
      return;
    }

    const memory = items.find((entry) => entry.id === editingMemoryId);
    if (!memory) return;

    setSavingEdit(true);
    setError(null);

    try {
      const response = await fetch(`/api/memory/cards/${editingMemoryId}`, {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          validationCode,
          title: editTitle.trim(),
          content: editContent,
          structured_data: {
            ...(memory.structured_data || {}),
            theme: editTheme.trim() || 'General',
          },
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        setError(json?.error || t('memory.list.editError'));
        return;
      }

      setItems((current) =>
        current.map((entry) =>
          entry.id === editingMemoryId
            ? {
                ...entry,
                title: editTitle.trim() || entry.title,
                content: editContent,
                structured_data: {
                  ...(entry.structured_data || {}),
                  theme: editTheme.trim() || 'General',
                },
              }
            : entry
        )
      );

      closeEdit();
    } catch {
      setError(t('memory.list.errors.network'));
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteMemory(memoryId: string) {
    if (!window.confirm(t('memory.list.deleteConfirm'))) {
      return;
    }

    setDeletingMemoryId(memoryId);
    setError(null);

    try {
      const response = await fetch(`/api/memory/cards/${memoryId}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(false),
      });

      const json = await response.json();
      if (!response.ok) {
        setError(json?.error || t('memory.list.deleteError'));
        return;
      }

      setItems((current) => current.filter((entry) => entry.id !== memoryId));
      setRelations((current) => current.filter((entry) => entry.relatedMemory.id !== memoryId));
      if (selectedId === memoryId) {
        setSelectedId(null);
      }
    } catch {
      setError(t('memory.list.errors.network'));
    } finally {
      setDeletingMemoryId(null);
    }
  }

  useEffect(() => {
    loadMemories();
  }, []);

  useEffect(() => {
    if (!selectedMemory) {
      setRelations([]);
      return;
    }

    if (selectedId !== selectedMemory.id) {
      setSelectedId(selectedMemory.id);
    }

    loadRelations(selectedMemory.id);
  }, [selectedMemory?.id]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,_#1f3b4d_0%,_#0f172a_48%,_#020617_100%)] p-6 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-cyan-300/20 bg-slate-900/60 p-5 backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t('memory.list.title')}</h1>
              <p className="mt-1 text-sm text-slate-300">{t('memory.list.premiumSubtitle')}</p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/dashboard/memoire/scan"
                className="rounded-md border border-cyan-300/60 bg-cyan-500/20 px-3 py-2 text-sm hover:bg-cyan-500/35"
              >
                {t('memory.assistantScan')}
              </Link>
              <Link
                href="/dashboard/memoire"
                className="rounded-md border border-slate-600 px-3 py-2 text-sm hover:bg-slate-700"
              >
                {t('common.back')}
              </Link>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t('memory.list.totalCards')}</p>
              <p className="mt-1 text-xl font-semibold">{items.length}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t('memory.list.themesCount')}</p>
              <p className="mt-1 text-xl font-semibold">{themeCounts.length}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t('memory.list.ratedCards')}</p>
              <p className="mt-1 text-xl font-semibold">{items.filter((entry) => (entry.rating || 0) > 0).length}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">{t('memory.list.smartRanking')}</p>
              <p className="mt-1 text-xl font-semibold">{t('memory.list.smartRankingEnabled')}</p>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4 backdrop-blur">
          <div className="grid gap-3 md:grid-cols-[1fr,220px,220px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('memory.list.searchPlaceholder')}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
            />
            <select
              value={activeTheme}
              onChange={(event) => setActiveTheme(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
            >
              <option value="all">{t('memory.list.allThemes')}</option>
              {themeCounts.map((entry) => (
                <option key={entry.theme} value={entry.theme}>
                  {entry.theme} ({entry.count})
                </option>
              ))}
            </select>
            <input
              type="password"
              value={validationCode}
              onChange={(event) => setValidationCode(event.target.value)}
              placeholder={t('memory.list.validationCodePlaceholder')}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`rounded-md px-3 py-2 text-sm ${
                viewMode === 'cards'
                  ? 'bg-cyan-400 text-black'
                  : 'border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {t('memory.list.cardsView')}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`rounded-md px-3 py-2 text-sm ${
                viewMode === 'board'
                  ? 'bg-cyan-400 text-black'
                  : 'border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {t('memory.list.boardView')}
            </button>
            <p className="text-xs text-slate-400">{t('memory.list.dragHint')}</p>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-400/60 bg-red-500/10 p-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-6 text-sm text-slate-300">
            {t('common.loading')}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-6 text-sm text-slate-300">
            {t('memory.list.emptyFiltered')}
          </div>
        ) : viewMode === 'board' ? (
          <section className="overflow-auto rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <div className="flex min-w-max gap-4">
              {boardThemes.map((theme) => {
                const columnItems = filteredItems.filter((item) => item.theme === theme);
                return (
                  <div
                    key={theme}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const memoryId = event.dataTransfer.getData('text/memory-id');
                      if (memoryId) {
                        void moveMemoryToTheme(memoryId, theme);
                      }
                    }}
                    className="w-72 shrink-0 rounded-xl border border-slate-700 bg-slate-900 p-3"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-semibold text-cyan-200">{theme}</p>
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{columnItems.length}</span>
                    </div>

                    <div className="space-y-2">
                      {columnItems.map((memory) => (
                        <div
                          key={memory.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData('text/memory-id', memory.id);
                          }}
                          className="w-full rounded-lg border border-slate-700 bg-slate-800/70 p-2 text-left hover:border-cyan-400"
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedId(memory.id)}
                              className="line-clamp-2 text-left text-sm font-medium text-white"
                            >
                              {memory.title}
                            </button>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => openEdit(memory)}
                                className="rounded border border-slate-600 p-1 text-slate-200 hover:bg-slate-700"
                                aria-label={t('memory.list.editAria')}
                                title={t('memory.list.editAria')}
                              >
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                                  <path d="M3 17.25V21h3.75l11-11-3.75-3.75-11 11zm17.71-10.04a1 1 0 0 0 0-1.42l-2.5-2.5a1 1 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 2-1.79z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteMemory(memory.id)}
                                disabled={deletingMemoryId === memory.id}
                                className="rounded border border-red-500/60 p-1 text-red-300 hover:bg-red-500/20 disabled:opacity-60"
                                aria-label={t('memory.list.deleteAria')}
                                title={t('memory.list.deleteAria')}
                              >
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                                  <path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">{memory.relevanceScore.toFixed(3)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[2fr,1fr]">
            <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {filteredItems.map((memory) => (
                <article
                  key={memory.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/memory-id', memory.id);
                  }}
                  className={`overflow-hidden rounded-2xl border transition ${
                    selectedMemory?.id === memory.id
                      ? 'border-cyan-300 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(103,232,249,0.35)]'
                      : 'border-slate-700 bg-slate-900/70 hover:border-slate-500'
                  }`}
                >
                  <div className="relative">
                    <div className="relative h-28 w-full bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800">
                      {memory.thumbnail ? (
                        <img src={memory.thumbnail} alt={memory.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.2em] text-slate-400">
                          {t('memory.list.noPhoto')}
                        </div>
                      )}
                      <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wide text-cyan-100">
                        {memory.theme}
                      </span>
                      <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] text-emerald-200">
                        {memory.relevanceScore.toFixed(3)}
                      </span>
                      <div className="absolute bottom-2 right-2 flex gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(memory)}
                          className="rounded border border-slate-400/70 bg-black/60 p-1 text-slate-100 hover:bg-black/80"
                          aria-label={t('memory.list.editAria')}
                          title={t('memory.list.editAria')}
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                            <path d="M3 17.25V21h3.75l11-11-3.75-3.75-11 11zm17.71-10.04a1 1 0 0 0 0-1.42l-2.5-2.5a1 1 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 2-1.79z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMemory(memory.id)}
                          disabled={deletingMemoryId === memory.id}
                          className="rounded border border-red-400/70 bg-black/60 p-1 text-red-200 hover:bg-black/80 disabled:opacity-60"
                          aria-label={t('memory.list.deleteAria')}
                          title={t('memory.list.deleteAria')}
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
                            <path d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2z" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedId(memory.id)}
                      className="w-full space-y-2 p-3 text-left"
                    >
                      <h2 className="line-clamp-2 text-sm font-semibold text-white">{memory.title}</h2>
                      <p className="line-clamp-3 text-xs text-slate-300">
                        {memory.scanDetail || t('memory.list.noScanDetail')}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>{formatDate(memory.created_at, locale)}</span>
                        <span>{memory.type}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setRating(memory.id, value);
                            }}
                            className={`text-lg leading-none ${(memory.rating || 0) >= value ? 'text-amber-300' : 'text-slate-600'}`}
                            aria-label={t('memory.list.rateAria', { value })}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </button>
                  </div>
                </article>
              ))}
            </section>

            <aside className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
              {!selectedMemory ? (
                <p className="text-sm text-slate-400">{t('memory.list.selectMemory')}</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">{selectedMemory.theme}</p>
                    <h3 className="mt-1 text-xl font-semibold text-white">{selectedMemory.title}</h3>
                    <p className="mt-1 text-xs text-slate-400">{formatDate(selectedMemory.created_at, locale)}</p>
                    <p className="mt-1 text-xs text-emerald-300">
                      {t('memory.list.relevanceScore')}: {selectedMemory.relevanceScore.toFixed(3)}
                    </p>
                  </div>

                  {selectedMemory.scanDetail && (
                    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                      <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">{t('memory.list.scannedDetail')}</p>
                      <p className="text-sm text-slate-200">{selectedMemory.scanDetail}</p>
                    </div>
                  )}

                  {selectedMemory.content && (
                    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                      <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">{t('memory.list.content')}</p>
                      <p className="whitespace-pre-wrap text-sm text-slate-200">{selectedMemory.content}</p>
                    </div>
                  )}

                  <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                    <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">{t('memory.list.related')}</p>
                    {relations.length === 0 ? (
                      <p className="text-sm text-slate-400">{t('memory.list.noRelated')}</p>
                    ) : (
                      <div className="space-y-2">
                        {relations.map((relation) => (
                          <div key={relation.id} className="rounded-md border border-slate-700 bg-slate-900 p-2">
                            <p className="text-[10px] uppercase tracking-wide text-cyan-300">{relation.relationType}</p>
                            <p className="text-sm text-white">{relation.relatedMemory.title}</p>
                            <p className="text-xs text-slate-400">{relation.relatedMemory.type}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <details className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                    <summary className="cursor-pointer text-xs uppercase tracking-wide text-slate-300">
                      {t('memory.list.technicalData')}
                    </summary>
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-2 text-xs text-slate-200">
                      {JSON.stringify(selectedMemory.structured_data || {}, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </aside>
          </div>
        )}

        {movingMemoryId && (
          <div className="rounded-lg border border-cyan-400/60 bg-cyan-500/10 p-3 text-sm text-cyan-100">
            {t('memory.list.movingCard')}
          </div>
        )}

        {editingMemoryId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl">
              <h2 className="text-lg font-semibold text-white">{t('memory.list.editTitle')}</h2>

              <div className="mt-4 space-y-3">
                <label className="block text-xs uppercase tracking-wide text-slate-400">
                  {t('memory.list.editFieldTitle')}
                  <input
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  />
                </label>

                <label className="block text-xs uppercase tracking-wide text-slate-400">
                  {t('memory.list.editFieldTheme')}
                  <input
                    value={editTheme}
                    onChange={(event) => setEditTheme(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  />
                </label>

                <label className="block text-xs uppercase tracking-wide text-slate-400">
                  {t('memory.list.editFieldContent')}
                  <textarea
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                    rows={5}
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  />
                </label>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEdit}
                  className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-100 hover:bg-slate-700"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="rounded-md bg-cyan-400 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
                >
                  {savingEdit ? t('notifications.saving') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
