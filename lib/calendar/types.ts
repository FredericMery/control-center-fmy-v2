export type CalendarProvider = 'blackwaves' | 'microsoft' | 'google' | 'manual' | 'hplus';
export type CalendarSyncMode = 'read' | 'read_write';
export type CalendarEventStatus = 'confirmed' | 'tentative' | 'cancelled';
export type CalendarSyncRunStatus = 'running' | 'success' | 'partial' | 'failed';
export type SchedulingRequestStatus =
  | 'draft'
  | 'proposed'
  | 'confirmed'
  | 'scheduled'
  | 'failed'
  | 'cancelled';

export type AgendaViewMode = 'day' | 'week' | 'month';

export interface CalendarSource {
  id: string;
  user_id: string;
  provider: CalendarProvider;
  label: string;
  is_enabled: boolean;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  external_account_id: string | null;
  external_calendar_id: string | null;
  sync_mode: CalendarSyncMode;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  user_id: string;
  source_id: string | null;
  source_provider: CalendarProvider;
  source_event_id: string | null;
  external_etag: string | null;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  timezone: string | null;
  all_day: boolean;
  status: CalendarEventStatus;
  visibility: string;
  meeting_url: string | null;
  organizer_email: string | null;
  attendees: Array<{ email?: string; name?: string; response?: string }>;
  category: string | null;
  planner_type: 'pro' | 'perso' | null;
  event_type: string | null;
  workflow_status: 'confirmed' | 'pending_confirmation' | 'relance_sent' | 'finalized' | 'cancelled';
  priority: number;
  is_read_only: boolean;
  is_blocking: boolean;
  created_by_ai: boolean;
  ai_context: Record<string, unknown>;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CalendarEventInput {
  user_id: string;
  source_id?: string | null;
  source_provider: CalendarProvider;
  source_event_id?: string | null;
  external_etag?: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  start_at: string;
  end_at: string;
  timezone?: string | null;
  all_day?: boolean;
  status?: CalendarEventStatus;
  visibility?: string;
  meeting_url?: string | null;
  organizer_email?: string | null;
  attendees?: Array<{ email?: string; name?: string; response?: string }>;
  category?: string | null;
  planner_type?: 'pro' | 'perso' | null;
  event_type?: string | null;
  workflow_status?: 'confirmed' | 'pending_confirmation' | 'relance_sent' | 'finalized' | 'cancelled';
  priority?: number;
  is_read_only?: boolean;
  is_blocking?: boolean;
  created_by_ai?: boolean;
  ai_context?: Record<string, unknown>;
  raw_payload?: Record<string, unknown>;
}

export type NormalizedEvent = CalendarEventInput;

export interface DateRange {
  startAt: string;
  endAt: string;
}

export interface BusyBlock {
  startAt: string;
  endAt: string;
  sourceEventId?: string;
  isProtected?: boolean;
  label?: string;
}

export interface RankedSlot {
  startAt: string;
  endAt: string;
  score: number;
  reasons: string[];
}

export interface SchedulingPreferences {
  user_id: string;
  day_start_time: string;
  day_end_time: string;
  lunch_start_time: string | null;
  lunch_end_time: string | null;
  minimum_buffer_minutes: number;
  max_meetings_per_day: number;
  default_meeting_duration_minutes: number;
  allow_meetings_on_weekends: boolean;
  preferred_focus_blocks: Array<Record<string, unknown>>;
  protected_time_blocks: Array<Record<string, unknown>>;
  preferred_meeting_windows: Array<Record<string, unknown>>;
  avoid_back_to_back: boolean;
  timezone: string;
  professional_email?: string | null;
  holiday_country?: string;
  metadata: Record<string, unknown>;
}

export interface ParsedSchedulingIntent {
  requestText: string;
  durationMinutes: number;
  attendees: string[];
  dateRange: DateRange;
  hardConstraints: string[];
  softPreferences: string[];
  targetSourceProvider?: CalendarProvider;
  titleSuggestion: string;
  category?: string;
  priority?: number;
}

export interface ScheduleProposal {
  proposalId: string;
  title: string;
  durationMinutes: number;
  participants: string[];
  rankedSlots: RankedSlot[];
  rationale: string;
  createdAt: string;
  metadata: Record<string, unknown>;
}
