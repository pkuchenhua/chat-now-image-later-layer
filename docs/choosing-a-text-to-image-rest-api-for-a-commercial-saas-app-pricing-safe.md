# Choosing a text-to-image REST API for a commercial SaaS app: pricing, safety, hosting

Use a hosted text-to-image REST API when your SaaS app needs to ship this quarter with predictable pricing and a safety filter you don't run yourself; otherwise reach for a self-hosted model once volume, commercial-licensing rules, or EU data residency make the per-image fees and shared tenancy hurt. That's the whole decision in two sentences.

Everything below is how to make it deliberately instead of by accident.

I build SDKs for a living, so I judge these by two things: how long until my first working call, and how much glue I still own a month later. Image APIs are sneaky on the second one. The generate call is easy. The parts that bite are safety, licensing, region, and what happens when a request takes nine seconds under real load.

## How should I pick a text-to-image REST API for a commercial SaaS app?

Start from constraints, not from the model leaderboard. For a commercial SaaS app the questions that actually decide it are: can I use the output commercially without a lawyer, where does the data live, what's the per-image cost at my volume, and is there a safety filter I can rely on. Model quality is real, but every serious provider is good enough now that it rarely breaks the tie.

Hosted REST is the fast path. OpenAI's image API and Google's Imagen on Vertex AI both give you a plain HTTPS call and a clear commercial-use grant. Bedrock puts several image models behind one AWS-shaped API if you're already there. Replicate is the pragmatic middle ground — a REST endpoint in front of open models, priced by compute, which is handy when you want a specific open model without renting a GPU yourself. Stability, Ideogram, and fal round out the field with their own APIs and their own licensing fine print.

| Option | Pricing shape | Hosting / region | Commercial use | Best when |
| --- | --- | --- | --- | --- |
| OpenAI images | per image, per size/quality | US-centric, EU options | granted, check policy | fastest to a working call |
| Vertex AI (Imagen) | per image | GCP regions incl. EU | granted under GCP terms | you're on Google Cloud, need EU residency |
| Bedrock (multiple models) | per image | AWS regions incl. EU | granted under AWS terms | you're already an AWS shop |
| Replicate | per second of compute | shared, US | depends on the model's license | you want a specific open model, no GPU ops |
| Self-hosted (SDXL, FLUX) | your GPU bill | wherever you deploy | the model's own license | high volume or strict data control |

The honest trade-off: hosted gets you live in an afternoon but you inherit the provider's rate limits, region map, and content policy. Self-hosting hands all of that back to you, along with the pager.

Ship hosted. Optimize later. For most SaaS teams shipping a feature, hosted wins until the per-image line on the invoice starts to sting, and by then you'll have real numbers to size the migration.

## A minimal generate-then-store flow in Node.js

Here's the shape I reach for. Generate, download the bytes, normalize with `sharp`, then hand off to storage. I'm using the OpenAI-style images call because it's the terse one; swap the URL and body for whichever provider you picked.

```ts
async function generate(prompt: string): Promise<Buffer> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.IMAGE_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `img:${hash(prompt)}`,
      },
      body: JSON.stringify({ model: "dall-e-3", prompt, size: "1024x1024", response_format: "b64_json" }),
    });

    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after") ?? 2 ** attempt);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`generate failed: ${res.status} ${await res.text()}`);

    const { data } = await res.json();
    return Buffer.from(data[0].b64_json, "base64");
  }
  throw new Error("generate gave up after repeated 429s");
}
```

Two DX notes that save you later. Generation is slow and spiky, so treat it as a background job with a queue and a status the client polls, not a request you block an HTTP handler on — nine-second waits under load will exhaust your connection pool. And normalize output immediately: resize and re-encode to a known format with `sharp` so downstream code never has to guess whether it got a PNG or a WebP, and so you strip whatever metadata the model tucked in.

## Safety and commercial use, before legal finds out

This is the part teams skip and regret. If users type the prompts, you need a safety filter on both the prompt and the image, because "a customer generated something illegal on our product" is not a bug you want to debug in public. Most hosted providers apply their own filter and will refuse some requests; treat a refusal as a normal response code, not an exception, and log it. If you self-host, that filter is now your job — budget for it.

Commercial use is the other landmine. "You can generate images" and "you own the images and can sell products with them" are different sentences, and providers word them differently. Open models on Replicate inherit the underlying model's license, which can carry use restrictions the hosted API's terms wouldn't. Read the actual license before you build a paid feature on it. As far as I can tell there's no shortcut here — the terms genuinely differ, and your mileage may vary by jurisdiction.

Region matters for the same reason it matters everywhere else. If your customers are in the EU, check that the provider offers an EU region and that inference and any retention stay there; Vertex AI and Bedrock make this explicit, some smaller APIs don't say at all.

## What actually breaks in production

The war story. I moved a service from the US to an EU region and pasted the new base URL into an env var. Every call came back 401 with a message about an invalid key. I spent 45 minutes convinced the key was wrong, rotated it twice, blamed the provider. The real cause: my `.env` had `API_KEY="Bearer sk-..."` with the word Bearer baked into the value from an old copy-paste, so my code sent `Authorization: Bearer Bearer sk-...`. In the US region a lenient gateway had been tolerating it; the EU endpoint was strict. A subtly wrong config that fails only after you change something unrelated is the worst kind, and I've been bitten by that exact pattern more than once.

That mess is also an argument for observability from day one. Log latency and cost per image, tag each generation with the model and region, and you'll spot the 401 spike and the p99 creep before a customer does. Testing deserves a mention too: you can't assert on pixels, so don't try — test the plumbing (does a refusal short-circuit correctly, does the queue retry idempotently, does storage get exactly one object) and leave the image quality to a human eyeball on a sample. Cost, finally, is a product decision: at a few thousand images a day the per-image APIs are cheaper than owning a GPU; cross some threshold and self-hosting flips ahead. Measure your own volume rather than trusting a blog's math, including this one.

## References

- MDN: Using Server-Sent Events — https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- sharp (high-performance Node image processing) docs — https://sharp.pixelplumbing.com
- OpenAI images API guide — https://platform.openai.com/docs/guides/images
- Vertex AI Imagen documentation — https://cloud.google.com/vertex-ai/generative-ai/docs/image/overview
- Replicate HTTP API reference — https://replicate.com/docs/reference/http
