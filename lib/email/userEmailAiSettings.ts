import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export type EmailAiReplyScope = 'to_only' | 'all' | 'none';

export type UserEmailAiSettings = {
  replyScope: EmailAiReplyScope;
  globalInstructions: string;
  doRules: string[];
  dontRules: string[];
  signature: string;
};

const DEFAULT_SETTINGS: UserEmailAiSettings = {
  replyScope: 'to_only',
  globalInstructions: '',
  doRules: [],
  dontRules: [],
  signature: '',
};

export async function loadUserEmailAiSettings(userId: string): Promise<UserEmailAiSettings> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from('user_ai_settings')
    .select('email_reply_scope,email_global_instructions,email_do_rules,email_dont_rules,email_signature')
    .eq('user_id', userId)
    .maybeSingle();

  const scopeRaw = String(data?.email_reply_scope || DEFAULT_SETTINGS.replyScope);
  const replyScope: EmailAiReplyScope =
    scopeRaw === 'all' || scopeRaw === 'none' ? scopeRaw : 'to_only';

  return {
    replyScope,
    globalInstructions: String(data?.email_global_instructions || '').trim(),
    doRules: normalizeStringArray(data?.email_do_rules),
    dontRules: normalizeStringArray(data?.email_dont_rules),
    signature: String(data?.email_signature || '').trim(),
  };
}

export async function loadUserPrimaryEmail(userId: string): Promise<string> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase.auth.admin.getUserById(userId);
  return String(data?.user?.email || '').trim().toLowerCase();
}

export function resolveRecipientRole(args: {
  userEmail: string;
  toEmails: string[];
  ccEmails: string[];
}): 'to' | 'cc' | 'none' {
  const userEmail = String(args.userEmail || '').trim().toLowerCase();
  if (!userEmail) return 'none';

  const to = new Set((args.toEmails || []).map((value) => String(value || '').trim().toLowerCase()));
  const cc = new Set((args.ccEmails || []).map((value) => String(value || '').trim().toLowerCase()));

  if (to.has(userEmail)) return 'to';
  if (cc.has(userEmail)) return 'cc';
  return 'none';
}

export function canPrepareReply(args: {
  replyScope: EmailAiReplyScope;
  recipientRole: 'to' | 'cc' | 'none';
}): boolean {
  if (args.replyScope === 'none') return false;
  if (args.replyScope === 'all') return args.recipientRole === 'to' || args.recipientRole === 'cc';
  return args.recipientRole === 'to';
}

export function buildEmailBehaviorInstructions(settings: UserEmailAiSettings): string {
  const lines: string[] = [];

  if (settings.globalInstructions) {
    lines.push(`Consignes globales utilisateur: ${settings.globalInstructions}`);
  }

  if (settings.doRules.length > 0) {
    lines.push(`A faire: ${settings.doRules.join(' | ')}`);
  }

  if (settings.dontRules.length > 0) {
    lines.push(`A eviter: ${settings.dontRules.join(' | ')}`);
  }

  if (settings.signature) {
    lines.push(`Signature souhaitee: ${settings.signature}`);
  }

  return lines.join('\n');
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .slice(0, 30);
}
