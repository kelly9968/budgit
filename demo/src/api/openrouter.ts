// OpenRouter client — parses receipts (image) or natural-language text into
// structured Transaction rows. Uses free models only.
//
// We talk to OpenRouter via its OpenAI-compatible /chat/completions endpoint.
// Free models do not always honor `response_format: { type: 'json_schema' }`,
// so we ask for json_object and validate the shape ourselves.

const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined;
const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

// Cheapest Anthropic Haiku on OpenRouter ($0.25/M in, $1.25/M out as of
// 2026-05). Image-capable, fast, reliable — no need for free-tier fallbacks.
const MODEL = 'anthropic/claude-3-haiku';
const VISION_CHAIN = [MODEL];
const TEXT_CHAIN = [MODEL];

export type ParsedTx = {
  amount: number;
  date: string; // YYYY-MM-DD
  cat: string;
  note: string;
};

export type ParseInput =
  | { kind: 'image'; dataUrl: string }
  | { kind: 'text'; text: string };

export type ParseCtx = {
  categories: string[]; // allowed category names
  today: string; // YYYY-MM-DD
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertKey(): string {
  if (!API_KEY) {
    throw new Error(
      'VITE_OPENROUTER_API_KEY is not set — add it to demo/.env',
    );
  }
  return API_KEY;
}

function buildSystem(ctx: ParseCtx): string {
  return [
    'You extract personal financial transactions from receipts, photos, or short notes.',
    'Return ONLY valid JSON in this exact shape — no prose, no markdown, no code fences:',
    '{"transactions":[{"amount":number,"date":"YYYY-MM-DD","cat":string,"note":string}]}',
    `Today is ${ctx.today}. Use today for any item without an explicit date; use it for relative dates like "yesterday" too.`,
    `cat MUST be one of: ${ctx.categories.join(', ')}. If nothing fits, use "Other".`,
    'amount is a positive number in dollars (no currency symbol).',
    'note is a short label ≤ 60 chars (merchant or item description).',
    'For a single receipt total, return one transaction. For text that lists multiple separate purchases (e.g. "coffee 5, gas 40, lunch 12"), return one transaction per item.',
    'Example input: "Turkey sub $16 new rims $266 date night $450"',
    `Example output: {"transactions":[{"amount":16,"date":"${ctx.today}","cat":"Eat out","note":"Turkey sub"},{"amount":266,"date":"${ctx.today}","cat":"Transport","note":"New rims"},{"amount":450,"date":"${ctx.today}","cat":"Eat out","note":"Date night"}]}`,
    'If you truly cannot find any amount, return {"transactions":[]}.',
  ].join(' ');
}

type ChatMessage = {
  role: 'system' | 'user';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
};

function buildMessages(input: ParseInput, ctx: ParseCtx): ChatMessage[] {
  const sys: ChatMessage = { role: 'system', content: buildSystem(ctx) };
  if (input.kind === 'text') {
    return [
      sys,
      {
        role: 'user',
        content: `Parse this into transactions:\n\n${input.text}`,
      },
    ];
  }
  return [
    sys,
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Parse the transaction(s) shown in this image.' },
        { type: 'image_url', image_url: { url: input.dataUrl } },
      ],
    },
  ];
}

async function callOpenRouter(
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${assertKey()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'budgie',
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from model');
  return text;
}

// Free models often wrap JSON in ``` fences or prose. Pull out the first
// balanced JSON object/array we can find.
function extractJson(s: string): string {
  let t = s.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }
  // Already starts with { or [ → use as-is.
  if (t.startsWith('{') || t.startsWith('[')) return t;
  // Otherwise scan for the first { or [ and slice from there to the matching close.
  const start = t.search(/[{[]/);
  if (start < 0) return t;
  const open = t[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  return t.slice(start);
}

function coerce(raw: unknown, ctx: ParseCtx): ParsedTx[] {
  if (!raw) return [];
  // Accept either {transactions: [...]} or a top-level array.
  let list: unknown[];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const candidate =
      obj.transactions ?? obj.txs ?? obj.items ?? obj.results ?? obj.data;
    list = Array.isArray(candidate) ? candidate : [];
    // Single object that looks like a tx → wrap it.
    if (list.length === 0 && ('amount' in obj || 'amt' in obj)) {
      list = [obj];
    }
  } else {
    return [];
  }
  const allowed = new Set(ctx.categories);
  const out: ParsedTx[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const amountRaw = r.amount ?? r.amt ?? r.value;
    const amount =
      typeof amountRaw === 'number'
        ? amountRaw
        : typeof amountRaw === 'string'
        ? parseFloat(amountRaw.replace(/[$,]/g, ''))
        : NaN;
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const date =
      typeof r.date === 'string' && ISO_DATE.test(r.date) ? r.date : ctx.today;

    const catSource = r.cat ?? r.category ?? r.categoryName;
    const catRaw = typeof catSource === 'string' ? catSource.trim() : '';
    // Case-insensitive match on the allowed list before falling back.
    const matched = ctx.categories.find(
      (c) => c.toLowerCase() === catRaw.toLowerCase(),
    );
    const cat = matched
      ?? (allowed.has('Other') ? 'Other' : ctx.categories[0] ?? 'Other');

    const noteSource = r.note ?? r.description ?? r.merchant ?? r.label;
    const note =
      typeof noteSource === 'string' ? noteSource.trim().slice(0, 80) : '';

    out.push({
      amount: Math.round(amount * 100) / 100,
      date,
      cat,
      note,
    });
  }
  return out;
}

function isRetryable(e: unknown): boolean {
  const status = (e as Error & { status?: number }).status;
  return (
    status === 404 ||
    status === 429 ||
    (status !== undefined && status >= 500)
  );
}

async function callWithChain(
  chain: string[],
  messages: ChatMessage[],
): Promise<string> {
  let lastErr: unknown;
  for (const model of chain) {
    try {
      return await callOpenRouter(model, messages);
    } catch (e) {
      lastErr = e;
      if (!isRetryable(e)) throw e;
    }
  }
  // Every model in the chain failed with a retryable error.
  if (lastErr instanceof Error) {
    throw new Error(
      `All free models are busy or unavailable — try again shortly. (${lastErr.message})`,
    );
  }
  throw new Error('All free models are busy or unavailable — try again shortly.');
}

export async function parseTransaction(
  input: ParseInput,
  ctx: ParseCtx,
): Promise<ParsedTx[]> {
  const messages = buildMessages(input, ctx);
  const chain = input.kind === 'image' ? VISION_CHAIN : TEXT_CHAIN;
  const raw = await callWithChain(chain, messages);

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[openrouter] raw response:', raw);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[openrouter] JSON.parse failed for:', raw);
    }
    throw new Error("Couldn't read response — try rephrasing.");
  }
  return coerce(parsed, ctx);
}
