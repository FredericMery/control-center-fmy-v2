import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { callOpenAi } from '@/lib/ai/client';
import { createMemory } from '@/lib/memory/memoryService';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

type ConversationRow = {
  id: string;
  user_id: string;
  title: string | null;
  allow_internet: boolean;
  status: string;
  started_at: string;
  last_message_at: string;
  ended_at: string | null;
  summary: string | null;
  liked: boolean | null;
  summary_memory_id: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  message_meta: Record<string, unknown>;
  created_at: string;
};

type AssistantActionPlan = {
  action: 'none' | 'create_task' | 'create_memory' | 'create_expense';
  title?: string;
  content?: string;
  taskType?: 'pro' | 'perso';
  deadline?: string | null;
  memoryType?: string;
  paymentMethod?: 'cb_perso' | 'cb_pro';
  amount?: number | null;
  vendor?: string;
  category?: string;
  description?: string;
  confidence?: number;
};

async function loadUserContext(userId: string) {
  const supabase = getSupabaseAdminClient();

  const [tasksRes, memoriesRes, expensesRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id,title,type,status,deadline,archived,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('memories')
      .select('id,title,type,content,structured_data,rating,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(120),
  ]);

  return {
    tasks: tasksRes.error ? [] : tasksRes.data || [],
    memories: memoriesRes.error ? [] : memoriesRes.data || [],
    expenses: expensesRes.error ? [] : expensesRes.data || [],
  };
}

