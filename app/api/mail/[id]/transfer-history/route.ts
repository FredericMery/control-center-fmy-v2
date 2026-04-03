import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  }

  const { id } = await params;

  const { data: mail, error: mailError } = await supabase
    .from('mail_items')
    .select('id,user_id,transfer_last_at,transfer_last_recipient_email,transfer_last_subject,transfer_count')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (mailError || !mail) {
    return NextResponse.json({ error: 'Courrier introuvable' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('mail_item_transfers')
    .select('id,mail_item_id,recipient_email,recipient_name,cc_emails,subject,message,edited_by_user,task_id,provider_message_id,pdf_url,pdf_file_name,created_at')
    .eq('mail_item_id', id)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Impossible de charger l historique des transferts' }, { status: 500 });
  }

  return NextResponse.json({
    last_transfer: {
      at: mail.transfer_last_at,
      recipient_email: mail.transfer_last_recipient_email,
      subject: mail.transfer_last_subject,
      count: Number(mail.transfer_count || 0),
    },
    history: data || [],
  });
}
