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
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      );
    }

    const body: TransferRequest = await request.json();

    if (!body.taskId || !body.taskTitle || !body.recipientEmail) {
      return NextResponse.json(
        { error: 'Paramètres manquants' },
        { status: 400 }
      );
    }

    // Valider l'email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.recipientEmail)) {
      return NextResponse.json(
        { error: 'Email invalide' },
        { status: 400 }
      );
    }

    // Récupérer l'utilisateur qui envoie
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    const senderName = userData?.user?.email?.split('@')[0] || 'Un utilisateur';

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

    // Envoyer l'email via Resend
    const emailResult = await resend.emails.send({
      from: 'Control Center <noreply@controler.email>',
      to: body.recipientEmail,
      subject: `Nouvelle demande d'action: ${body.taskTitle}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0; color: white;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Nouvelle demande d'actions</h1>
            <p style="margin: 8px 0 0 0; opacity: 0.9;">${senderName} vous attribue une nouvelle tâche</p>
          </div>

          <div style="padding: 30px; background: #f9fafb; border: 1px solid #e5e7eb; border-top: none;">
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
                <strong>${senderName}</strong> vous confie cette action. Merci de la traiter dans les délais indiqués.<br>
                <br>
                Belle journée! 🌟
              </p>
            </div>

            <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 1.6;">
              Cette demande a été générée par Control Center. Si vous avez des questions, veuillez contacter directement ${senderName}.
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

    if (emailResult.error) {
      console.error('Erreur Resend:', emailResult.error);
      return NextResponse.json(
        { error: 'Erreur lors de l\'envoi de l\'email' },
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
  } catch (error) {
    console.error('Erreur endpoint transfer:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
