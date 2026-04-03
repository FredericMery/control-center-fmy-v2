import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

const ALLOWED_CATEGORIES = [
  'RH',
  'Organisation',
  'Juridique',
  'Commerce',
  'Financier',
  'Communication',
  'Projet',
  'Technique',
  'Autre',
] as const;

const ALLOWED_SET = new Set<string>(ALLOWED_CATEGORIES);

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function normalizeCategory(input: string): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const map: Record<string, string> = {
    rh: 'RH',
    'ressources humaines': 'RH',
    organisation: 'Organisation',
    juridique: 'Juridique',
    legal: 'Juridique',
    commerce: 'Commerce',
    commercial: 'Commerce',
    vente: 'Commerce',
    financier: 'Financier',
    finance: 'Financier',
    communication: 'Communication',
    projet: 'Projet',
    technique: 'Technique',
    tech: 'Technique',
    autre: 'Autre',
    divers: 'Autre',
  };

  if (map[normalized]) return map[normalized];

  for (const cat of ALLOWED_CATEGORIES) {
    const catKey = cat.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (catKey === normalized) return cat;
  }

  return null;
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    taskId?: string;
    correctedCategory?: string;
  };

  const taskId = String(body.taskId || '').trim();
  const correctedCategory = normalizeCategory(String(body.correctedCategory || ''));

  if (!taskId || !correctedCategory || !ALLOWED_SET.has(correctedCategory)) {
    return NextResponse.json({ error: 'Parametres invalides' }, { status: 400 });
  }

  const supabase = getAdminClient();

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id, user_id, title, ai_category, archived, type')
    .eq('id', taskId)
    .eq('user_id', userId)
    .single();

  if (taskError || !task) {
    return NextResponse.json({ error: 'Tache introuvable' }, { status: 404 });
  }

  if (task.type !== 'pro' || task.archived) {
    return NextResponse.json({ error: 'Edition autorisee uniquement sur les taches pro actives' }, { status: 400 });
  }

  const previousCategory = task.ai_category ? String(task.ai_category) : null;

  const { error: updateError } = await supabase
    .from('tasks')
    .update({ ai_category: correctedCategory })
    .eq('id', taskId)
    .eq('user_id', userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Store feedback only when user actually corrected the AI category.
  if (previousCategory !== correctedCategory) {
    const { error: feedbackError } = await supabase.from('task_category_feedback').insert({
      user_id: userId,
      task_id: taskId,
      task_title: task.title,
      previous_category: previousCategory,
      corrected_category: correctedCategory,
    });

    if (feedbackError) {
      // Do not fail the main action if feedback table is not ready yet.
      console.error('[task-category-feedback] insert failed:', feedbackError.message);
    }
  }

  return NextResponse.json({
    ok: true,
    category: correctedCategory,
    learned: previousCategory !== correctedCategory,
  });
}
