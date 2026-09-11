import "server-only";
import { z } from "zod";
import { currencySymbol } from "./format";
import type { Currency, ParsedBankEmail, TransactionType } from "./types";

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

/**
 * Esquema de un correo bancario leído por la IA. Todo puede venir null: es
 * preferible que Gemini admita que no sabe a que invente un monto.
 */
const emailSchema = z.object({
  type: z.enum(["expense", "income"]).nullable(),
  merchant: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.enum(["DOP", "USD", "EUR"]).nullable(),
  date: z.string().nullable(),
  card_last4: z.string().nullable(),
  is_transaction: z.boolean(),
});

/**
 * Lee un correo bancario que NINGÚN parser de regex supo leer.
 *
 * Es una RED, no un reemplazo. Los parsers de regex siguen siendo la vía
 * principal porque son deterministas y están cubiertos por tests con correos
 * reales; esto solo entra cuando uno falla, que es justo el escenario en el
 * que hoy las transacciones desaparecen en silencio.
 *
 * Lo que sale de aquí SIEMPRE entra sin confirmar y sin auto-confirmación
 * (ver runSyncForUser): un modelo de lenguaje leyendo el monto del dinero de
 * alguien tiene que pasar por ojos humanos antes de contar en un saldo o en
 * un presupuesto. Por eso también se marca la fila con `source='ai'`.
 *
 * Recibe TEXTO plano (htmlToText), no el HTML: el markup no aporta nada para
 * extraer campos y multiplicaría los tokens por diez.
 *
 * `receivedAt` se pasa porque hay bancos cuyos correos traen hora pero no
 * fecha (Scotiabank), igual que los parsers de regex.
 */
export async function parseEmailWithAi(input: {
  bank: string;
  subject: string;
  body: string;
  receivedAt: Date;
}): Promise<ParsedBankEmail | null> {
  // Recorte defensivo: un correo bancario útil cabe de sobra, y evita mandar
  // un boletín gigante que se colara por el filtro de remitentes.
  const body = input.body.slice(0, 6000);

  const prompt = `Eres un extractor de datos de notificaciones bancarias de República Dominicana.
Lee este correo del banco ${input.bank} y extrae la transacción.

Asunto: ${input.subject}
Fecha de recepción: ${input.receivedAt.toISOString()}

Cuerpo:
${body}

Reglas:
- "is_transaction": false si el correo NO es un movimiento de dinero (estado de cuenta, clave de un solo uso, aviso de vencimiento, promoción, compra DECLINADA o rechazada). En ese caso todo lo demás va null.
- "type": "expense" si sale dinero (compra, retiro, pago, transferencia enviada), "income" si entra (depósito, transferencia recibida, reembolso, nómina).
- "amount": número positivo, sin símbolo ni separador de miles. Usa el monto de ESTA transacción, nunca el balance disponible ni el límite de la tarjeta.
- "currency": "DOP" para RD$/pesos, "USD" para US$/dólares, "EUR" para euros.
- "date": fecha y hora en ISO 8601 con zona horaria. La hora de RD es AST (UTC-4, sin horario de verano). Si el correo trae fecha sin hora, usa las 12:00 de ese día. Si no trae fecha, usa la de recepción.
- "card_last4": los últimos 4 dígitos de la tarjeta si aparecen; si no, null.
- Si un campo no está en el correo, usa null. NO inventes valores.

Responde SOLO con JSON: {"is_transaction": <bool>, "type": <"expense"|"income"|null>, "merchant": <texto|null>, "amount": <número|null>, "currency": <"DOP"|"USD"|"EUR"|null>, "date": <ISO|null>, "card_last4": <texto|null>}`;

  const text = await callGemini(prompt, "parseEmailWithAi");
  if (!text) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    console.error("[parseEmailWithAi] Gemini no devolvió JSON:", text.slice(0, 300));
    return null;
  }

  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("[parseEmailWithAi] JSON inválido:", text.slice(0, 300), parsed.error.message);
    return null;
  }

  const d = parsed.data;
  if (!d.is_transaction) return null;

  // Sin monto, tipo o comercio no hay transacción que insertar. Preferimos
  // no registrar nada antes que registrar una fila a medias que el usuario
  // tendría que descifrar.
  if (d.amount === null || d.amount <= 0 || !d.type || !d.merchant?.trim()) {
    console.error("[parseEmailWithAi] Faltan campos mínimos:", text.slice(0, 300));
    return null;
  }

  // Una fecha inventada o mal formada rompería el mes de la transacción; el
  // correo llegó cuando llegó, así que ese es el respaldo honesto.
  const date = d.date ? new Date(d.date) : input.receivedAt;
  const validDate = Number.isNaN(date.getTime()) ? input.receivedAt : date;

  return {
    type: d.type,
    merchant: d.merchant.trim().slice(0, 120),
    amount: d.amount,
    currency: d.currency ?? "DOP",
    date: validDate,
    card_last4: d.card_last4?.replace(/\D/g, "").slice(-4) || null,
    available_balance: null,
  };
}
