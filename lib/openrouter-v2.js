const URL = 'https://openrouter.ai/api/v1/responses';
const configured = () => Boolean(process.env.OPENROUTER_API_KEY);
const textOf = (p) => p?.output_text || (p?.output || []).flatMap((x) => x?.content || []).map((x) => x?.text).filter(Boolean).join('\n').trim();
async function askOpenRouter({ question, context }) {
  if (!configured()) return { configured: false, answer: null };
  const input = `Analyze classroom activity aggregates. Use only evidence; do not identify students or invent causes. Return JSON with summary, findings, recommendations, limitations, confidence.\nQuestion: ${question}\nData: ${JSON.stringify(context || {})}`;
  const response = await fetch(URL, { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000', 'X-OpenRouter-Title': process.env.OPENROUTER_APP_NAME || 'Student Attendance Learning Workspace' }, body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || '~openai/gpt-sol-latest', input, max_output_tokens: 900 }) });
  let body = {}; try { body = await response.json(); } catch {}
  if (!response.ok) { const e = new Error(`OpenRouter request failed (${response.status}): ${body?.error?.message || body?.message || 'Unknown error'}`); e.status = response.status; throw e; }
  const raw = String(textOf(body) || '').replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  let answer; try { answer = JSON.parse(raw); } catch { answer = { summary: raw, findings: [], recommendations: [], limitations: 'The model response was not valid JSON.', confidence: 'low' }; }
  return { configured: true, answer };
}
module.exports = { askOpenRouter, openRouterConfigured: configured };
