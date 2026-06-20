import { NextRequest, NextResponse } from 'next/server';
import { reviewSignalSubmission, type SignalSubmissionInput } from '@/lib/signal-review-agent';

const REQUIRED_FIELDS: Array<keyof SignalSubmissionInput> = ['station_name', 'stream_url'];

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 2000) : '';
}

function issueBody(input: SignalSubmissionInput, review: Awaited<ReturnType<typeof reviewSignalSubmission>>) {
  return `## Submitted signal\n\n- Station name: ${input.station_name}\n- Stream URL: ${input.stream_url}\n- City: ${input.city || 'Not provided'}\n- Country: ${input.country || 'Not provided'}\n- Genre: ${input.genre || 'Not provided'}\n- Language: ${input.language || 'Not provided'}\n- Station website: ${input.station_website || 'Not provided'}\n- Submitted by: ${input.submitted_by || 'Anonymous'}\n- Submitter email: ${input.submitter_email_optional || 'Not provided'}\n- Notes: ${input.notes_optional || 'Not provided'}\n\n## Signal Review Agent\n\n- Status: ${review.status}\n- Quality score: ${review.quality_score}\n- Content type: ${review.validation.content_type}\n- Response time: ${review.validation.response_time_ms}ms\n- Playlist followed: ${review.validation.playlist_followed ? 'Yes' : 'No'}\n- Recommendation: ${review.recommendation}\n\n## Duplicate candidates\n\n${review.duplicate_candidates.length ? review.duplicate_candidates.map((item) => `- ${item.name} (${item.country}) — ${item.stream_url}`).join('\n') : 'None detected.'}\n\n## Recommended normalized station object\n\n\`\`\`json\n${JSON.stringify(review.normalized_station, null, 2)}\n\`\`\`\n\nAdmin approval is required before this signal is added to production. Add the \`approved-signal\` label only after manual review.`;
}

async function createGitHubIssue(input: SignalSubmissionInput, review: Awaited<ReturnType<typeof reviewSignalSubmission>>) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return undefined;
  const title = `Signal Submission: ${input.station_name} - ${[input.city, input.country].filter(Boolean).join(', ') || 'Unknown location'}`;
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'WaveAtlas Signal Review Agent' },
    body: JSON.stringify({ title, labels: ['signal-submission', review.status], body: issueBody(input, review) }),
  });
  if (!res.ok) throw new Error(`GitHub issue creation failed: ${res.status}`);
  return (await res.json()) as { html_url?: string; number?: number };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  const input = Object.fromEntries(Object.keys(body).map((key) => [key, clean(body[key])])) as SignalSubmissionInput;
  const missing = REQUIRED_FIELDS.filter((field) => !input[field]);
  if (missing.length) return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 });
  const review = await reviewSignalSubmission(input);
  const issue = await createGitHubIssue(input, review).catch((error: Error) => ({ error: error.message }));
  return NextResponse.json({ message: 'Your signal has been received. Once verified, it may join the WaveAtlas™ global map.', review, issue });
}
