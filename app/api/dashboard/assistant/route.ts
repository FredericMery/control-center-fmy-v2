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
      .select('id,merchant_name,total_amount,date,category,payment_method,description,created_at')
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

      const baseInstruction = allowInternet
        ? 'You are a personal assistant. First use the connected user data below. If needed, and only when useful, complete with web search. Always clearly separate what comes from app data and what comes from the web. Respond in the user language used in the question.'
        : 'You are a personal assistant. You must answer using only the connected user data below. If information is missing, say so explicitly. Never use external facts. Respond in the user language used in the question.';

      const inputMessages = [
        {
          role: 'system',
          content: [
            baseInstruction,
            'User data context JSON (strictly scoped to the connected user):',
            JSON.stringify(contextPayload),
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

    if (action === 'finalize') {
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

      const messages = await listMessages(userId, conversationId);
      if (messages.length === 0) {
        return NextResponse.json({ error: 'Conversation vide' }, { status: 400 });
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
                'Summarize this conversation in French using: context, key questions, clear answers, pending actions. Keep it concise and useful as a memory.',
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
          ended_at: new Date().toISOString(),
        },
        source: 'dashboard-assistant',
      });

      await supabase
        .from('ai_conversations')
        .update({
          status: 'closed',
          summary,
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
        .eq('user_id', userId);

      return NextResponse.json({
        conversationId,
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
