/**
 * Describe la ESTRUCTURA de un correo bancario que no se pudo parsear, sin
 * revelar su contenido.
 *
 * Por qué existe: cuando un banco cambia el formato de sus correos, el aviso
 * de monitoreo dice qué falló pero no cómo se ve ahora el correo — y quien
 * recibe la alerta (el que opera la instancia) casi nunca es el dueño del
 * buzón, así que no puede mirarlo. Sin esto, arreglar el parser depende de
 * pedirle el correo a esa persona.
 *
 * Por qué solo la estructura: el cuerpo es una notificación bancaria de otra
 * persona — montos, dónde compró, su nómina. La política de privacidad
 * promete que el cuerpo se descarta y no se comparte con nadie, y Discord o
 * Slack no están en la lista de terceros. Para arreglar un parser, además,
 * los valores dan igual: lo que hace falta es saber qué etiquetas trae el
 * correo y en qué orden. Así que las etiquetas conocidas se muestran tal
 * cual y **todo lo demás se sustituye por un marcador de posición**.
 */

/**
 * Etiquetas que los parsers buscan, recogidas de los seis bancos. Una línea
 * solo se muestra literal si coincide con una de estas: cualquier otra cosa
 * (un comercio, un nombre, un monto) se oculta.
 *
 * Es una lista blanca y no una heurística a propósito. Lo tentador sería
 * "muestra las líneas sin números", pero los nombres de comercio no llevan
 * números — "SUPERMERCADO NACIONAL" pasaría el filtro y se filtraría dónde
 * compra alguien.
 */
const KNOWN_LABELS = [
  "monto",
  "monto total pagado",
  "moneda",
  "fecha",
  "fecha y hora",
  "hora",
  "comercio",
  "estatus",
  "estado",
  "localidad",
  "lugar",
  "tarjeta",
  "tarjeta debito",
  "tarjeta credito",
  "forma de pago",
  "balance disponible",
  "balance",
  "disponible",
  "servicio",
  "realizado por",
  "descripcion",
  "concepto",
  "referencia",
  "autorizacion",
  "numero de autorizacion",
  "cuenta",
  "tipo de transaccion",
  "tipo",
  "beneficiario",
  "origen",
  "destino",
  "total",
  "nombre",
  "banco",
  "sucursal",
  "canal",
];

/** Sin acentos, minúsculas y sin los dos puntos finales. */
function normalizeLabel(line: string): string {
  return line
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[:：]\s*$/, "")
    .trim();
}

/** Marcador que describe la FORMA de un valor, nunca el valor. */
function placeholder(line: string): string {
  if (/^https?:\/\//i.test(line)) return "‹enlace›";
  if (/^[\d.,\s]+$/.test(line)) return "‹número›";
  if (/^\d{1,4}[-/]\d{1,2}[-/]\d{2,4}/.test(line)) return "‹fecha›";
  if (/(rd\s*\$|us\$|\$|eur)\s*[\d.,]+/i.test(line)) return "‹monto›";
  if (/\d{4}\s*$/.test(line) && line.length <= 24) return "‹algo terminado en 4 dígitos›";
  return `‹texto ${line.length}›`;
}

const MAX_LINES = 35;

/**
 * Devuelve el "esqueleto" del correo: una línea por cada línea del original,
 * con las etiquetas conocidas literales y el resto como marcadores.
 */
export function describeEmailStructure(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const described = lines.slice(0, MAX_LINES).map((line, i) => {
    const normalized = normalizeLabel(line);
    const isLabel = KNOWN_LABELS.includes(normalized);
    return `${String(i + 1).padStart(2, " ")}. ${isLabel ? `"${line}"  ← etiqueta conocida` : placeholder(line)}`;
  });

  if (lines.length > MAX_LINES) {
    described.push(`… y ${lines.length - MAX_LINES} línea(s) más`);
  }
  return described;
}

/**
 * Qué etiquetas conocidas aparecen y cuáles no. Suele ser lo que resuelve el
 * misterio de un tirón: "el parser busca Comercio y ya no está".
 */
export function labelsPresent(text: string): string[] {
  const found = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const normalized = normalizeLabel(line.trim());
    if (KNOWN_LABELS.includes(normalized)) found.add(normalized);
  }
  return [...found];
}
