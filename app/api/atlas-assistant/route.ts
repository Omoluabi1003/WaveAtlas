import { NextRequest, NextResponse } from 'next/server';
import type { AtlasAssistantContext } from '@/lib/atlas-assistant';
import { answerAtlasIntelligently } from '@/lib/atlas-intelligence';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body?.question !== 'string' || !body.question.trim()) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }
    const context: AtlasAssistantContext = body?.context && typeof body.context === 'object' ? body.context : {};

    // Atlas must remain free to use and must not depend on a user or deployment API key.
    // Domain intelligence is handled by WaveAtlas's own intent engine, conversation state,
    // station directory and action executor. This endpoint deliberately has no paid/cloud LLM dependency.
    return NextResponse.json(answerAtlasIntelligently(body.question, context));
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }
}
