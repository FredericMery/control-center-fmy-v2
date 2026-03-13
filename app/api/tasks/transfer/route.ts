import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { createClient } from '@supabase/supabase-js';

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TransferRequest {
  taskId: string;
  taskTitle: string;
  taskDeadline: string | null;
  createdAt: string;
  recipientEmail: string;
  recipientName?: string;
  customMessage?: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Début du transfert de tâche...');
    
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      console.log('❌ Utilisateur non authentifié');
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    console.log('✅ Utilisateur authentifié:', userId);

    const body: TransferRequest = await request.json();
    console.log('📝 Body reçu:', { ...body, recipientEmail: body.recipientEmail });

    if (!body.taskId || !body.taskTitle || !body.recipientEmail) {
      console.log('❌ Paramètres manquants');
      return NextResponse.json(
        { error: 'Paramètres manquants' },
        { status: 400 }
      );
    }

    // Valider l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.recipientEmail)) {
      console.log('❌ Email invalide:', body.recipientEmail);
      return NextResponse.json(
        { error: 'Email invalide' },
        { status: 400 }
      );
    }

    console.log('✅ Email valide:', body.recipientEmail);

    // Récupérer l'utilisateur qui envoie
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const userEmail = userData?.user?.email || 'no-reply';
    const senderName = userEmail.split('@')[0];
    const senderDisplayName = senderName || 'Utilisateur';
    const senderEmail = `${senderName}@meetsync-ai.com`;
    
    console.log('✅ Expéditeur:', senderDisplayName, '-', senderEmail);

    // Formater la date
    const createdDate = new Date(body.createdAt);
    const createdDateFormatted = createdDate.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const deadlineFormatted = body.taskDeadline
      ? new Date(body.taskDeadline).toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'Non définie';

    const sanitizedCustomMessage = (body.customMessage || '').trim();
    const customMessageHtml = sanitizedCustomMessage
      ? `<div style="background: #fff7ed; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin: 0 0 6px 0; color: #92400e; font-size: 12px; text-transform: uppercase; font-weight: 700;">Message personnalisé</p>
          <p style="margin: 0; color: #7c2d12; font-size: 14px; line-height: 1.6;">${escapeHtml(sanitizedCustomMessage).replace(/\n/g, '<br>')}</p>
        </div>`
      : '';

    console.log('📧 Préparation envoi email via Resend...');
    console.log('  - De:', `${senderDisplayName} <${senderEmail}>`);
    console.log('  - À:', body.recipientEmail);
    console.log('  - Sujet: Nouvelle demande d\'action:', body.taskTitle);

    // Envoyer l'email via Resend
    const emailResult = await resend.emails.send({
      from: `${senderDisplayName} <${senderEmail}>`,
      to: body.recipientEmail,
      subject: `Nouvelle demande d'action: ${body.taskTitle}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0; color: white;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Nouvelle demande d'actions</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.9;">${senderDisplayName} vous attribue une nouvelle tâche</p>
          </div>

          <div style="padding: 30px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none;">
            ${customMessageHtml}
            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <h2 style="margin: 0 0 12px 0; color: #1f2937; font-size: 18px; font-weight: 600;">
                📋 ${body.taskTitle}
              </h2>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px;">
                <div>
                  <p style="margin: 0 0 4px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: 600;">
                    📅 Créée le
                  </p>
                  <p style="margin: 0; color: #1f2937; font-size: 14px;">
                    ${createdDateFormatted}
                  </p>
                </div>
                <div>
                  <p style="margin: 0 0 4px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; font-weight: 600;">
                    ⏰ Échéance
                  </p>
                  <p style="margin: 0; color: #1f2937; font-size: 14px;">
                    ${deadlineFormatted}
                  </p>
                </div>
              </div>
            </div>

            <div style="background: #f0f4ff; border-left: 4px solid #667eea; padding: 16px; border-radius: 4px; margin-bottom: 24px;">
              <p style="margin: 0; color: #3730a3; font-size: 14px; line-height: 1.6;">
                Cette tâche vous a été attribuée par <strong>${senderDisplayName}</strong>.<br>
                Merci de la traiter dans les délais indiqués.<br>
                <br>
                Belle journée! 🌟
              </p>
            </div>

            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 1.6;">
              Cette demande a été générée par Control Center. Si vous avez des questions, veuillez contacter directement ${senderDisplayName}.
            </p>
          </div>

          <div style="padding: 20px; background: #f3f4f6; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">
              Control Center © 2026
            </p>
          </div>
        </div>
      `,
    });

    console.log('✅ Email envoyé:', emailResult);

    if (emailResult.error) {
      console.error('❌ Erreur Resend:', emailResult.error);
      return NextResponse.json(
        { 
          error: 'Erreur lors de l\'envoi de l\'email',
          details: emailResult.error.message || 'Erreur inconnue'
        },
        { status: 500 }
      );
    }

    // Marquer la tâche comme terminée avec commentaire
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        status: 'done',
        archived: false,
      })
      .eq('id', body.taskId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Erreur mise à jour tâche:', updateError);
      return NextResponse.json(
        { error: 'Erreur mise à jour tâche' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Tâche transférée à ${body.recipientEmail} et marquée comme terminée`,
    });
  } catch (error: any) {
    console.error('❌ Erreur endpoint transfer:', error);
    return NextResponse.json(
      { 
        error: 'Erreur serveur',
        details: error?.message || 'Erreur inconnue'
      },
      { status: 500 }
    );
  }
}