function readOutputText(response: any): string {
  if (typeof response?.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks = response?.output || [];
  for (const chunk of chunks) {
    const content = chunk?.content || [];
    for (const entry of content) {
      if (entry?.type === 'output_text' && typeof entry?.text === 'string' && entry.text.trim()) {
        return entry.text.trim();
      }
      if (typeof entry?.text === 'string' && entry.text.trim()) {
        return entry.text.trim();
      }
    }
  }

  return 'Je n ai pas trouve de reponse dans les donnees disponibles.';
}

function readJsonObject(response: any): Record<string, unknown> | null {
  const raw = readOutputText(response);
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i)?.[1] || raw;
  const fromBraces = fenced.match(/\{[\s\S]*\}/)?.[0] || fenced;

  try {
    const parsed = JSON.parse(fromBraces);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeDateOnly(value?: string | null): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function loadAssistantName(userId: string): Promise<string> {
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from('user_ai_settings')
    .select('assistant_name')
    .eq('user_id', userId)
    .maybeSingle();

  const name = String(data?.assistant_name || 'Assistant').trim();
  return name || 'Assistant';
}

async function detectAssistantAction(args: {
  userId: string;
  question: string;
}): Promise<AssistantActionPlan> {
  const model = 'gpt-4.1-mini';
  const response = await callOpenAi({
    userId: args.userId,
    service: 'responses',
    model,
    body: {
      model,
      input: [
        {
          role: 'system',
          content:
            'Tu analyses une demande utilisateur et tu retournes UNIQUEMENT un JSON valide (sans texte hors JSON). Detecte une action a executer dans l app. Actions autorisees: none, create_task, create_memory, create_expense. Si infos insuffisantes, garde action mais laisse les champs manquants vides. Format exact des cles: action,title,content,taskType,deadline,memoryType,paymentMethod,amount,vendor,category,description,confidence.',
        },
        {
          role: 'user',
          content: args.question,
        },
      ],
    },
  });

  const parsed = readJsonObject(response) || {};
  const action = String(parsed.action || 'none') as AssistantActionPlan['action'];

  const normalized: AssistantActionPlan = {
    action: action === 'create_task' || action === 'create_memory' || action === 'create_expense' ? action : 'none',
    title: typeof parsed.title === 'string' ? parsed.title.trim() : undefined,
    content: typeof parsed.content === 'string' ? parsed.content.trim() : undefined,
    taskType: parsed.taskType === 'perso' ? 'perso' : 'pro',
    deadline: normalizeDateOnly(typeof parsed.deadline === 'string' ? parsed.deadline : null),
    memoryType: typeof parsed.memoryType === 'string' ? parsed.memoryType.trim() : undefined,
    paymentMethod: parsed.paymentMethod === 'cb_pro' ? 'cb_pro' : 'cb_perso',
    amount:
      typeof parsed.amount === 'number'
        ? parsed.amount
        : Number.isFinite(Number(parsed.amount))
        ? Number(parsed.amount)
        : null,
    vendor: typeof parsed.vendor === 'string' ? parsed.vendor.trim() : undefined,
    category: typeof parsed.category === 'string' ? parsed.category.trim() : undefined,
    description: typeof parsed.description === 'string' ? parsed.description.trim() : undefined,
    confidence: Number.isFinite(Number(parsed.confidence)) ? Number(parsed.confidence) : undefined,
  };

  return normalized;
}

async function executeAssistantAction(args: {
  userId: string;
  plan: AssistantActionPlan;
}) {
  const { userId, plan } = args;
  const supabase = getSupabaseAdminClient();

  if (plan.action === 'create_task') {
    const title = String(plan.title || '').trim();
    if (!title) {
      return {
        executed: false,
        kind: 'create_task',
        message: 'Titre manquant pour creer la tache.',
      };
    }

    const deadline = plan.deadline ? `${plan.deadline}T12:00:00.000Z` : null;
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        title,
        type: plan.taskType || 'pro',
        status: 'todo',
        archived: false,
        deadline,
      })
      .select('id,title,type,status,deadline')
      .single();

    if (error || !data) {
      return {
        executed: false,
        kind: 'create_task',
        message: `Echec creation tache: ${error?.message || 'erreur inconnue'}`,
      };
    }

    return {
      executed: true,
      kind: 'create_task',
      message: `Tache creee: ${data.title}`,
      data,
    };
  }

  if (plan.action === 'create_memory') {
    const title = String(plan.title || '').trim();
    if (!title) {
      return {
        executed: false,
        kind: 'create_memory',
        message: 'Titre manquant pour creer la memoire.',
      };
    }

    const memory = await createMemory({
      userId,
      title,
      type: plan.memoryType || 'other',
      content: plan.content || plan.description || '',
      structuredData: {
        source: 'assistant-action',
      },
      source: 'dashboard-assistant',
    });

    return {
      executed: true,
      kind: 'create_memory',
      message: `Memoire creee: ${memory.title}`,
      data: { id: memory.id, title: memory.title, type: memory.type },
    };
  }

  if (plan.action === 'create_expense') {
    const vendor = String(plan.vendor || '').trim() || 'Fournisseur';
    const amount = Number.isFinite(plan.amount as number) ? Number(plan.amount) : 0;
    const today = new Date().toISOString().slice(0, 10);
    const invoiceDate = normalizeDateOnly(plan.deadline || null) || today;

    const { data, error } = await supabase
      .from('expenses')
      .insert({
        user_id: userId,
        payment_method: plan.paymentMethod || 'cb_perso',
        invoice_date: invoiceDate,
        vendor,
        amount_ht: amount,
        amount_tva: 0,
        amount_ttc: amount,
        category: plan.category || 'autre',
        description: plan.description || plan.content || 'Cree via assistant',
        status: plan.paymentMethod === 'cb_perso' ? 'pending_ndf' : 'pending',
        currency: 'EUR',
      })
      .select('id,vendor,amount_ttc,payment_method,status')
      .single();

    if (error || !data) {
      return {
        executed: false,
        kind: 'create_expense',
        message: `Echec creation depense: ${error?.message || 'erreur inconnue'}`,
      };
    }

    return {
      executed: true,
      kind: 'create_expense',
      message: `Depense creee: ${data.vendor} (${Number(data.amount_ttc || 0).toFixed(2)} EUR)`,
      data,
    };
  }

  return {
    executed: false,
    kind: 'none',
    message: 'Aucune action operationnelle detectee.',
  };
}

