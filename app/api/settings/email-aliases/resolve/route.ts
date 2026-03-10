import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const resend = new Resend(process.env.RESEND_API_KEY);

type ResolveAction = 'approve' | 'reject';

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const body = (await request.json()) as {
      requestId?: string;
      action?: ResolveAction;
      note?: string;
    };

    const requestId = String(body.requestId || '').trim();
    const action = String(body.action || '').trim() as ResolveAction;
    const note = truncate(String(body.note || '').trim(), 400) || null;

    if (!requestId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'requestId et action (approve|reject) requis' }, { status: 400 });
    }

    const { data: pending, error: pendingError } = await supabase
      .from('inbound_alias_requests')
      .select('*')
      .eq('id', requestId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (pendingError || !pending) {
      return NextResponse.json({ error: 'Demande introuvable ou deja traitee' }, { status: 404 });
    }

    if (action === 'approve') {
      const senderEmail = normalizeEmail(pending.sender_email);
      if (!senderEmail) {
        return NextResponse.json({ error: 'Email expediteur invalide' }, { status: 400 });
      }

      const { data: existingAlias } = await supabase
        .from('user_email_aliases')
        .select('id,user_id,is_active')
        .eq('email_alias', senderEmail)
        .limit(1)
        .maybeSingle();

      if (existingAlias && existingAlias.user_id !== userId) {
        return NextResponse.json(
          { error: 'Cet alias est deja rattache a un autre utilisateur' },
          { status: 409 }
        );
      }

      if (!existingAlias) {
        const { error: aliasInsertError } = await supabase.from('user_email_aliases').insert({
          user_id: userId,
          email_alias: senderEmail,
          label: 'Alias valide via inbound',
          is_active: true,
        });

        if (aliasInsertError) {
          return NextResponse.json({ error: 'Erreur creation alias email' }, { status: 500 });
        }
      } else if (!existingAlias.is_active) {
        const { error: aliasReactivateError } = await supabase
          .from('user_email_aliases')
          .update({ is_active: true })
          .eq('id', existingAlias.id)
          .eq('user_id', userId);

        if (aliasReactivateError) {
          return NextResponse.json({ error: 'Erreur reactivation alias email' }, { status: 500 });
        }
      }

      const taskTitle = truncate(String(pending.inferred_title || '').trim(), 180) || 'Tache depuis email';
      const taskDeadline = parseDateIso(String(pending.inferred_deadline || '')) || buildFallbackDeadline();

      const { data: insertedTask, error: taskError } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          title: taskTitle,
          type: 'pro',
          status: 'todo',
          archived: false,
          deadline: taskDeadline,
        })
        .select('id,title,created_at')
        .single();

      if (taskError) {
        return NextResponse.json({ error: 'Erreur creation tache' }, { status: 500 });
      }

      const { error: updateError } = await supabase
        .from('inbound_alias_requests')
        .update({
          status: 'approved',
          review_note: note,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('user_id', userId)
        .eq('status', 'pending');

      if (updateError) {
        return NextResponse.json({ error: 'Erreur validation demande alias' }, { status: 500 });
      }

      await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          type: 'info',
          title: 'Alias ajoute',
          message: `L'expediteur ${senderEmail} est maintenant reconnu. Tache creee.`,
          read: false,
        });

      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('ref_key', `alias-review-${requestId}`);

      return NextResponse.json({
        success: true,
        action,
        task: insertedTask,
        message: 'Alias valide et tache creee',
      });
    }

    const { error: rejectError } = await supabase
      .from('inbound_alias_requests')
      .update({
        status: 'rejected',
        review_note: note,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('user_id', userId)
      .eq('status', 'pending');

    if (rejectError) {
      return NextResponse.json({ error: 'Erreur rejet demande alias' }, { status: 500 });
    }

    await sendAliasGuidanceEmail(normalizeEmail(String(pending.sender_email || '')));

    await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: 'info',
        title: 'Alias refuse',
        message: `Un email a ete renvoye a ${pending.sender_email} pour preciser le destinataire.`,
        read: false,
      });

    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('ref_key', `alias-review-${requestId}`);

    return NextResponse.json({
      success: true,
      action,
      message: 'Demande rejetee et email de clarification envoye',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function sendAliasGuidanceEmail(senderEmail: string | null): Promise<void> {
  if (!senderEmail || !process.env.RESEND_API_KEY) return;

  const fromAddress = String(process.env.EMAIL_FROM || 'noreply@meetsync-ai.com').trim();

  try {
    await resend.emails.send({
      from: fromAddress,
      to: senderEmail,
      subject: 'Information requise pour distribuer votre tache',
      text: [
        'Bonjour,',
        '',
        'Nous avons bien recu votre email vers taskpro@, mais le destinataire n\'a pas pu etre identifie automatiquement.',
        'Merci de repondre a cet email en indiquant le prenom + nom de la personne a qui attribuer la tache.',
        '',
        'Exemple: "Attribuer a: Prenom Nom"',
        '',
        'Merci.',
      ].join('\n'),
    });
  } catch (error) {
    console.error('send alias guidance email failed', error);
  }
}

function normalizeEmail(value: string): string | null {
  const email = String(value || '').trim().toLowerCase();
  if (!email.includes('@')) return null;
  return email;
}

function truncate(value: string, max: number): string {
  const normalized = String(value || '').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

function parseDateIso(value: string): string | null {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildFallbackDeadline(): string {
  const fallback = new Date();
  fallback.setUTCDate(fallback.getUTCDate() + 5);
  fallback.setUTCHours(23, 59, 59, 0);
  return fallback.toISOString();
}
