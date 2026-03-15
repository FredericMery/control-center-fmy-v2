import { create } from 'zustand';
import { getAuthHeaders } from '@/lib/auth/clientSession';

type AgendaSource = {
  id: string;
  provider: string;
  label: string;
  is_enabled: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
};

type AgendaEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  source_provider: string;
  status: string;
};

type ProposalSlot = {
  startAt: string;
  endAt: string;
  score: number;
  reasons: string[];
};

type AgendaProposal = {
  requestId: string;
  title: string;
  slots: ProposalSlot[];
};

type AgendaPreferences = {
  day_start_time: string;
  day_end_time: string;
  lunch_start_time: string | null;
  lunch_end_time: string | null;
  minimum_buffer_minutes: number;
  default_meeting_duration_minutes: number;
  max_meetings_per_day: number;
  allow_meetings_on_weekends: boolean;
  timezone: string;
};

type AgendaState = {
  loading: boolean;
  sources: AgendaSource[];
  events: AgendaEvent[];
  proposal: AgendaProposal | null;
  preferences: AgendaPreferences | null;
  error: string | null;
  loadSources: () => Promise<void>;
  syncSource: (sourceId: string) => Promise<void>;
  loadEvents: (startAt: string, endAt: string) => Promise<void>;
  loadPreferences: () => Promise<void>;
  savePreferences: (prefs: Partial<AgendaPreferences>) => Promise<void>;
  askScheduler: (prompt: string) => Promise<void>;
  confirmSlot: (slot: ProposalSlot) => Promise<void>;
};

async function parseJson(response: Response) {
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error || 'Request failed');
  }
  return json;
}

export const useAgendaStore = create<AgendaState>((set, get) => ({
  loading: false,
  sources: [],
  events: [],
  proposal: null,
  preferences: null,
  error: null,

  loadSources: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch('/api/calendar/sources', {
        headers: await getAuthHeaders(false),
      });
      const json = await parseJson(response);
      set({ sources: json.sources || [], loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load sources',
      });
    }
  },

  syncSource: async (sourceId) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch(`/api/calendar/sources/${sourceId}/sync`, {
        method: 'POST',
        headers: await getAuthHeaders(false),
      });
      await parseJson(response);
      await get().loadSources();
      set({ loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to sync source',
      });
    }
  },

  loadEvents: async (startAt, endAt) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams({ startAt, endAt });
      const response = await fetch(`/api/calendar/events?${params.toString()}`, {
        headers: await getAuthHeaders(false),
      });
      const json = await parseJson(response);
      set({ events: json.events || [], loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load events',
      });
    }
  },

  loadPreferences: async () => {
    set({ loading: true, error: null });
    try {
      const response = await fetch('/api/calendar/preferences', {
        headers: await getAuthHeaders(false),
      });
      const json = await parseJson(response);
      set({ preferences: json.preferences || null, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load preferences',
      });
    }
  },

  savePreferences: async (prefs) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch('/api/calendar/preferences', {
        method: 'PUT',
        headers: await getAuthHeaders(true),
        body: JSON.stringify(prefs),
      });
      const json = await parseJson(response);
      set({ preferences: json.preferences || null, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to save preferences',
      });
    }
  },

  askScheduler: async (prompt) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch('/api/calendar/schedule', {
        method: 'POST',
        headers: await getAuthHeaders(true),
        body: JSON.stringify({ prompt }),
      });
      const json = await parseJson(response);
      set({
        proposal: {
          requestId: json.requestId,
          title: json.proposal?.title || 'Proposition',
          slots: json.proposal?.rankedSlots || [],
        },
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to generate proposal',
      });
    }
  },

  confirmSlot: async (slot) => {
    const proposal = get().proposal;
    if (!proposal) {
      set({ error: 'No proposal to confirm' });
      return;
    }

    set({ loading: true, error: null });
    try {
      const response = await fetch('/api/calendar/schedule/confirm', {
        method: 'POST',
        headers: await getAuthHeaders(true),
        body: JSON.stringify({
          requestId: proposal.requestId,
          slot,
        }),
      });
      await parseJson(response);
      set({ loading: false, proposal: null });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to confirm slot',
      });
    }
  },
}));
