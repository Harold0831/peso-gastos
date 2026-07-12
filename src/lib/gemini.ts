import "server-only";
import { z } from "zod";
import type { TransactionType } from "./types";

/**
 * Categorización automática con gemini-2.0-flash vía REST.
 * Devuelve null en cualquier fallo: la transacción se guarda sin sugerencia
 * y el usuario la categoriza a mano al confirmar — el sync nunca se cae por Gemini.
 */

const responseSchema = z.object({
  category: z.string(),
  confidence: z.number().min(0).max(1),
});

export interface CategorySuggestion {
  category: string;
  confidence: number;
}

const voiceSchema = z.object({
  amount: z.number().positive().nullable(),
  description: z.string(),
  category: z.string(),
});

export interface VoiceEntry {
  amount: number;
  description: string;
  category: string;
}

export async function suggestCategory(input: {
  merchant: string;
  amount: number;
  type: TransactionType;
  availableCategories: string[];
}): Promise<CategorySuggestion | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Eres el categorizador de una app de finanzas personales de República Dominicana.
Clasifica esta transacción bancaria en UNA de las categorías disponibles.

Transacción:
- Comercio/remitente: ${input.merchant}
- Monto: RD$ ${input.amount.toFixed(2)}
- Tipo: ${input.type === "expense" ? "gasto" : "ingreso"}

Categorías disponibles: ${input.availableCategories.join(" | ")}

Responde SOLO con JSON: {"category": "<una de las categorías disponibles>", "confidence": <0 a 1>}`;

  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
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
    if (!res.ok) return null;

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = responseSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;

    // Solo acepta categorías que existen — Gemini a veces inventa variantes.
    if (!input.availableCategories.includes(parsed.data.category)) return null;
    return parsed.data;
  } catch {
    return null;
  }
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `Eres el asistente de captura de gastos de una app de finanzas personales.
El usuario dictó una frase describiendo un gasto. Extrae los datos.

Frase dictada: "${input.text}"

Categorías disponibles: ${input.availableCategories.join(" | ")}

Reglas:
- "amount": el monto como número (sin símbolo de moneda). Si no hay un monto claro, usa null.
- "description": el comercio o concepto en pocas palabras (ej. "súper", "gasolina", "Netflix").
- "category": la MÁS adecuada de las categorías disponibles. Si ninguna encaja, usa "Otros".

Responde SOLO con JSON: {"amount": <número o null>, "description": "<texto>", "category": "<categoría>"}`;

  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
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
    if (!res.ok) return null;

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = voiceSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    if (parsed.data.amount === null) return null; // sin monto no hay transacción

    // Categoría inventada → "Otros" (la lista siempre la incluye).
    const category = input.availableCategories.includes(parsed.data.category)
      ? parsed.data.category
      : "Otros";
    return {
      amount: parsed.data.amount,
      description: parsed.data.description.trim() || "Gasto",
      category,
    };
  } catch {
    return null;
  }
}
