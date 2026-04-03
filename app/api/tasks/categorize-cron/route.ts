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

interface FeedbackExample {
  task_title: string;
  corrected_category: string;
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

  // Accept exact canonical categories with case/accents variations.
  for (const cat of AI_TASK_CATEGORIES) {
    const catKey = cat.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (catKey === normalized) return cat;
  }

  return null;
}

function inferCategoryFromTitle(title: string): string {
  const text = String(title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/(recrut|entretien|conge|rh|paie|salaire|formation|embauche)/.test(text)) return 'RH';
  if (/(contrat|rgpd|conformit|jurid|litige|legal|avocat)/.test(text)) return 'Juridique';
  if (/(vente|client|prospect|devis|offre|crm|commercial|appel d.offres?)/.test(text)) return 'Commerce';
  if (/(factur|budget|compta|paiement|tresorerie|finance|reglement)/.test(text)) return 'Financier';
  if (/(email|mail|newsletter|presentation|rapport|communication|reseaux sociaux|contenu)/.test(text)) return 'Communication';
  if (/(planning|reunion|agenda|coordination|organis|logistique)/.test(text)) return 'Organisation';
  if (/(livrable|roadmap|milestone|lancement|projet)/.test(text)) return 'Projet';
  if (/(bug|infra|systeme|serveur|code|dev|tech|it|config)/.test(text)) return 'Technique';
  return 'Autre';
}

function tryParseArray(raw: string): unknown[] {
  const clean = raw.replace(/```(?:json)?/g, '').trim();
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const maybeItems = (parsed as { items?: unknown[]; results?: unknown[] }).items
        || (parsed as { items?: unknown[]; results?: unknown[] }).results;
      if (Array.isArray(maybeItems)) return maybeItems;
    }
  } catch {
    // noop, try bracket extraction below
  }

  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try {
      const sliced = clean.slice(start, end + 1);
      const parsed = JSON.parse(sliced);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeTitle(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadUserFeedbackExamples(
  supabase: ReturnType<typeof getAdminClient>,
  userId: string
): Promise<FeedbackExample[]> {
  const { data, error } = await supabase
    .from('task_category_feedback')
    .select('task_title, corrected_category')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    // If migration not run yet, we keep categorization working without learning memory.
    console.warn('[task-categorize] feedback table unavailable or query failed:', error.message);
    return [];
  }

  return (data || []).filter(
    (row): row is FeedbackExample =>
      typeof row?.task_title === 'string' &&
      typeof row?.corrected_category === 'string' &&
      VALID_CATEGORIES.has(row.corrected_category)
  );
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
  tasks: RawTask[],
  feedbackExamples: FeedbackExample[] = []
): Promise<AiCategoryResult[]> {
  if (tasks.length === 0) return [];

  // Batch to max 60 tasks per call to keep prompts manageable
  const BATCH_SIZE = 60;
  const results: AiCategoryResult[] = [];

  const learnedByTitle = new Map<string, string>();
  for (const example of feedbackExamples) {
    const key = normalizeTitle(example.task_title);
    if (!key || learnedByTitle.has(key)) continue;
    learnedByTitle.set(key, example.corrected_category);
  }

  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);
    const batchResults: AiCategoryResult[] = [];

    const remainingForAi: RawTask[] = [];
    for (const task of batch) {
      const learned = learnedByTitle.get(normalizeTitle(task.title));
      if (learned && VALID_CATEGORIES.has(learned)) {
        batchResults.push({ id: task.id, category: learned });
      } else {
        remainingForAi.push(task);
      }
    }

    if (remainingForAi.length === 0) {
      results.push(...batchResults);
      continue;
    }

    const userContent = remainingForAi
      .map((t) => `- id: "${t.id}" | titre: "${t.title.replace(/"/g, "'")}"`)
      .join('\n');

    const learningExamplesBlock = feedbackExamples
      .slice(0, 12)
      .map((ex) => `- "${ex.task_title.replace(/"/g, "'")}" => ${ex.corrected_category}`)
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
              content: `Corrections utilisateur (prioritaires si cas similaire):\n${learningExamplesBlock || '- (aucune)'}\n\nTâches à catégoriser:\n${userContent}`,
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

    const parsed = tryParseArray(raw);
    if (parsed.length === 0) {
      console.error(`[task-categorize] JSON parse error for user ${userId}:`, raw);
    }

    // Validate and collect
    for (const item of parsed) {
      const obj = item as { id?: string; task_id?: string; category?: string; type?: string };
      const id = typeof obj?.id === 'string' ? obj.id : typeof obj?.task_id === 'string' ? obj.task_id : '';
      const rawCategory = typeof obj?.category === 'string' ? obj.category : typeof obj?.type === 'string' ? obj.type : '';
      const category = normalizeCategory(rawCategory);

      if (id && category && VALID_CATEGORIES.has(category)) {
        batchResults.push({ id, category });
      }
    }

    // Fallback: if AI response is partially invalid, categorize remaining tasks locally.
    const categorizedIds = new Set(batchResults.map((r) => r.id));
    for (const task of remainingForAi) {
      if (categorizedIds.has(task.id)) continue;
      batchResults.push({ id: task.id, category: inferCategoryFromTitle(task.title) });
    }

    results.push(...batchResults);
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
      const feedbackExamples = await loadUserFeedbackExamples(supabase, userId);
      const categorized = await categorizeTasks(userId, userTasks, feedbackExamples);

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
    return NextResponse.json({ categorized: 0, message: 'Aucune tache active non categorisee' });
  }

  const feedbackExamples = await loadUserFeedbackExamples(supabase, userId);
  const categorized = await categorizeTasks(userId, tasks as RawTask[], feedbackExamples);
  if (categorized.length === 0) {
    return NextResponse.json({ categorized: 0, message: 'Aucune categorie exploitable retournee par l IA' });
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
