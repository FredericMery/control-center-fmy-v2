import { NextRequest, NextResponse } from 'next/server';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { FULL_ACCESS_USER_IDS, isFullAccessUser } from '@/lib/subscription/accessControl';
import {
  ACTION_CATALOG,
  DEFAULT_ACTION_MAPPINGS,
  DETECTED_TYPE_LABELS,
  extractPrimaryActionMap,
  sanitizeActionMappings,
  withPrimaryAction,
} from '@/lib/memory/actionMappings';

const CONFIG_MEMORY_TITLE = 'memory_action_mappings';
const CONFIG_SOURCE = 'system_config';
const CONFIG_OWNER_ID =
  process.env.MEMORY_ACTIONS_CONFIG_USER_ID ||
  Array.from(FULL_ACCESS_USER_IDS)[0] ||
  '63efeb2d-6b5f-486d-8163-7485b26b9329';

async function loadMappings() {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('memories')
    .select('id, structured_data')
    .eq('user_id', CONFIG_OWNER_ID)
    .eq('title', CONFIG_MEMORY_TITLE)
    .eq('source', CONFIG_SOURCE)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const config = (data?.structured_data || {}) as Record<string, unknown>;
  const configuredMappings = sanitizeActionMappings(config.mappings);
  const primaryMap = extractPrimaryActionMap(configuredMappings);

  return {
    memoryId: data?.id || null,
    mappings: configuredMappings,
    primaryActions: primaryMap,
  };
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }

    const payload = await loadMappings();
    return NextResponse.json({
      ...payload,
      defaults: DEFAULT_ACTION_MAPPINGS,
      labels: DETECTED_TYPE_LABELS,
      catalog: ACTION_CATALOG,
      canEdit: isFullAccessUser(userId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });
    }
    if (!isFullAccessUser(userId)) {
      return NextResponse.json({ error: 'Acces admin requis' }, { status: 403 });
    }

    const body = await request.json();
    const primaryActions =
      body?.primaryActions && typeof body.primaryActions === 'object'
        ? (body.primaryActions as Record<string, string>)
        : {};

    const previous = await loadMappings();
    const merged = withPrimaryAction(previous.mappings, primaryActions);

    const supabase = getSupabaseAdminClient();
    const payload = {
      mappings: merged,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    };

    const basePayload = {
      user_id: CONFIG_OWNER_ID,
      title: CONFIG_MEMORY_TITLE,
      type: 'document',
      content: 'System memory assistant action mappings',
      structured_data: payload,
      source: CONFIG_SOURCE,
    };

    let memoryId = previous.memoryId;

    if (previous.memoryId) {
      const { error: updateError } = await supabase
        .from('memories')
        .update(basePayload)
        .eq('id', previous.memoryId)
        .eq('user_id', CONFIG_OWNER_ID);

      if (updateError) {
        throw new Error(updateError.message);
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('memories')
        .insert(basePayload)
        .select('id')
        .single();

      if (insertError) {
        throw new Error(insertError.message);
      }

      memoryId = inserted.id;
    }

    return NextResponse.json({
      memoryId,
      mappings: merged,
      primaryActions: extractPrimaryActionMap(merged),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}