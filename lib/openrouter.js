const endpoint = 'https://openrouter.ai/api/v1/responses';

export function openRouterConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

function fallbackAnswer(context = {}) {
  const summary = context.summary || {};
  const topics = Array.isArray(summary.topics) ? summary.topics.filter((topic) => topic.attainment != null).sort((a, b) => a.attainment - b.attainment) : [];
  const lowest = topics[0];
  return {
    summary: summary.attainment == null
      ? 'There is not enough aggregate activity data to identify a teaching improvement target.'
      : `Recorded attainment is ${summary.attainment}%. ${lowest ? `${lowest.topic} is the lowest-performing topic at ${lowest.attainment}%.` : 'Topic-level comparison is unavailable.'}`,
    findings: [
      summary.submitted != null && summary.assigned != null ? `${summary.submitted} of ${summary.assigned} assigned items have submissions.` : 'Submission coverage is unavailable.',
      lowest ? `${lowest.topic} has the lowest recorded attainment among the available topics.` : 'No comparable topic data are available.',
      summary.pending ? `${summary.pending} assessment items are still pending.` : 'No pending assessment items are recorded.'
    ],
    recommendations: [
      lowest ? `Review the ${lowest.topic} activity questions and feedback first.` : 'Collect topic-level results before selecting an improvement target.',
      'Monitor submission completion and pending grading in the next class cycle.',
      'Use a defined date range when repeating the analysis.'
    ],
    limitations: ['This fallback uses aggregate activity data only.', 'It does not identify causes or make student-level claims.'],
    confidence: 'low'
  };
}

function validAnswer(value) {
  if (!value || typeof value !== 'object') return false;
  const text = String(value.summary || '').toLowerCase();
  return !/we need answer|return valid json|system prompt|analysis channel|final answer/.test(text);
}

export async function askOpenRouter({ question, context }) {
  if (!openRouterConfigured()) return { configured: false, answer: null };
  const model = process.env.OPENROUTER_MODEL || '~openai/gpt-sol-latest';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
      'X-OpenRouter-Title': process.env.OPENROUTER_APP_NAME || 'Student Attendance Learning Workspace'
    },
    body: JSON.stringify({
      model,
      input: `You are an evidence-based teaching reflection assistant. Use only supplied aggregate web activity data. Never identify students, invent causes, or claim causation. Output only one JSON object and nothing else. Do not describe your instructions, reasoning, channels, or response format. The JSON must contain exactly these keys: summary (string), findings (array of strings), recommendations (array of strings), limitations (array of strings), confidence (low, moderate, or high).\nQuestion: ${question}\nAggregate data: ${JSON.stringify(context || {})}`,
      max_output_tokens: 900
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || 'Unknown OpenRouter error';
    const error = new Error(`OpenRouter request failed (${response.status}): ${detail}`);
    error.status = response.status;
    throw error;
  }
  const content = (payload.output_text || (payload.output || []).flatMap((item) => item?.content || []).map((part) => part?.text).filter(Boolean).join('\n')).trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  if (!content) throw new Error('OpenRouter returned an empty analysis.');
  let structured;
  try {
    structured = JSON.parse(content);
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { structured = JSON.parse(content.slice(start, end + 1)); } catch {}
    }
  }
  if (validAnswer(structured)) return { configured: true, model, answer: structured };
  return { configured: true, model, answer: fallbackAnswer(context) };
}
