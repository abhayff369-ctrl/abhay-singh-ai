// api/chat.js — AURA AI serverless endpoint (Gemini)
// GEMINI_API_KEY must be set as an environment variable in Vercel.

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: 'API key not configured on the server.'
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const message = (body && body.message) ? String(body.message) : '';
  const history = Array.isArray(body && body.history) ? body.history : [];
  const requestedModel = body && body.model ? String(body.model) : 'auto';

  if (!message.trim()) {
    return res.status(400).json({ success: false, error: 'Message is required.' });
  }

  // Model fallback chain. Order is intentional.
  const MODEL_CHAIN = [
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro-latest'
  ];

  // Map the frontend selector onto the chain
  let chain = MODEL_CHAIN.slice();
  if (requestedModel === 'pro') {
    chain = ['gemini-1.5-pro-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
  } else if (requestedModel === 'flash') {
    chain = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-latest'];
  }

  // Build contents
  const contents = [];
  for (const h of history) {
    if (!h || typeof h.content !== 'string' || !h.content.trim()) continue;
    const role = h.role === 'assistant' ? 'model' : 'user';
    contents.push({ role, parts: [{ text: h.content }] });
  }
  contents.push({ role: 'user', parts: [{ text: message }] });

  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  let lastError = null;

  for (const model of chain) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: 0.9,
              topP: 0.95,
              maxOutputTokens: 2048
            }
          })
        });

        const data = await r.json().catch(() => ({}));

        if (r.ok) {
          const text =
            data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n') ||
            '';
          if (!text) {
            lastError = 'Empty response from model.';
            continue;
          }
          return res.status(200).json({
            success: true,
            message: text,
            model
          });
        }

        // Non-OK: capture best-effort error message
        const errMsg =
          data?.error?.message ||
          data?.error?.status ||
          `Model ${model} failed (${r.status})`;
        lastError = errMsg;

        if (RETRYABLE.has(r.status)) {
          // small backoff, then retry same model once
          await new Promise(res => setTimeout(res, 350 + attempt * 400));
          continue;
        }
        // Non-retryable → move to next model
        break;
      } catch (err) {
        lastError = err?.message || 'Network error';
        await new Promise(res => setTimeout(res, 300));
      }
    }
  }

  return res.status(502).json({
    success: false,
    error: lastError || 'All models failed. Please try again shortly.'
  });
}
