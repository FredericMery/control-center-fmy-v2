import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import type { MailContext, MailStatus, MailType, MailPriority } from '@/types/mail';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/mail — liste + filtres
export async function GET(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const context   = searchParams.get('context') as MailContext | null;
  const status    = searchParams.get('status') as MailStatus | null;
  const mailType  = searchParams.get('mail_type') as MailType | null;
  const priority  = searchParams.get('priority') as MailPriority | null;
  const sender    = searchParams.get('sender');
  const search    = searchParams.get('search');
  const dateFrom  = searchParams.get('date_from');
  const dateTo    = searchParams.get('date_to');
  const overdueOnly = searchParams.get('overdue') === '1';
  const actionOnly  = searchParams.get('action_required') === '1';
  const limit     = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const offset    = parseInt(searchParams.get('offset') || '0', 10);

  let query = supabase
    .from('mail_items')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('received_at', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (context)        query = query.eq('context', context);
  if (status)         query = query.eq('status', status);
  if (mailType)       query = query.eq('mail_type', mailType);
  if (priority)       query = query.eq('priority', priority);
  if (sender)         query = query.ilike('sender_name', `%${sender}%`);
  if (actionOnly)     query = query.eq('action_required', true);
  if (dateFrom)       query = query.gte('received_at', dateFrom);
  if (dateTo)         query = query.lte('received_at', dateTo);
  if (overdueOnly) {
    const today = new Date().toISOString().split('T')[0];
    query = query.lt('due_date', today).not('status', 'in', '("traite","archive","clos")');
  }
  if (search) {
    query = query.or(
      `subject.ilike.%${search}%,sender_name.ilike.%${search}%,summary.ilike.%${search}%,reference.ilike.%${search}%`
    );
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('GET /api/mail error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data || [], total: count || 0 });
}

// POST /api/mail — créer un courrier
export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const {
    context = 'pro',
    mail_type = 'autre',
    sender_name,
    sender_address,
    sender_email,
    subject,
    reference,
    summary,
    full_text,
    received_at,
    due_date,
    status = 'recu',
    action_required = false,
    action_note,
    priority = 'normal',
    scan_url,
    scan_file_name,
    ai_analyzed = false,
    ai_tags,
    ai_confidence,
    replied = false,
    replied_at,
    reply_note,
    notes,
  } = body;

  // Validation basique
  if (!['pro', 'perso'].includes(context as string)) {
    return NextResponse.json({ error: 'context invalide (pro|perso)' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('mail_items')
    .insert({
      user_id: userId,
      context,
      mail_type,
      sender_name: sender_name || null,
      sender_address: sender_address || null,
      sender_email: sender_email || null,
      subject: subject || null,
      reference: reference || null,
      summary: summary || null,
      full_text: full_text || null,
      received_at: received_at || new Date().toISOString().split('T')[0],
      due_date: due_date || null,
      status,
      action_required: Boolean(action_required),
      action_note: action_note || null,
      priority,
      scan_url: scan_url || null,
      scan_file_name: scan_file_name || null,
      ai_analyzed: Boolean(ai_analyzed),
      ai_tags: ai_tags || null,
      ai_confidence: ai_confidence || null,
      replied: Boolean(replied),
      replied_at: replied_at || null,
      reply_note: reply_note || null,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    console.error('POST /api/mail error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ item: data }, { status: 201 });
}
