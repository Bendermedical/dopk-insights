// DOPK assistant: a thin server function between the dashboard and the Claude API.
//
// The browser sends only the conversation (questions, tool calls and tool results). The system prompt
// and the tool definitions live here, so the page cannot change them. The tools run in the browser,
// on the uploaded file, and return small aggregates with customers pseudonymised ("Kunde A").
// The API key comes from the ANTHROPIC_API_KEY environment variable; nothing is logged.
//
// Environment:
//   ANTHROPIC_API_KEY        required to enable the assistant
//   ASSISTANT_ALLOWED_ORIGIN optional, e.g. https://dopk.example.netlify.app (requests from other origins are refused)
//   ASSISTANT_MODEL          optional, default claude-opus-5-5
//   ASSISTANT_EFFORT         optional, default low (chat-style answers; raise to medium if answers need more depth)
import Anthropic from "@anthropic-ai/sdk";

const MAX_BODY_BYTES = 200_000;
const MAX_MESSAGES = 60;

export const SYSTEM_PROMPT = `You answer questions about the DOPK open-order dashboard of a German medical-device manufacturer (tracheostomy and laryngectomy products). Your reader is the managing director: short, factual, decision-oriented.

Data rules
- Every figure you state must come from a tool result in this conversation. Never estimate, extrapolate or invent figures, orders or names. If the tools cannot answer a question, say so in one sentence and name what the dashboard can answer instead.
- Customers are pseudonymised as "Kunde A", "Kunde B" and so on. Use these labels exactly as given; never guess or comment on real names. The dashboard shows the real names to the reader.
- Unit prices and line values are not available to you; totals per group, order or customer are.

Business terms
- "Überfällig" (overdue): open lines whose delivery date is before the report date.
- "Sofortbedarf" (immediate demand): open lines without a delivery date. This is not missing data: it means produce and deliver as soon as material and staff allow, and it is the most urgent part of the order book. Waiting days count from the order date.
- "Auslauf" / "Raus": articles being phased out / discontinued; a successor may be named.
- Quantities are in order units, which differ between articles.
- The key account is the largest strategic customer; it is reported by get_key_account.

How to answer
- Answer in the language given in the first user message (de or en). German: decimal comma, "1,5 T€"; English: "€1.5k".
- Lead with the answer and its number in one or two sentences; add at most three short bullet points when a breakdown helps. No headings, no tables.
- When a specific dashboard page shows the answer, call open_view once so the reader sees it; mention that the view is open.
- Prefer one or two tool calls; call independent tools in parallel.`;

const filters = {
  type: "object",
  description: "Optional filters. Omit to use the whole order book.",
  properties: {
    customer: { type: "string", description: "Pseudonymised customer label, e.g. \"Kunde A\"" },
    family: { type: "string", description: "Product family name exactly as returned by a tool, e.g. \"Laryvox\"" },
    model: { type: "string", description: "Model within the family, e.g. \"A1-XX\"" },
    variant: { type: "string", enum: ["pdt", "nopdt"], description: "PDT variants only, or everything except PDT" }
  },
  additionalProperties: false
};
const month = { type: "string", description: "Calendar month as YYYY-MM" };
const tool = (name, description, properties = {}, required = []) => ({
  name, description, strict: true,
  input_schema: { type: "object", properties, required, additionalProperties: false }
});

