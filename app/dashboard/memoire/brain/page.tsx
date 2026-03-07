'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getAuthHeaders } from '@/lib/auth/clientSession';

type Memory = {
  id: string;
  title: string;
  type: string;
  content: string | null;
  structured_data: Record<string, unknown>;
  rating: number | null;
  source: string | null;
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
  createdAt: string;
};

type SearchResult = {
  id: string;
  title: string;
  similarity: number;
};

type SubscriptionFeatures = {
  memory?: boolean;
  ai?: boolean;
};

const MEMORY_TYPES = [
  'wine',
  'invoice',
  'receipt',
  'business_card',
  'document',
  'note',
  'idea',
  'contact',
  'other',
];

export default function MemoryBrainPage() {
  const [items, setItems] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardLoading, setGuardLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [relations, setRelations] = useState<MemoryRelation[]>([]);

  const [title, setTitle] = useState('');
  const [type, setType] = useState('note');
  const [content, setContent] = useState('');
  const [structuredDataText, setStructuredDataText] = useState('{}');

  const [validationCode, setValidationCode] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [askQuestion, setAskQuestion] = useState('');
  const [askAnswer, setAskAnswer] = useState('');
  const [targetRelationId, setTargetRelationId] = useState('');
  const [relationType, setRelationType] = useState('related_to');
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  const selectedMemory = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId]
  );

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/memory/cards?limit=200', {
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || 'Erreur chargement memoires');
      }

      setItems(json.memories || []);
      if (json.memories?.[0]?.id) {
        setSelectedId((prev) => prev || json.memories[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  const checkAccess = useCallback(async () => {
    setGuardLoading(true);
    try {
      const response = await fetch('/api/settings/subscription', {
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();

      if (!response.ok) {
        setHasAccess(false);
        return;
      }

      const features = (json?.subscription?.features || {}) as SubscriptionFeatures;
      setHasAccess(Boolean(features.memory && features.ai));
    } catch (err) {
      console.error('Failed to check AI access:', err);
      setHasAccess(false);
    } finally {
      setGuardLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  useEffect(() => {
    if (hasAccess) {
      loadMemories();
    }
  }, [hasAccess, loadMemories]);

  useEffect(() => {
    const loadRelations = async () => {
      if (!selectedId) {
        setRelations([]);
        return;
      }

      const response = await fetch(`/api/memory/relations/${selectedId}`, {
        headers: await getAuthHeaders(false),
      });
      const json = await response.json();
      if (response.ok) {
        setRelations(json.relations || []);
      }
    };

    loadRelations();
  }, [selectedId]);

  async function createMemory(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let parsedStructuredData: Record<string, unknown> = {};
    try {
      parsedStructuredData = JSON.parse(structuredDataText || '{}');
    } catch {
      setError('structured_data doit etre un JSON valide');
      return;
    }

    const response = await fetch('/api/memory/cards', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        title,
        type,
        content,
        validationCode,
        structured_data: parsedStructuredData,
        source: 'manual',
      }),
    });

    const json = await response.json();
    if (!response.ok) {
      setError(json?.error || 'Erreur creation memoire');
      return;
    }

    setTitle('');
    setContent('');
    setStructuredDataText('{}');
    await loadMemories();
    setSelectedId(json.memory.id);
  }

  async function updateMemory() {
    if (!selectedMemory) return;

    setError(null);

    let parsedStructuredData: Record<string, unknown> = {};
    try {
      parsedStructuredData = JSON.parse(structuredDataText || '{}');
    } catch {
      setError('structured_data doit etre un JSON valide');
      return;
    }

    const response = await fetch(`/api/memory/cards/${selectedMemory.id}`, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        title,
        type,
        content,
        validationCode,
        structured_data: parsedStructuredData,
      }),
    });

    const json = await response.json();
    if (!response.ok) {
      setError(json?.error || 'Erreur mise a jour memoire');
      return;
    }

    await loadMemories();
    setSelectedId(json.memory.id);
  }

  async function rateMemory(memoryId: string, rating: number) {
    const response = await fetch(`/api/memory/cards/${memoryId}/rating`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ rating }),
    });

    if (!response.ok) {
      return;
    }

    await loadMemories();
  }

  async function removeMemory(memoryId: string) {
    const response = await fetch(`/api/memory/cards/${memoryId}`, {
      method: 'DELETE',
      headers: await getAuthHeaders(false),
    });

    if (!response.ok) {
      return;
    }

    if (selectedId === memoryId) {
      setSelectedId(null);
    }

    await loadMemories();
  }

  async function runSemanticSearch() {
    setError(null);
    const response = await fetch('/api/memory/search', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        query: searchQuery,
        validationCode,
        limit: 8,
      }),
    });

    const json = await response.json();
    if (!response.ok) {
      setError(json?.error || 'Erreur recherche IA');
      return;
    }

    setSearchResults(json.results || []);
  }

  async function askAgent() {
    setAskAnswer('');
    setError(null);

    const response = await fetch('/api/memory/ask', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        question: askQuestion,
        validationCode,
      }),
    });

    const json = await response.json();
    if (!response.ok) {
      setError(json?.error || 'Erreur agent');
      return;
    }

    setAskAnswer(json.answer || 'Pas de reponse');
  }

  async function createRelation() {
    if (!selectedMemory || !targetRelationId || targetRelationId === selectedMemory.id) {
      return;
    }

    const response = await fetch('/api/memory/relations', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        from_memory: selectedMemory.id,
        to_memory: targetRelationId,
        relation_type: relationType,
      }),
    });

    if (!response.ok) {
      const json = await response.json();
      setError(json?.error || 'Erreur creation relation');
      return;
    }

    setTargetRelationId('');
    const relResponse = await fetch(`/api/memory/relations/${selectedMemory.id}`, {
      headers: await getAuthHeaders(false),
    });
    const relJson = await relResponse.json();
    if (relResponse.ok) {
      setRelations(relJson.relations || []);
    }
  }

  async function onImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const base64 = await fileToBase64(file);
    setImageBase64(base64);
  }

  async function ingestImageMemory() {
    if (!imageBase64) {
      setError('Selectionnez une image');
      return;
    }

    const response = await fetch('/api/memory/ingest', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({
        imageBase64,
        validationCode,
      }),
    });

    const json = await response.json();
    if (!response.ok) {
      setError(json?.error || 'Erreur ingestion OCR');
      return;
    }

    setImageBase64(null);
    await loadMemories();
    if (json?.memory?.id) {
      setSelectedId(json.memory.id);
      fillFromSelection(json.memory);
    }
  }

  function fillFromSelection(memory: Memory) {
    setSelectedId(memory.id);
    setTitle(memory.title || '');
    setType(memory.type || 'note');
    setContent(memory.content || '');
    setStructuredDataText(JSON.stringify(memory.structured_data || {}, null, 2));
  }

  if (guardLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-4 text-white">
        <div className="mx-auto max-w-5xl rounded-xl border border-slate-700 bg-slate-900/60 p-6">
          Verification abonnement en cours...
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-4 text-white">
        <div className="mx-auto max-w-5xl rounded-xl border border-amber-400/40 bg-amber-500/10 p-6 space-y-3">
          <h1 className="text-2xl font-semibold">AI Brain verrouille</h1>
          <p className="text-sm text-amber-100">
            Cette page necessite les modules Memory + AI actives dans l&apos;abonnement.
          </p>
          <Link href="/dashboard/settings" className="inline-block rounded-md bg-white px-3 py-2 text-sm text-black">
            Aller aux parametres
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 p-4">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">Memory Module</p>
            <h1 className="text-3xl font-semibold text-white">AI Memory Brain</h1>
            <p className="text-sm text-slate-300">Creer, relier, noter et interroger vos cartes memoire.</p>
          </div>
          <Link
            href="/dashboard/memoire"
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-100 hover:bg-slate-700"
          >
            Retour collections
          </Link>
        </div>

        {error && (
          <div className="rounded-lg border border-red-400/60 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-base font-medium text-white">Memory Dashboard</h2>
            <p className="mb-3 text-xs text-slate-400">{items.length} cartes memoire</p>

            {loading ? (
              <p className="text-sm text-slate-400">Chargement...</p>
            ) : (
              <div className="max-h-[440px] space-y-2 overflow-auto pr-1">
                {items.map((memory) => (
                  <div
                    key={memory.id}
                    className={`rounded-lg border p-3 ${
                      selectedId === memory.id
                        ? 'border-emerald-300 bg-emerald-500/10'
                        : 'border-slate-700 bg-slate-800/60'
                    }`}
                  >
                    <button
                      onClick={() => fillFromSelection(memory)}
                      className="w-full text-left"
                    >
                      <p className="text-sm font-medium text-white">{memory.title}</p>
                      <p className="text-xs uppercase tracking-wide text-emerald-300">{memory.type}</p>
                    </button>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            onClick={() => rateMemory(memory.id, value)}
                            className={`text-xs ${
                              (memory.rating || 0) >= value ? 'text-amber-300' : 'text-slate-500'
                            }`}
                            title={`Noter ${value}/5`}
                          >
                            ★
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => removeMemory(memory.id)}
                        className="rounded bg-red-600/80 px-2 py-1 text-xs text-white hover:bg-red-500"
                      >
                        Suppr.
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-base font-medium text-white">Create / Edit Memory</h2>
            <form className="space-y-3" onSubmit={createMemory}>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Titre"
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                required
              />

              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              >
                {MEMORY_TYPES.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>

              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Contenu / resume"
                rows={4}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              />

              <textarea
                value={structuredDataText}
                onChange={(e) => setStructuredDataText(e.target.value)}
                rows={5}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-xs text-white"
              />

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-black hover:bg-emerald-400"
                >
                  Creer
                </button>
                <button
                  type="button"
                  onClick={updateMemory}
                  disabled={!selectedMemory}
                  className="flex-1 rounded-md bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:opacity-50"
                >
                  Modifier
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-base font-medium text-white">Memory Relationships</h2>
            {!selectedMemory ? (
              <p className="text-sm text-slate-400">Selectionnez une memoire.</p>
            ) : relations.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune relation pour cette memoire.</p>
            ) : (
              <div className="space-y-2">
                {relations.map((relation) => (
                  <div key={relation.id} className="rounded-lg border border-slate-700 bg-slate-800 p-2">
                    <p className="text-xs uppercase text-emerald-300">{relation.relationType}</p>
                    <p className="text-sm text-white">{relation.relatedMemory.title}</p>
                  </div>
                ))}
              </div>
            )}

            {selectedMemory && (
              <div className="mt-4 space-y-2 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
                <p className="text-xs text-slate-300">Connecter cette memoire</p>
                <select
                  value={targetRelationId}
                  onChange={(e) => setTargetRelationId(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white"
                >
                  <option value="">Choisir une memoire cible</option>
                  {items
                    .filter((memory) => memory.id !== selectedMemory.id)
                    .map((memory) => (
                      <option key={memory.id} value={memory.id}>
                        {memory.title}
                      </option>
                    ))}
                </select>
                <input
                  value={relationType}
                  onChange={(e) => setRelationType(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white"
                  placeholder="relation_type"
                />
                <button
                  onClick={createRelation}
                  className="w-full rounded-md bg-emerald-500 px-3 py-2 text-sm font-medium text-black"
                >
                  Connecter
                </button>
              </div>
            )}
          </section>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-base font-medium text-white">Semantic Search</h2>
            <div className="space-y-2">
              <input
                value={validationCode}
                onChange={(e) => setValidationCode(e.target.value)}
                placeholder="Code de validation IA"
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ex: meilleur vin note"
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
              />
              <button
                onClick={runSemanticSearch}
                className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black"
              >
                Rechercher
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {searchResults.map((result) => (
                <div key={result.id} className="rounded-md border border-slate-700 bg-slate-800 p-2">
                  <p className="text-sm text-white">{result.title}</p>
                  <p className="text-xs text-slate-400">Score: {Number(result.similarity || 0).toFixed(3)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-base font-medium text-white">Ingestion Image OCR - GPT</h2>
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*"
                onChange={onImageSelected}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white file:mr-2 file:rounded file:border-0 file:bg-emerald-500 file:px-2 file:py-1 file:text-xs file:font-medium file:text-black"
              />
              <button
                onClick={ingestImageMemory}
                className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black"
              >
                Scanner et creer memoire
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <h2 className="mb-3 text-base font-medium text-white">AI Memory Agent</h2>
            <textarea
              value={askQuestion}
              onChange={(e) => setAskQuestion(e.target.value)}
              rows={4}
              placeholder="Ex: Quel est le meilleur vin que j'ai note ?"
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            />
            <button
              onClick={askAgent}
              className="mt-2 rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-black hover:bg-emerald-400"
            >
              Poser la question
            </button>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-100">{askAnswer}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(String(reader.result || ''));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
