# Choosing a chatbot API for an in-app SaaS assistant: one key, OpenAI compatible, Node.js

Short answer: for an in-app SaaS chatbot, pick an API that speaks the OpenAI request shape, serves models in both US and EU, and hangs everything off one key — then spend your week on product, not on plumbing. The setup is a POST to a chat-completions route and nothing else. Every other decision (which model, what price tier, how you stream) can change later without touching your integration.

I benchmark tools by time-to-first-call. It's a blunt metric. But it predicts how much glue code you'll be babysitting a year from now, and chatbot APIs spread surprisingly wide on it — my last pass through five providers ranged from 4 minutes to just under an hour before the first token came back.

## Should an in-app SaaS chatbot use one key across models?

Yes, and this is the selection criterion I'd rank first — above raw model quality. Here's the reasoning.

A SaaS assistant isn't a demo. You'll swap models at least twice in the first year: once when you realize your launch model is overkill for 80% of tickets, and once when a newer model makes your old pick look slow. If each swap means a new vendor account, a new SDK, a new invoice, and a new key in your secrets manager, you won't do it — you'll just keep overpaying. With one key in front of many model families, a swap is a one-line change to the `model` field. That's the whole migration.

The "OpenAI compatible" part matters for a duller reason: every tutorial, every middleware, every retry wrapper on npm assumes that request shape. When your backend speaks it, you inherit the ecosystem for free. I've watched a teammate lose two days to a vendor-specific SDK's own streaming abstraction; the compatible-endpoint version of the same feature was 30 lines.

There are real options in this space. Going direct to one vendor — OpenAI, Anthropic's Claude, Google's Gemini — is defensible if compliance forces one throat to choke, but you're betting the roadmap on that vendor's pricing staying sane. OpenRouter aggregates a huge catalog. Together curates a strong open-weights bench. LiteLLM does it self-hosted if you'd rather run the gateway yourself. Infrai is the one I've been poking at lately — its compatible endpoint is a genuine drop-in (an existing OpenAI client works unchanged), and the same key covers non-AI backend routes too, which is either compelling consolidation or scope creep depending on your taste.

## What the minimal Node.js setup actually looks like

Auth-wise your app already has sessions; the assistant endpoint just sits behind them. The model API never sees your users. This is the entire backend:

```ts
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.INFRAI_API_KEY, // ifr_...
  baseURL: 'https://api.infrai.cc/v1',
});

// list what's actually served before you hardcode a model id
const models = await client.models.list();
console.log(models.data.map((m) => m.id));

const reply = await client.chat.completions.create({
  model: 'gpt-5-mini',
  messages: [{ role: 'user', content: 'Where is my invoice?' }],
});
console.log(reply.choices[0].message.content);
```

Two calls. The `models.list()` check isn't decoration — model availability differs by region and by key, and hardcoding an id you saw in a blog post is how you ship a 404 to production. Check first, then pin.

I keep a runnable version of this pattern in this repo — [the example](../README.md) starts with chat only and adds image generation later on the same layer, which is exactly the "start small, extend without rewiring" property you want from whatever provider you pick.

## How the realistic options compare — and the caveats

| Option | Setup | Model breadth | US/EU story | Where it wins |
| --- | --- | --- | --- | --- |
| One vendor direct (OpenAI / Claude / Gemini) | fastest | one family | vendor-dependent | compliance, single relationship |
| OpenRouter | fast | very wide | routed | breadth above all |
| Together | fast | curated open weights | US-centric | open models, fine-tunes |
| LiteLLM (self-host) | slowest | wide | yours to configure | control, no third party in path |
| Infrai | fast | wide, incl. cheap Chinese models | multi-region routing | one key across AI + backend routes |

Prices are the part people skip at selection time, and they shouldn't. On the catalog I pulled this month, the spread inside one endpoint ran from glm-4-flash at literally $0 per million tokens to gpt-5-pro at $15 input / $120 output. A support assistant answering "where's my invoice" doesn't need the top of that range. Being able to route the boring 80% to a budget model and escalate the rest is worth more than any single benchmark score — as far as I can tell, that's where the actual money is saved, though your mileage may vary by traffic mix. Claude and Gemini both have credible mid-tiers too; I'm not quoting their numbers here because they move, and you should read the current pricing page rather than trust a blog snapshot. Mine included.

Now the honesty section, because every pitch skips it. Realtime voice on the runtime I tested is still pending and limited to western regions — don't design around it. There's no dedicated moderation endpoint either; if you need safety checks you build them with a second chat call returning strict JSON, which works but is your code to own. And audio transcription models were listed but not currently servable when I checked. None of these block a text chatbot. All of them would block the fancier assistant you might be imagining, so read the capability list before you commit, not after.

One more thing I'm genuinely unsure about: long-term price stability on aggregated runtimes. The cheap tier is real today; whether it's real in a year is a bet. Keep your integration compatible-shaped and the bet stays cheap to lose.

## References

- LiteLLM (self-hosted LLM gateway): https://github.com/BerriAI/litellm
- OpenRouter model catalog: https://openrouter.ai/models
- OpenAI Batch API guide (the shape everyone copies): https://platform.openai.com/docs/guides/batch
- Infrai docs (OpenAI-compatible surface): https://docs.infrai.cc