export const TOOLS = [
  tool("get_overview", "Headline figures: open backlog, overdue, immediate demand (Sofortbedarf), shipped today, order intake, largest customers and product families, and the delivery months ahead.", { filters }),
  tool("get_overdue", "Overdue open lines: total value, lines, orders, oldest delay, grouped by product family, customer or due month, plus the largest lines (order, article, family, customer, days late, quantity).", {
    filters, group_by: { type: "string", enum: ["family", "customer", "month", "none"] }, month: { ...month, description: "Only lines due in this month (YYYY-MM)" }
  }),
  tool("get_immediate_demand", "Immediate demand (Sofortbedarf, lines without delivery date): value, quantity, lines, value-weighted average and oldest waiting days, grouped by product family or customer, plus the oldest lines (first in, first out).", {
    filters, group_by: { type: "string", enum: ["family", "customer", "none"] }
  }),
  tool("get_families", "Open backlog by product family: value, quantity, overdue and immediate-demand parts, share of the value not assigned to a family, phase-out articles.", { filters }),
  tool("get_customers", "Open backlog by customer (pseudonymised): value, share, overdue value, concentration index (HHI).", { filters }),
  tool("get_due_month", "Open lines due in one future delivery month: value, lines, grouped by family and customer.", { month, filters }, ["month"]),
  tool("get_order", "One order: customer, open value, lines with article, family, quantity, due date, days late, delivered share.", {
    order: { type: "string", description: "Order number" }
  }, ["order"]),
  tool("get_changes", "Changes since the previous uploaded file: newly overdue, new orders, delivery dates moved later, new immediate demand, delivered value."),
  tool("get_outlook", "Revenue outlook: expected shipments in the next 7, 30 and 90 days, the month landing and the immediate demand that could ship on top if capacity allows.", { filters }),
  tool("get_key_account", "Scorecard of the key account(s): open, overdue, immediate demand, schedule cover, on-time delivery, date reliability, book-to-bill."),
  tool("open_view", "Show a page of the dashboard to the reader, optionally filtered.", {
    page: { type: "string", enum: ["overview", "late", "imm", "fam", "cust", "horizon", "outlook"], description: "overview, late = Überfällig, imm = Sofortbedarf, fam = product families, cust = customers, horizon = delivery months, outlook = revenue outlook" },
    customer: { type: "string" }, family: { type: "string" }, month: { ...month, description: "With page horizon: a delivery month; with page late: a due month" },
    variant: { type: "string", enum: ["pdt", "nopdt"] }
  }, ["page"])
];

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

// Accept only a plain conversation: alternating user/assistant messages with content arrays.
function validMessages(m) {
  return Array.isArray(m) && m.length > 0 && m.length <= MAX_MESSAGES && m[0].role === "user" &&
    m.every(x => x && (x.role === "user" || x.role === "assistant") && Array.isArray(x.content) && x.content.length > 0 &&
      x.content.every(b => b && typeof b.type === "string"));
}

export function createHandler(options = {}) {
  const env = options.env || process.env;
  const client = options.client || (env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 25_000 }) : null);
  const model = env.ASSISTANT_MODEL || "claude-opus-5-5";
  const effort = env.ASSISTANT_EFFORT || "low";

  return async function handler(req) {
    const origin = req.headers.get("origin");
    if (env.ASSISTANT_ALLOWED_ORIGIN && origin && origin !== env.ASSISTANT_ALLOWED_ORIGIN) return json({ error: "forbidden" }, 403);
    if (req.method === "GET") return json({ enabled: !!client });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    if (!client) return json({ error: "not_configured" }, 503);

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "too_large" }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: "bad_request" }, 400); }
    if (!validMessages(body?.messages)) return json({ error: "bad_request" }, 400);

    try {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",                     // a false refusal is re-run on Anthropic's recommended fallback model
        output_config: { effort },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],  // caches tools + system
        tools: TOOLS,
        tool_choice: { type: "auto" },
        messages: body.messages
      });
      return json({ content: response.content, stop_reason: response.stop_reason, stop_details: response.stop_details ?? null, model: response.model });
    } catch (error) {
      if (error instanceof Anthropic.BadRequestError) return json({ error: "bad_request" }, 400);
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return json({ error: "not_configured" }, 503);
      if (error instanceof Anthropic.RateLimitError) return json({ error: "rate_limited" }, 429);
      if (error instanceof Anthropic.APIConnectionError) return json({ error: "unavailable" }, 502);
      if (error instanceof Anthropic.APIError) return json({ error: "unavailable" }, 502);
      return json({ error: "unavailable" }, 500);
    }
  };
}

export default createHandler();
export const config = { path: "/api/assistant" };
