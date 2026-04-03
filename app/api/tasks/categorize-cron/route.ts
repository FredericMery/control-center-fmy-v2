import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { callOpenAi } from '@/lib/ai/client';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';

// ─── Types ───────────────────────────────────────────────────────────────────

const AI_TASK_CATEGORIES = [
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

const VALID_CATEGORIES = new Set<string>(AI_TASK_CATEGORIES);

interface RawTask {
  id: string;
  user_id: string;
  title: string;
}

interface AiCategoryResult {
  id: string;
  category: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isCronAuthorized(token: string | null): boolean {
  const secret = process.env.TASK_CATEGORIZE_CRON_SECRET;
  return Boolean(secret && token === secret);
}

// ─── Supabase admin ───────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── AI categorization ────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un assistant de gestion professionnelle.
Pour chaque tâche ci-dessous, assigne une catégorie parmi les 9 suivantes uniquement :
RH, Organisation, Juridique, Commerce, Financier, Communication, Projet, Technique, Autre.

Règles:
- RH = recrutement, entretien, congé, contrat employé, paie, formation
- Organisation = planning, réunion, agenda, logistique, coordination interne
- Juridique = contrat, conformité, RGPD, litige, juridique, légal
- Commerce = vente, client, prospect, offre, devis, appel d'offres, CRM
- Financier = facturation, budget, comptabilité, paiement, trésorerie
- Communication = email, newsletter, présentation, rapport, contenu, réseaux sociaux
- Projet = livrable, milestone, roadmap, développement, lancement
- Technique = bug, dev, infra, système, code, configuration, IT
- Autre = tout ce qui ne correspond pas aux catégories ci-dessus

Réponds UNIQUEMENT avec un tableau JSON valide, sans markdown, de la forme:
[{"id":"<task_id>","category":"<catégorie>"}]`;

async function categorizeTasks(
  userId: string,
  tasks: RawTask[]
): Promise<AiCategoryResult[]> {
  if (tasks.length === 0) return [];

  // Batch to max 60 tasks per call to keep prompts manageable
  const BATCH_SIZE = 60;
  const results: AiCategoryResult[] = [];

  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);

    const userContent = batch
      .map((t) => `- id: "${t.id}" | titre: "${t.title.replace(/"/g, "'")}"`)
      .join('\n');

    let json: unknown;
    try {
      json = await callOpenAi({
        userId,
        service: 'chat/completions',
        model: 'gpt-4o-mini',
        body: {
          model: 'gpt-4o-mini',
          temperature: 0,
          max_tokens: 1200,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Tâches à catégoriser:\n${userContent}`,
            },
          ],
        },
      });
    } catch (err) {
      console.error(`[task-categorize] OpenAI error for user ${userId}:`, err);
      continue;
    }

    const raw = (json as { choices?: { message?: { content?: string } }[] })
      ?.choices?.[0]?.message?.content ?? '';

    let parsed: AiCategoryResult[] = [];
    try {
      // Strip potential markdown fences
      const clean = raw.replace(/```(?:json)?/g, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      console.error(`[task-categorize] JSON parse error for user ${userId}:`, raw);
      continue;
    }

    // Validate and collect
    for (const item of parsed) {
      if (
        typeof item?.id === 'string' &&
        typeof item?.category === 'string' &&
        VALID_CATEGORIES.has(item.category)
      ) {
        results.push({ id: item.id, category: item.category });
      }
    }
  }

  return results;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!isCronAuthorized(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();

  // 1. Fetch all active (non-archived) pro tasks
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, user_id, title')
    .eq('type', 'pro')
    .eq('archived', false)
    .not('title', 'is', null);

  if (error) {
    console.error('[task-categorize] fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!tasks || tasks.length === 0) {
    return NextResponse.json({ categorized: 0, message: 'No active pro tasks found' });
  }

  // 2. Group tasks by user
  const byUser = new Map<string, RawTask[]>();
  for (const task of tasks as RawTask[]) {
    const list = byUser.get(task.user_id) ?? [];
    list.push(task);
    byUser.set(task.user_id, list);
  }

  let totalUpdated = 0;
  const errors: string[] = [];

  // 3. Process each user
  for (const [userId, userTasks] of byUser.entries()) {
    try {
      const categorized = await categorizeTasks(userId, userTasks);

      if (categorized.length === 0) continue;

      // 4. Bulk-update tasks in Supabase (one by one — no upsert by id from client)
      const updates = categorized.map(({ id, category }) =>
        supabase.from('tasks').update({ ai_category: category }).eq('id', id).eq('user_id', userId)
      );

      const settled = await Promise.allSettled(updates);
      const succeeded = settled.filter((r) => r.status === 'fulfilled').length;
      totalUpdated += succeeded;

      console.log(
        `[task-categorize] user=${userId} tasks=${userTasks.length} categorized=${categorized.length} updated=${succeeded}`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`user=${userId}: ${msg}`);
      console.error(`[task-categorize] error for user ${userId}:`, msg);
    }
  }

  return NextResponse.json({
    categorized: totalUpdated,
    usersProcessed: byUser.size,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdminClient();

  // Manual mode: only active, non-archived, uncategorized pro tasks for the current user.
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, user_id, title')
    .eq('user_id', userId)
    .eq('type', 'pro')
    .eq('archived', false)
    .or('ai_category.is.null,ai_category.eq.')
    .not('title', 'is', null);

  if (error) {
    console.error('[task-categorize:manual] fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!tasks || tasks.length === 0) {
    return NextResponse.json({ categorized: 0, message: 'No uncategorized active pro tasks found' });
  }

  const categorized = await categorizeTasks(userId, tasks as RawTask[]);
  if (categorized.length === 0) {
    return NextResponse.json({ categorized: 0, message: 'AI returned no valid category' });
  }

  const updates = categorized.map(({ id, category }) =>
    supabase.from('tasks').update({ ai_category: category }).eq('id', id).eq('user_id', userId)
  );

  const settled = await Promise.allSettled(updates);
  const succeeded = settled.filter((r) => r.status === 'fulfilled').length;
  const failed = settled.length - succeeded;

  return NextResponse.json({
    categorized: succeeded,
    failed,
    sourceTasks: tasks.length,
  });
}
