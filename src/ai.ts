import OpenAI from "openai";
import { pathToFileURL } from "node:url";

// One OpenAI-compatible layer for your SaaS. Chat ships today; images.generate()
// is the same client, so you add image generation later without a new vendor/key.
const ai = new OpenAI({
  baseURL: "https://api.infrai.cc/v1",
  apiKey: process.env.INFRAI_API_KEY!,
});

/** Ships today. */
export async function chat(prompt: string): Promise<string> {
  const resp = await ai.chat.completions.create({
    model: "auto",
    messages: [{ role: "user", content: prompt }],
  });
  return resp.choices[0]?.message?.content ?? "";
}

/** Ship this later — no new SDK, no new key, same layer. */
export async function generateImage(prompt: string): Promise<string> {
  const r = await ai.images.generate({ model: "auto", prompt, size: "1024x1024", n: 1 });
  return r.data[0].url ?? "";
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  chat("Suggest a friendly name for a habit-tracking app.").then((t) => console.log(t));
}