async function getOrCreateConversation(args: {
  userId: string;
  conversationId?: string;
  allowInternet: boolean;
  question: string;
}) {
  const supabase = getSupabaseAdminClient();

  if (args.conversationId) {
    const { data } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('id', args.conversationId)
      .eq('user_id', args.userId)
      .single();

    if (data) {
      return data as ConversationRow;
    }
  }

  const title = args.question.slice(0, 90);
  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({
      user_id: args.userId,
      title,
      allow_internet: args.allowInternet,
      status: 'active',
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Impossible de creer une conversation');
  }

  return data as ConversationRow;
}

async function listMessages(userId: string, conversationId: string): Promise<MessageRow[]> {
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('ai_conversation_messages')
    .select('*')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as MessageRow[];
}

async function saveMessage(args: {
  userId: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageMeta?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdminClient();

  const { error } = await supabase
    .from('ai_conversation_messages')
    .insert({
      user_id: args.userId,
      conversation_id: args.conversationId,
      role: args.role,
      content: args.content,
      message_meta: args.messageMeta || {},
    });

  if (error) {
    throw new Error(error.message);
  }
}

function toConversationInput(messages: MessageRow[]) {
  return messages
    .slice(-20)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');

    const supabase = getSupabaseAdminClient();

    if (conversationId) {
      const [messages, conversationRes] = await Promise.all([
        listMessages(userId, conversationId),
        supabase
          .from('ai_conversations')
          .select('*')
          .eq('id', conversationId)
          .eq('user_id', userId)
          .single(),
      ]);

      if (conversationRes.error || !conversationRes.data) {
        return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 });
      }

      return NextResponse.json({
        conversation: conversationRes.data,
        messages,
      });
    }

    const { data, error } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false })
      .limit(30);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ conversations: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur de chargement conversation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const action = String(body?.action || 'ask');

    if (action === 'ask') {
      const question = String(body?.question || '').trim();
      const allowInternet = Boolean(body?.allowInternet);
      const conversationId = body?.conversationId ? String(body.conversationId) : undefined;

      if (!question) {
        return NextResponse.json({ error: 'Question requise' }, { status: 400 });
      }

      const conversation = await getOrCreateConversation({
        userId,
        conversationId,
        allowInternet,
        question,
      });

      await saveMessage({
        userId,
        conversationId: conversation.id,
        role: 'user',
        content: question,
      });

      const messages = await listMessages(userId, conversation.id);
      const contextPayload = await loadUserContext(userId);
      const assistantName = await loadAssistantName(userId);

      let actionExecutionResult: Record<string, unknown> | null = null;
      try {
        const detectedPlan = await detectAssistantAction({ userId, question });
        if (detectedPlan.action !== 'none' && (detectedPlan.confidence || 0) >= 0.45) {
          const execution = await executeAssistantAction({
            userId,
            plan: detectedPlan,
          });
          actionExecutionResult = {
            detectedPlan,
            execution,
          };
        }
      } catch {
        actionExecutionResult = {
          execution: {
            executed: false,
            message: 'Detection action indisponible pour cette requete.',
          },
        };
      }

      const baseInstruction = allowInternet
        ? `You are a personal assistant named ${assistantName}. First use connected user data below. If needed, and only when useful, complete with web search. Always separate what comes from app data and what comes from web. Respond in user language. If an app action has been executed, confirm the result clearly.`
        : `You are a personal assistant named ${assistantName}. You must answer using only connected user data below. If information is missing, say so explicitly. Never use external facts. Respond in user language. If an app action has been executed, confirm the result clearly.`;

      const inputMessages = [
        {
          role: 'system',
          content: [
            baseInstruction,
            'User data context JSON (strictly scoped to the connected user):',
            JSON.stringify(contextPayload),
            actionExecutionResult
              ? ['Executed app action JSON:', JSON.stringify(actionExecutionResult)].join('\n')
              : '',
          ].join('\n\n'),
        },
        ...toConversationInput(messages),
      ];

      const model = 'gpt-4.1-mini';
      const openAiBody: Record<string, unknown> = {
        model,
        input: inputMessages,
      };

      if (allowInternet) {
        openAiBody.tools = [{ type: 'web_search_preview' }];
      }

      const response = await callOpenAi({
        userId,
        service: 'responses',
        model,
        body: openAiBody,
      });

      const answer = readOutputText(response);

      await saveMessage({
        userId,
        conversationId: conversation.id,
        role: 'assistant',
        content: answer,
        messageMeta: {
          allowInternet,
          usedWebTool: allowInternet,
          taskCount: (contextPayload.tasks || []).length,
          memoryCount: (contextPayload.memories || []).length,
          expenseCount: (contextPayload.expenses || []).length,
          actionExecutionResult,
        },
      });

      const supabase = getSupabaseAdminClient();
      await supabase
        .from('ai_conversations')
        .update({
          allow_internet: allowInternet,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          title: conversation.title || question.slice(0, 90),
        })
        .eq('id', conversation.id)
        .eq('user_id', userId);

      const nextMessages = await listMessages(userId, conversation.id);

      return NextResponse.json({
        conversationId: conversation.id,
        answer,
        messages: nextMessages,
      });
    }

    if (action === 'close') {
      const conversationId = String(body?.conversationId || '').trim();
      if (!conversationId) {
        return NextResponse.json({ error: 'conversationId requis' }, { status: 400 });
      }

      const supabase = getSupabaseAdminClient();
      const { data: conversation, error: convError } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .single();

      if (convError || !conversation) {
        return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 });
      }

      if (conversation.status === 'closed') {
        return NextResponse.json({
          conversationId,
          status: 'closed',
        });
      }

      await supabase
        .from('ai_conversations')
        .update({
          status: 'closed',
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .eq('user_id', userId);

      return NextResponse.json({
        conversationId,
        status: 'closed',
      });
    }

    if (action === 'rate') {
      const conversationId = String(body?.conversationId || '').trim();
      const liked = body?.liked === true;
      const disliked = body?.liked === false;

      if (!conversationId || (!liked && !disliked)) {
        return NextResponse.json({ error: 'conversationId et liked requis' }, { status: 400 });
      }

      const supabase = getSupabaseAdminClient();
      const { data: conversation, error: convError } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('id', conversationId)
        .eq('user_id', userId)
        .single();

      if (convError || !conversation) {
        return NextResponse.json({ error: 'Conversation introuvable' }, { status: 404 });
      }

      if (conversation.status !== 'closed') {
        return NextResponse.json({ error: 'Clore la conversation avant de noter' }, { status: 400 });
      }

      const messages = await listMessages(userId, conversationId);
      if (messages.length === 0) {
        return NextResponse.json({ error: 'Conversation vide' }, { status: 400 });
      }

      // Dislike: close feedback loop without creating memory.
      if (disliked) {
        await supabase
          .from('ai_conversations')
          .update({
            liked: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', conversationId)
          .eq('user_id', userId);

        return NextResponse.json({
          conversationId,
          liked: false,
          summary: null,
          discussionMemoryId: null,
        });
      }

      if (conversation.liked === true && conversation.summary && conversation.summary_memory_id) {
        return NextResponse.json({
          conversationId,
          liked: true,
          summary: conversation.summary,
          discussionMemoryId: conversation.summary_memory_id,
        });
      }

      const model = 'gpt-4.1-mini';
      const summaryResponse = await callOpenAi({
        userId,
        service: 'responses',
        model,
        body: {
          model,
          input: [
            {
              role: 'system',
              content:
                'Resume cette conversation en francais avec uniquement les grandes idees. Format strict: 4 a 7 lignes maximum, une idee majeure par ligne, pas de details secondaires.',
            },
            {
              role: 'user',
              content: messages
                .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
                .join('\n\n'),
            },
          ],
        },
      });

      const summary = readOutputText(summaryResponse);
      const memory = await createMemory({
        userId,
        title: conversation.title || 'Discussion',
        type: 'discussion',
        content: summary,
        structuredData: {
          conversation_id: conversationId,
          messages_count: messages.length,
          allow_internet: conversation.allow_internet,
          ended_at: conversation.ended_at || new Date().toISOString(),
          liked: true,
        },
        source: 'dashboard-assistant',
      });

      await supabase
        .from('ai_conversations')
        .update({
          liked: true,
          summary,
          summary_memory_id: memory.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .eq('user_id', userId);

      return NextResponse.json({
        conversationId,
        liked: true,
        summary,
        discussionMemoryId: memory.id,
      });
    }

    return NextResponse.json({ error: 'Action non supportee' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur assistant';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
