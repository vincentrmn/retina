import Anthropic from "@anthropic-ai/sdk";
import { PROMPT_CLASSIFICATION, PROMPTS, SCHEMA_CLASSIFICATION, SCHEMAS } from "./schemas";
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

/** Les remarques du modèle sont affichées telles quelles : on retire les cadratins. */
function sansCadratin<T>(extraction: T): T {
  return JSON.parse(JSON.stringify(extraction).replace(/\s*[—–]\s*/g, " - ")) as T;
}

async function callModel(
  mime: string,
  content: Buffer,
  schema: Record<string, unknown>,
  prompt: string,
  model: string = MODEL
): Promise<unknown> {
  const data = content.toString("base64");
  const source: Anthropic.ContentBlockParam =
    mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mime as ImageMime, data } };

  const response = await client().messages.create({
    model,
    max_tokens: 8192,
    ...(model === MODEL ? { thinking: { type: "adaptive" as const } } : {}),
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: [source, { type: "text", text: prompt }] }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Extraction refusée par le modèle (safety). Vérifier le document.");
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Réponse du modèle sans contenu texte.");
  }
  return JSON.parse(text.text);
}

/** Extraction typée (le type de document est connu). */
export async function extractDocument(type: DocType, mime: string, content: Buffer): Promise<Extraction> {
  return sansCadratin((await callModel(mime, content, SCHEMAS[type], PROMPTS[type])) as Extraction);
}

/** Classification rapide du type de document (Haiku : la tâche est facile). */
const MODEL_CLASSIFICATION = "claude-haiku-4-5";

/**
 * Extraction AUTO (upload en batch) en deux temps : classification du type
 * par un modèle rapide, puis extraction typée par Opus. Un schéma unique
 * type+extraction dépasse la limite API des paramètres à union.
 */
export async function extractDocumentAuto(
  mime: string,
  content: Buffer
): Promise<{ type: DocType | "autre"; extraction: Extraction | null }> {
  const cls = (await callModel(mime, content, SCHEMA_CLASSIFICATION, PROMPT_CLASSIFICATION, MODEL_CLASSIFICATION)) as {
    type_detecte: DocType | "autre";
  };
  if (cls.type_detecte === "autre") return { type: "autre", extraction: null };
  return { type: cls.type_detecte, extraction: await extractDocument(cls.type_detecte, mime, content) };
}
