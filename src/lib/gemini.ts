import "server-only";
import { z } from "zod";
import { currencySymbol } from "./format";
import type { Currency, TransactionType } from "./types";

/**
 * Categorización automática y captura por voz vía Gemini REST. Ambas
 * degradan suave: cualquier fallo devuelve null en vez de lanzar, para que
 * el sync/endpoint que las llama nunca se caiga por un problema de la IA.
 *
 * Modelo: alias "-latest" (no una versión fechada como "gemini-2.0-flash")
 * a propósito — ese modelo fue retirado por Google ("model ... is no
 * longer available") y rompió categorización y captura por voz a la vez
 * el 2026-07-18, justo por estar hardcodeado en dos lugares. El alias
 * apunta siempre al Flash vigente sin que haya que enterarse por un error
 * en producción cada vez que Google jubila una versión.
 */
const GEMINI_MODEL = "gemini-flash-latest";

/**
 * Llama a Gemini con un prompt que exige JSON y devuelve el texto crudo de
 * la respuesta, o null en cualquier fallo (key ausente, red, cuota, modelo
 * retirado, respuesta vacía). Loguea el motivo exacto para poder
 * diagnosticar desde los logs de Vercel sin adivinar.
 */
async function callGemini(prompt: string, context: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      },
    );
    if (!res.ok) {
      console.error(`[${context}] Gemini respondió`, res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error(`[${context}] Sin texto en la respuesta de Gemini:`, JSON.stringify(data));
      return null;
    }
    return text;
  } catch (err) {
    console.error(`[${context}] Excepción:`, err);
    return null;
  }
}

const responseSchema = z.object({
  category: z.string(),
  confidence: z.number().min(0).max(1),
});

export interface CategorySuggestion {
  category: string;
  confidence: number;
}

export async function suggestCategory(input: {
  merchant: string;
  amount: number;
  currency: Currency;
  type: TransactionType;
  availableCategories: string[];
}): Promise<CategorySuggestion | null> {
  const prompt = `Eres el categorizador de una app de finanzas personales de República Dominicana.
Clasifica esta transacción bancaria en UNA de las categorías disponibles.

Transacción:
- Comercio/remitente: ${input.merchant}
- Monto: ${currencySymbol(input.currency)} ${input.amount.toFixed(2)}
- Tipo: ${input.type === "expense" ? "gasto" : "ingreso"}

Categorías disponibles: ${input.availableCategories.join(" | ")}

Responde SOLO con JSON: {"category": "<una de las categorías disponibles>", "confidence": <0 a 1>}`;

  const text = await callGemini(prompt, "suggestCategory");
  if (!text) return null;

  const parsed = responseSchema.safeParse(JSON.parse(text));
  if (!parsed.success) return null;

  // Solo acepta categorías que existen — Gemini a veces inventa variantes.
  if (!input.availableCategories.includes(parsed.data.category)) return null;
  return parsed.data;
}

const voiceSchema = z.object({
  // Gemini a veces devuelve el monto como texto ("10") pese a pedirle un
  // número — coerce lo tolera; null sigue pasando intacto por nullable().
  amount: z.coerce.number().positive().nullable(),
  description: z.string(),
  category: z.string(),
});

export interface VoiceEntry {
  amount: number;
  description: string;
  category: string;
}

/**
 * Extrae una transacción de una frase dictada por voz (ej. "45 euros en el
 * súper" → {amount: 45, description: "súper", category: "Alimentación"}).
 * Usado por el endpoint de captura del Shortcut de iOS en modo dictado.
 *
 * Devuelve null si Gemini no está configurado, falla, o NO logra un monto
 * claro — a diferencia de la categorización de correos (que degrada suave),
 * aquí sin monto no hay transacción que guardar, y el endpoint le pide al
 * usuario que repita. La moneda NO se extrae del texto: la fija el endpoint
 * según la moneda de casa del usuario.
 */
export async function parseVoiceEntry(input: {
  text: string;
  availableCategories: string[];
}): Promise<VoiceEntry | null> {
  const prompt = `Eres el asistente de captura de gastos de una app de finanzas personales.
El usuario dictó una frase describiendo un gasto. Extrae los datos.

Frase dictada: "${input.text}"

Categorías disponibles: ${input.availableCategories.join(" | ")}

Reglas:
- "amount": el monto como número (sin símbolo de moneda). Si no hay un monto claro, usa null.
- "description": el comercio o concepto en pocas palabras (ej. "súper", "gasolina", "Netflix").
- "category": la MÁS adecuada de las categorías disponibles. Si ninguna encaja, usa "Otros".

Responde SOLO con JSON: {"amount": <número o null>, "description": "<texto>", "category": "<categoría>"}`;

  const text = await callGemini(prompt, "parseVoiceEntry");
  if (!text) return null;

  const parsed = voiceSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    console.error(
      "[parseVoiceEntry] Gemini devolvió:",
      text,
      "— error de validación:",
      parsed.error.message,
    );
    return null;
  }
  if (parsed.data.amount === null) {
    console.error("[parseVoiceEntry] Gemini no encontró un monto en:", input.text);
    return null; // sin monto no hay transacción
  }

  // Categoría inventada → "Otros" (la lista siempre la incluye).
  const category = input.availableCategories.includes(parsed.data.category)
    ? parsed.data.category
    : "Otros";
  return {
    amount: parsed.data.amount,
    description: parsed.data.description.trim() || "Gasto",
    category,
  };
}
