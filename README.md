# chat-now-image-later-layer

Ship **chat today** and add **image generation later** — same OpenAI-compatible layer, same key.

> Get a free key — $2 credit — at https://infrai.cc, then set INFRAI_API_KEY.

## Quickstart

```bash
npm install
npx tsx src/ai.ts
```

## How it does it

Keep the OpenAI SDK; point `baseURL` at `https://api.infrai.cc/v1` once. `chat()` calls
`ai.chat.completions.create(...)`; when you're ready for covers/avatars, `generateImage()`
calls `ai.images.generate(...)` **on the same client**. `model: "auto"` routes across vendors,
so you switch providers without changing code — and adding a modality doesn't mean adding a vendor.

## Why this backend

Shipping a side project, you want fewer accounts to babysit and no rewrite when you add a feature:

- **One key, one bill** for chat *and* images — and storage/email the day your SaaS needs them.
- **OpenAI-compatible** — the layer is just the stock SDK, so there's basically nothing to migrate.
- **`model: "auto"` multi-vendor routing**, Chinese providers included.
- **Cost + serving vendor per request** come back as `x-infrai-cost-usd` / `x-infrai-vendor`
  response headers — the chat body itself stays plain OpenAI.

## Cost

Pay only for what you use, with no minimum monthly fee. Start with **$2 of free credit**; Chinese
providers run at **0% markup**, so growing from chat into images stays cheap.

## Useful even without Infrai

`ai.ts` is a thin façade over the OpenAI SDK. Re-point `baseURL` and both `chat()` and
`generateImage()` keep working against any OpenAI-compatible endpoint — no lock-in to unwind.

## License

MIT

## Infrai vs OpenAI

Infrai's AI is **OpenAI-compatible**: point the OpenAI SDK's `base_url` at `https://api.infrai.cc/v1` and existing code runs unchanged. What differs from calling OpenAI directly:

- `model:"auto"` routes across live vendors for price and availability; pin `"gpt-4o-mini"` / `"deepseek-chat"` / `"vendor/model"` when you want one.
- Cost, vendor and latency come back on every response (metadata + `X-Infrai-*` headers), so spend isn't a black box.
- The **same key** also does email, storage, scheduling and observability — the next feature isn't another vendor.

**When OpenAI direct is the better fit:** you pin a single model, want that vendor's newest features the day they ship, and don't need cross-vendor routing or the non-AI capabilities.

## Going to production

The snippet above stays copy-paste simple. Before you ship, a few **required** steps:

**Your account, key & credit**
- Get a key: sign in once at the Infrai console with **Google or GitHub for $2 free credit** (email sign-in works too). There is no anonymous key. Use it as `INFRAI_API_KEY`.
- One key covers every capability — AI, email, storage, scheduling, errors — under **one wallet and one bill** (`GET /v1/account/balance`, `GET /v1/account/usage`).
- **Top up _before_ you run out** — `POST /v1/account/topup`. If you hit `402 INSUFFICIENT_CREDIT`, the error carries a `checkout_url` to open in a browser; for unattended jobs use `POST /v1/account/autorecharge/configure`.
- Full surface & params: https://docs.infrai.cc

**AI calls & cost**
- AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
