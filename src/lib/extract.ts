import Anthropic from "@anthropic-ai/sdk";
import { PROMPTS, SCHEMAS } from "./schemas";
import type { DocType, Extraction } from "./types";

/**
 * Étage 1 — extraction (Claude API). Un appel par document, structured
 * outputs obligatoires : la réponse est garantie conforme au schéma du type
 * de document, jamais de texte libre. Pas d'OCR séparé : le PDF/l'image part
 * en base64, la vision haute résolution d'Opus fait le travail sur les scans.
 */

const MODEL = "claude-opus-4-8";

export function hasAnthropicKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

declare global {
  // eslint-disable-next-line no-var
  var _retinaAnthropic: Anthropic | undefined;
}

function client(): Anthropic {
  if (!global._retinaAnthropic) global._retinaAnthropic = new Anthropic();
  return global._retinaAnthropic;
}

const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageMime = (typeof IMAGE_MIMES)[number];

export function isSupportedMime(mime: string): boolean {
  return mime === "application/pdf" || (IMAGE_MIMES as readonly string[]).includes(mime);
}

export async function extractDocument(
  type: DocType,
  mime: string,
  content: Buffer
): Promise<Extraction> {
  const data = content.toString("base64");

  const source: Anthropic.ContentBlockParam =
    mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mime as ImageMime, data } };

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: SCHEMAS[type] } },
    messages: [
      {
        role: "user",
        content: [source, { type: "text", text: PROMPTS[type] }],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Extraction refusée par le modèle (safety). Vérifier le document.");
  }

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Réponse du modèle sans contenu texte.");
  }
  return JSON.parse(text.text) as Extraction;
}
