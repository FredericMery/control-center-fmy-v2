export type ReunionMeetingStatus = 'planned' | 'ongoing' | 'completed';

export type ReunionActionStatus = 'todo' | 'in_progress' | 'done' | 'late';

export type ReunionPriority = 'low' | 'medium' | 'high';

export interface ParsedMeetingPrompt {
  participants: Array<{ name: string; email?: string }>;
  meetingDateIso: string;
  topic: string;
  title: string;
  objective: string;
  description: string;
  estimatedDurationMinutes: number;
  agenda: string[];
}

export interface MeetingUnderstandingOutput {
  executiveSummary: string;
  keyPoints: string[];
  decisions: string[];
  risks: string[];
  openQuestions: string[];
}

export interface ExtractedAction {
  title: string;
  description: string;
  assigned_to: string;
  assigned_email?: string;
  deadline?: string;
  priority: ReunionPriority;
  importance_score: number;
  urgency_score: number;
}

export interface FollowupInsight {
  summary: string;
  overloadedPeople: Array<{ name: string; lateCount: number; inProgressCount: number }>;
}
