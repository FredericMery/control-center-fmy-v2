'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/auth/clientSession';

type Memory = {
  id: string;
  title: string;
  type: string;
  content: string | null;
  structured_data: Record<string, unknown>;
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

export default function MemoryListPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Memory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [relations, setRelations] = useState<MemoryRelation[]>([]);

  const selectedMemory = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId]
  );

  async function loadMemories() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/memory/cards?limit=200', {
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json?.error || 'Erreur chargement memoires');
        return;
      }

      const memoryItems = (json.memories || []) as Memory[];
      setItems(memoryItems);
      setSelectedId((prev) => prev || memoryItems[0]?.id || null);
    } catch {
      setError('Erreur reseau');
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

  useEffect(() => {
    loadMemories();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setRelations([]);
      return;
    }
    loadRelations(selectedId);
  }, [selectedId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-6 text-white">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Memory list</h1>
            <p className="text-sm text-slate-300">Memory card, rating system, related memories.</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/memoire/scan"
              className="rounded-md border border-emerald-300/60 px-3 py-2 text-sm hover:bg-emerald-500/20"
            >
              Scan
            </Link>
            <Link
              href="/dashboard/memoire"
              className="rounded-md border border-slate-600 px-3 py-2 text-sm hover:bg-slate-700"
            >
              Retour
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-400/60 bg-red-500/10 p-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-200">
              Memories
            </h2>
            {loading ? (
              <p className="text-sm text-slate-400">Chargement...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune memoire.</p>
            ) : (
              <div className="max-h-[560px] space-y-2 overflow-auto pr-1">
                {items.map((memory) => (
                  <button
                    key={memory.id}
                    onClick={() => setSelectedId(memory.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      selectedId === memory.id
                        ? 'border-emerald-300 bg-emerald-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">{memory.title}</p>
                    <p className="text-xs uppercase tracking-wide text-emerald-300">{memory.type}</p>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-200">Memory detail</h2>
            {!selectedMemory ? (
              <p className="text-sm text-slate-400">Selectionnez une memoire.</p>
            ) : (
              <>
                <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4 space-y-2">
                  <h3 className="text-lg font-semibold text-white">{selectedMemory.title}</h3>
                  <p className="text-xs uppercase tracking-wide text-emerald-300">{selectedMemory.type}</p>
                  {selectedMemory.content && (
                    <p className="text-sm text-slate-200">{selectedMemory.content}</p>
                  )}
                  <p className="text-xs text-slate-400">
                    {new Date(selectedMemory.created_at).toLocaleString('fr-FR')}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
                  <p className="mb-2 text-sm text-slate-200">Rating</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        onClick={() => setRating(selectedMemory.id, value)}
                        className={`text-xl ${
                          (selectedMemory.rating || 0) >= value ? 'text-amber-300' : 'text-slate-600'
                        }`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
                  <p className="mb-2 text-sm text-slate-200">Related memories</p>
                  {relations.length === 0 ? (
                    <p className="text-sm text-slate-400">Aucune relation pour cette memoire.</p>
                  ) : (
                    <div className="space-y-2">
                      {relations.map((relation) => (
                        <div key={relation.id} className="rounded-md border border-slate-700 bg-slate-900 p-2">
                          <p className="text-xs uppercase text-emerald-300">{relation.relationType}</p>
                          <p className="text-sm text-white">{relation.relatedMemory.title}</p>
                          <p className="text-xs text-slate-400">{relation.relatedMemory.type}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
