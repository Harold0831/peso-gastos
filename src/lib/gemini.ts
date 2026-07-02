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
