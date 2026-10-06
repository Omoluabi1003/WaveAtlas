import { NextRequest, NextResponse } from 'next/server';
import type { AtlasAssistantContext } from '@/lib/atlas-assistant';
import { runAtlasCommandBrain } from '@/lib/atlas-command-brain';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body?.question !== 'string' || !body.question.trim()) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }
    const context: AtlasAssistantContext = body?.context && typeof body.context === 'object' ? body.context : {};
    return NextResponse.json(runAtlasCommandBrain(body.question, context));
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }
}
