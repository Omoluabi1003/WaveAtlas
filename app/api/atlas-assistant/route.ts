import { NextRequest, NextResponse } from 'next/server';
import { answerAtlasQuestion, type AtlasAssistantContext } from '@/lib/atlas-assistant';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body?.question !== 'string') {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }
    const context: AtlasAssistantContext = body?.context && typeof body.context === 'object' ? body.context : {};
    return NextResponse.json(answerAtlasQuestion(body.question, context));
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }
}
