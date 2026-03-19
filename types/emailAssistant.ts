export type EmailContext = 'pro' | 'perso';
export type EmailAiAction = 'classer' | 'repondre';
export type EmailAiStatus = 'pending' | 'analyzed' | 'error';
export type EmailPriority = 'urgent' | 'high' | 'normal' | 'low';
export type EmailResponseStatus = 'none' | 'draft_ready' | 'approved' | 'sent' | 'cancelled';

export interface EmailMessage {
  id: string;
  user_id: string;
  external_email_id: string | null;
  thread_id: string | null;
  direction: 'inbound' | 'outbound';
  context: EmailContext;
  mailbox: string;
  sender_email: string | null;
  sender_name: string | null;
  to_emails: string[];
  cc_emails: string[];
  bcc_emails: string[];
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string | null;
  created_at: string;
  updated_at: string;
  ai_status: EmailAiStatus;
  ai_summary: string | null;
  ai_confidence: number | null;
  ai_category: string | null;
  ai_priority: EmailPriority | null;
  ai_tags: string[];
  ai_action: EmailAiAction;
  ai_reasoning: string | null;
  response_status: EmailResponseStatus;
  response_required: boolean;
  archived: boolean;
  deleted_at: string | null;
}

export interface EmailReplyDraft {
  id: string;
  message_id: string;
  user_id: string;
  version: number;
  is_current: boolean;
  tone: string;
  language: string;
  proposed_subject: string | null;
  proposed_body: string;
  ai_model: string | null;
  ai_confidence: number | null;
  edited_by_user: boolean;
  approved_at: string | null;
  sent_at: string | null;
  send_provider: string | null;
  provider_message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailTriageResult {
  summary: string;
  action: EmailAiAction;
  category: string;
  priority: EmailPriority;
  confidence: number;
  reasoning: string;
  tags: string[];
}

export interface EmailReplySuggestion {
  subject: string;
  body: string;
  confidence: number;
}
