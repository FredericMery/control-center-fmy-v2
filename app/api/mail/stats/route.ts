import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/mail/stats
export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const today = new Date().toISOString().split('T')[0];

  const [
    { count: total },
    { count: recu },
    { count: en_cours },
    { count: traite },
    { count: clos },
    { count: urgent },
    { count: action_required },
    { count: overdue },
    { data: byType },
    { data: bySender },
  ] = await Promise.all([
    supabase.from('mail_items').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('mail_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'recu'),
    supabase.from('mail_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'en_cours'),
    supabase.from('mail_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'traite'),
    supabase.from('mail_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'clos'),
    supabase.from('mail_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('priority', 'urgent'),
    supabase.from('mail_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('action_required', true).not('status', 'in', '("traite","archive","clos")'),
    supabase.from('mail_items').select('id', { count: 'exact', head: true }).eq('user_id', userId).lt('due_date', today).not('status', 'in', '("traite","archive","clos")'),
    supabase.from('mail_items').select('mail_type').eq('user_id', userId),
    supabase.from('mail_items').select('sender_name').eq('user_id', userId).not('sender_name', 'is', null),
  ]);

  // Agrégation par type
  const typeCountMap: Record<string, number> = {};
  for (const row of (byType || [])) {
    const t = row.mail_type as string;
    typeCountMap[t] = (typeCountMap[t] || 0) + 1;
  }

  // Top expéditeurs
  const senderCountMap: Record<string, number> = {};
  for (const row of (bySender || [])) {
    const s = (row.sender_name as string) || '';
    if (s) senderCountMap[s] = (senderCountMap[s] || 0) + 1;
  }
  const topSenders = Object.entries(senderCountMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return NextResponse.json({
    stats: {
      total: total || 0,
      recu: recu || 0,
      en_cours: en_cours || 0,
      traite: traite || 0,
      clos: clos || 0,
      urgent: urgent || 0,
      action_required: action_required || 0,
      overdue: overdue || 0,
    },
    by_type: typeCountMap,
    top_senders: topSenders,
  });
}
