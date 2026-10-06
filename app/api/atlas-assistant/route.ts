import { NextRequest, NextResponse } from 'next/server';
import type { AtlasAssistantAction, AtlasAssistantContext, AtlasAssistantReply } from '@/lib/atlas-assistant';
import { answerAtlasIntelligently } from '@/lib/atlas-intelligence';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.ATLAS_REASONING_MODEL || 'openrouter/free';
const ALLOWED_ACTIONS = new Set(['search', 'play', 'pause', 'resume', 'volume', 'teleport', 'wander', 'switch_view', 'open_settings', 'open_brief']);

function sanitizeAction(value: unknown): AtlasAssistantAction | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const action = value as Record<string, unknown>;
  const type = typeof action.type === 'string' ? action.type : '';
  if (!ALLOWED_ACTIONS.has(type)) return undefined;
  if (type === 'search') return typeof action.query === 'string' && action.query.trim() ? { type, query: action.query.trim().slice(0, 180) } : undefined;
  if (type === 'play') return { type, ...(typeof action.query === 'string' && action.query.trim() ? { query: action.query.trim().slice(0, 180) } : {}), ...(action.excludeCurrent === true ? { excludeCurrent: true } : {}) };
  if (type === 'pause' || type === 'resume' || type === 'open_settings' || type === 'open_brief') return { type };
  if (type === 'volume') return typeof action.value === 'number' && Number.isFinite(action.value) ? { type, value: Math.min(1, Math.max(0, action.value)) } : undefined;
  if (type === 'teleport' || type === 'wander') return { type, ...(typeof action.query === 'string' && action.query.trim() ? { query: action.query.trim().slice(0, 180) } : {}) };
  if (type === 'switch_view') return action.view === 'map' || action.view === 'globe' ? { type, view: action.view } : undefined;
  return undefined;
}

function parseModelReply(content: string): AtlasAssistantReply | null {
  try {
    const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const value = JSON.parse(cleaned) as Record<string, unknown>;
    const answer = typeof value.answer === 'string' ? value.answer.trim() : '';
    if (!answer) return null;
    const action = sanitizeAction(value.action);
    return { answer: answer.slice(0, 900), ...(action ? { action } : {}), source: 'waveatlas-local' };
  } catch { return null; }
}

async function reasonWithModel(question: string, context: AtlasAssistantContext): Promise<AtlasAssistantReply | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const station = context.station || null;
    const history = (context.history || []).slice(-10);
    const system = `You are Atlas, the conversational intelligence inside WaveAtlas, an internet-radio exploration app. Follow the user's instruction precisely and naturally. You can converse normally, understand follow-ups, Nigerian English and Nigerian Pidgin, and convert listening/navigation requests into ONE optional WaveAtlas action. Never claim an action already succeeded; the app reports execution afterward. Never invent station metadata. Use only supplied current-station metadata for factual claims about the current signal.\n\nAvailable action JSON shapes:\n{"type":"search","query":"..."}\n{"type":"play","query":"...","excludeCurrent":true}\n{"type":"pause"}\n{"type":"resume"}\n{"type":"volume","value":0.0}\n{"type":"teleport","query":"..."}\n{"type":"wander","query":"..."}\n{"type":"switch_view","view":"map|globe"}\n{"type":"open_settings"}\n{"type":"open_brief"}\n\nReturn JSON only: {"answer":"short natural response","action":optional_action_or_null}. If the user asks a normal conversational question that needs no app action, action must be null. If the user speaks Pidgin, answer in natural restrained Nigerian Pidgin. If they use standard English, answer in standard conversational English. Do not use fake phonetic accent.`;
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://wave-atlas.vercel.app',
        'X-Title': 'WaveAtlas Atlas',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.25,
        max_tokens: 320,
        messages: [
          { role: 'system', content: system },
          { role: 'system', content: `Current station metadata: ${JSON.stringify(station)}\nRecent conversation: ${JSON.stringify(history)}` },
          { role: 'user', content: question.slice(0, 1200) },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? parseModelReply(content) : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (typeof body?.question !== 'string' || !body.question.trim()) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }
    const context: AtlasAssistantContext = body?.context && typeof body.context === 'object' ? body.context : {};

    // A real reasoning model handles open-ended language and instruction following when configured.
    // The deterministic Atlas engine remains a zero-cost, zero-network fallback and execution guardrail.
    const reasoned = await reasonWithModel(body.question, context);
    return NextResponse.json(reasoned || answerAtlasIntelligently(body.question, context));
  } catch {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  }
}
