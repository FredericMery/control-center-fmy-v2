import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { callOpenAi } from '@/lib/ai/client';

type LearnPayload = {
  apply?: boolean;
  maxSamples?: number;
};

type SuggestedRules = {
  summary: string;
  doRules: string[];
  dontRules: string[];
};

export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as LearnPayload;
  const apply = Boolean(body.apply);
  const maxSamples = Math.min(Math.max(Number(body.maxSamples || 40), 10), 120);

  const supabase = getSupabaseAdminClient();

  const { data: logs, error } = await supabase
    .from('email_processing_logs')
    .select('id,message_id,payload,created_at')
    .eq('user_id', userId)
    .in('event_type', ['reply_sent', 'mail_transfer_sent'])
    .order('created_at', { ascending: false })
    .limit(maxSamples);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const samples = (logs || [])
    .map((entry) => {
      const payload = (entry.payload || {}) as Record<string, unknown>;
      const aiBaselineBody = String(payload.ai_baseline_body || '').trim();
      const finalBody = String(payload.final_body || '').trim();
      const aiBaselineSubject = String(payload.ai_baseline_subject || '').trim();
      const finalSubject = String(payload.final_subject || '').trim();
      const editedByUser = Boolean(payload.edited_by_user);

      return {
        message_id: String(entry.message_id || entry.id || ''),
        edited_by_user: editedByUser,
        ai_baseline_subject: aiBaselineSubject,
        ai_baseline_body: aiBaselineBody,
        final_subject: finalSubject,
        final_body: finalBody,
      };
    })
    .filter((sample) => sample.ai_baseline_body && sample.final_body);

  const editedSamples = samples.filter((sample) => sample.edited_by_user);
  if (editedSamples.length === 0) {
    return NextResponse.json({
      applied: false,
      summary: 'Aucune correction detectee sur les reponses envoyees.',
      samples: samples.length,
      editedSamples: 0,
      suggested: { doRules: [], dontRules: [] },
    });
  }

  const suggested = await synthesizeRulesFromSamples(userId, editedSamples);

  if (!apply) {
    return NextResponse.json({
      applied: false,
      summary: suggested.summary,
      samples: samples.length,
      editedSamples: editedSamples.length,
      suggested: {
        doRules: suggested.doRules,
        dontRules: suggested.dontRules,
      },
    });
  }

  const { data: current } = await supabase
    .from('user_ai_settings')
    .select('email_do_rules,email_dont_rules')
    .eq('user_id', userId)
    .maybeSingle();

  const mergedDo = mergeRules(current?.email_do_rules, suggested.doRules);
  const mergedDont = mergeRules(current?.email_dont_rules, suggested.dontRules);

  const { error: upsertError } = await supabase
    .from('user_ai_settings')
    .upsert(
      {
        user_id: userId,
        email_do_rules: mergedDo,
        email_dont_rules: mergedDont,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({
    applied: true,
    summary: suggested.summary,
    samples: samples.length,
    editedSamples: editedSamples.length,
    suggested: {
      doRules: suggested.doRules,
      dontRules: suggested.dontRules,
    },
    merged: {
      doRules: mergedDo,
      dontRules: mergedDont,
    },
  });
}

async function synthesizeRulesFromSamples(userId: string, samples: Array<Record<string, unknown>>): Promise<SuggestedRules> {
  try {
    const model = 'gpt-4.1-mini';
    const response = await callOpenAi({
      userId,
      service: 'responses',
      model,
      body: {
        model,
        input: [
          {
            role: 'system',
            content:
              'Tu analyses les corrections de brouillons email d un utilisateur. Retourne STRICTEMENT un JSON: {"summary":"...","do_rules":["..."],"dont_rules":["..."]}. max 8 regles par liste, concretes, actionnables, courtes.',
          },
          {
            role: 'user',
            content: JSON.stringify(samples),
          },
        ],
        text: { format: { type: 'json_object' } },
      },
    });

    const raw = response?.output?.[0]?.content?.[0]?.text || response?.output_text || '{}';
    const parsed = JSON.parse(raw) as {
      summary?: unknown;
      do_rules?: unknown;
      dont_rules?: unknown;
    };

    return {
      summary: String(parsed.summary || 'Regles generees a partir de tes corrections recentes.').trim(),
      doRules: normalizeRules(parsed.do_rules),
      dontRules: normalizeRules(parsed.dont_rules),
    };
  } catch {
    return {
      summary: 'Analyse IA indisponible, aucune regle appliquee.',
      doRules: [],
      dontRules: [],
    };
  }
}

function normalizeRules(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const rules = value
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((entry) => entry.slice(0, 200));

  return mergeRules([], rules);
}

function mergeRules(base: unknown, incoming: string[]): string[] {
  const normalizedBase = Array.isArray(base)
    ? base.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];

  const merged = [...normalizedBase, ...incoming]
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 60);

  return Array.from(new Map(merged.map((rule) => [rule.toLowerCase(), rule])).values());
}
