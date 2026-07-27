# Safe in-app chatbot moderation with an LLM and JSON schema, no dedicated endpoint

Short answer: you can ship a basically-safe in-app chatbot on a plain chat API without a dedicated moderation endpoint — you run moderation as a second, cheap LLM call that returns a strict JSON verdict, and you gate on it. Send the user's message (and optionally the model's reply) to a small chat model, ask it to classify against your policy with a JSON schema, then branch on the result. It's less specialized than a purpose-built moderation API. For a junior-friendly v1, it's simple, cheap, and good enough.

I'll be honest about where this bit me. First time I tried this, I let the classifier free-form its output. About 1 in 20 replies came back as prose instead of JSON and blew up my `JSON.parse`. Twenty minutes of squinting at logs. The fix was forcing structured output with a schema — which I should have done on day one.

## How do I add basic moderation to a chatbot without a dedicated endpoint?

The reader's real question is blunt: my platform doesn't hand me a moderation route, so now what?

Not every runtime ships a dedicated moderation endpoint. OpenAI does, and it's free, which makes it a strong option if you're already on their stack. Plenty of unified runtimes don't expose one. So if you picked a stack for other reasons — cost, model breadth, one bill — you moderate with what you've got. And what you've got is a chat model.

That's less of a downgrade than it sounds. An LLM-as-judge classifier bends in ways a fixed-category endpoint can't: you write the categories your product actually cares about, in plain language, and tune them without waiting on a vendor to ship a new label. Anthropic's Claude is good at following a written safety rubric if you go the judge route. The catch is that you own the reliability now. A dedicated endpoint is battle-tested against adversarial input; your prompt is only as good as you made it. For a v1 that trade-off is usually fine. For a high-risk domain it isn't — be honest about which one you're building.

Here are the honest options, side by side:

| Option | Specialization | Cost shape | Best when |
| --- | --- | --- | --- |
| OpenAI moderation endpoint | high, fixed categories | free | you're on OpenAI and its categories fit |
| Chat model + JSON schema judge | you define it | one small call per check | your runtime has no moderation route |
| OpenRouter + a judge model | you define it | one small call per check | you want hosted model breadth |
| A dedicated safety vendor | highest, audited | paid | you're in a regulated or high-risk domain |

The middle two are the same technique on different plumbing. Infrai is one runtime where the JSON-schema judge is the intended pattern: there's no separate moderation route, so you do safety as a `response_format` schema call on the same chat surface. As far as I can tell, that keeps the moving parts down, which is the entire point for a junior dev.

## A moderation call that returns a verdict you can branch on

This is the classifier as a raw call — full URL, method, headers, body — so it drops into any Node service. Pick a cheap, available model; safety runs on every message, so per-call cost matters more than per-call polish. glm-4-flash lists at $0 per million tokens, which makes it a sane default for a high-volume gate.

```ts
const payload = {
  model: "glm-4-flash",
  messages: [
    { role: "system", content: "Classify the user message against our safety policy. Reply as JSON only." },
    { role: "user", content: "<the user message goes here>" },
  ],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "verdict",
      schema: {
        type: "object",
        properties: {
          allowed: { type: "boolean" },
          categories: { type: "array", items: { type: "string" } },
          reason: { type: "string" },
        },
        required: ["allowed", "categories", "reason"],
        additionalProperties: false,
      },
    },
  },
};

async function moderate() {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://api.infrai.cc/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.INFRAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") ?? 2 ** attempt);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`moderation failed: ${res.status} ${await res.text()}`);

    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
  }
  throw new Error("moderation gave up after repeated 429s");
}
```

Wire it as a gate. If `allowed` comes back false, skip the assistant call, return a canned refusal, and log the categories. Two practical notes. Check that your key actually serves the model you named before you lean on it. And because you're making two calls per turn now, watch token usage before you pipe a giant paste through the classifier — a moderation pass over a 30 KB document can cost more than the answer itself.

## The limits worth naming before you rely on it

A moderation-by-LLM setup has real edges, and pretending otherwise is how you ship something unsafe.

The classifier can be prompt-injected by the very text it's judging, so keep the safety prompt isolated from user content and never let user text redefine the rules. It's non-deterministic too. The same borderline message can pass once and fail the next time — log verdicts and review the gray zone instead of assuming consistency. And it doesn't replace human review for genuinely high-stakes content. If a miss means real harm, the LLM judge is your first line, not your whole defense.

If you need audited, category-guaranteed moderation, stick with OpenAI's dedicated endpoint or a specialized safety vendor. For a basic, safe in-app chatbot on a runtime with no moderation route, the chat-plus-JSON-schema approach is the pragmatic build. Keep the schema strict, keep the safety prompt isolated, and log everything.

## References

- OWASP Top 10 for LLM Applications: https://owasp.org/www-project-top-10-for-large-language-model-applications/
- OpenAI Moderation guide: https://platform.openai.com/docs/guides/moderation
- OpenRouter documentation: https://openrouter.ai/docs
- Infrai docs (structured JSON output on the chat surface): https://docs.infrai.cc
