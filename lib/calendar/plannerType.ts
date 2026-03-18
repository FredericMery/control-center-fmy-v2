import { SupabaseClient } from '@supabase/supabase-js';

export type PlannerType = 'pro' | 'perso';

function normalizeEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function inferPlannerTypeFromOrganizer(
  organizerEmail: string | null,
  proEmails: string[],
  attendees?: Array<{ email?: string | null }>
): PlannerType {
  const normalizedOrganizer = normalizeEmail(organizerEmail);

  const proSet = new Set(proEmails.map((email) => normalizeEmail(email)).filter(Boolean));
  if (normalizedOrganizer && proSet.has(normalizedOrganizer)) {
    return 'pro';
  }

  if (Array.isArray(attendees)) {
    for (const attendee of attendees) {
      const attendeeEmail = normalizeEmail(attendee?.email);
      if (attendeeEmail && proSet.has(attendeeEmail)) {
        return 'pro';
      }
    }
  }

  return 'perso';
}

export async function getProfessionalEmailsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const [prefsResult, aliasesResult] = await Promise.all([
    supabase
      .from('scheduling_preferences')
      .select('professional_email')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('user_email_aliases')
      .select('email_alias')
      .eq('user_id', userId)
      .eq('is_active', true),
  ]);

  const professionalFromSettings = normalizeEmail(prefsResult.data?.professional_email);
  const aliases = (aliasesResult.data || [])
    .map((row) => normalizeEmail(row.email_alias))
    .filter(Boolean);

  const result = new Set<string>();
  if (professionalFromSettings) result.add(professionalFromSettings);
  for (const alias of aliases) result.add(alias);

  return [...result];
}
