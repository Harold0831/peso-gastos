import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Términos de uso · Peso",
  description: "Las reglas de uso de Peso y sus límites de responsabilidad.",
};

/**
 * Términos de uso. Google los pide junto a la política de privacidad al
 * verificar la app, y delimitan lo que Peso promete: es una herramienta de
 * organización, no un servicio financiero ni la fuente de verdad de tu
 * dinero (esa es tu banco).
 */
export default function TermsPage() {
  return (
    <>
      <h1>Términos de uso</h1>
      <p className="updated">Última actualización: {LEGAL_UPDATED}</p>

      <p>
        Al crear una cuenta en Peso aceptas estos términos. Están escritos para que se entiendan:
        si algo no te queda claro, escribe antes de usar la app.
      </p>

      <h2>Qué es Peso</h2>

      <p>
        Peso es una herramienta personal para organizar tus gastos e ingresos. Puede importar
        automáticamente las notificaciones que tu banco te envía por correo, categorizarlas y
        mostrarte resúmenes.
      </p>

      <p>
        Peso <strong>no es un banco</strong> ni una entidad financiera. No mueve dinero, no hace
        pagos, no accede a tus cuentas bancarias y no tiene relación con las instituciones cuyas
        notificaciones lee. Tampoco es asesoría financiera, contable ni fiscal.
      </p>

      <h2>Tu cuenta</h2>

      <ul>
        <li>Debes tener al menos 13 años y darnos datos veraces.</li>
        <li>Eres responsable de tu contraseña y del dispositivo donde dejas la sesión abierta.</li>
        <li>Una cuenta es para una persona; no la compartas.</li>
        <li>
          Puedes eliminarla cuando quieras desde tu perfil. Al hacerlo se borran tus datos de forma
          permanente.
        </li>
      </ul>

      <h2>Uso aceptable</h2>

      <p>No uses Peso para:</p>

      <ul>
        <li>Acceder a la cuenta o al correo de otra persona sin su permiso.</li>
        <li>Intentar vulnerar, sobrecargar o interrumpir el servicio.</li>
        <li>Extraer datos de forma automatizada más allá de lo que la app ofrece.</li>
        <li>Cualquier fin ilegal.</li>
      </ul>

      <h2>Los números pueden estar mal</h2>

      <p>
        Esto es importante. Peso deduce tus transacciones interpretando los correos que envían los
        bancos y sugiere categorías usando inteligencia artificial. Ambas cosas pueden fallar:
      </p>

      <ul>
        <li>Un banco puede cambiar el formato de sus correos y dejar de importarse sin avisar.</li>
        <li>Una transacción puede duplicarse, faltar o quedar con un monto o fecha incorrectos.</li>
        <li>Las categorías sugeridas son una estimación, no una clasificación contable.</li>
        <li>Las tasas de cambio provienen de un proveedor externo y son solo de referencia.</li>
      </ul>

      <p>
        <strong>
          La fuente de verdad de tu dinero es tu banco, no Peso.
        </strong>{" "}
        No tomes decisiones financieras, fiscales o legales basándote únicamente en lo que veas aquí,
        y verifica siempre contra tus estados de cuenta.
      </p>

      <h2>Disponibilidad del servicio</h2>

      <p>
        Peso es un proyecto personal, ofrecido tal cual y según disponibilidad. Puede haber caídas,
        interrupciones o pérdida de datos. El servicio puede cambiar o dejar de existir; si va a
        cerrarse, se avisará con antelación razonable para que puedas guardar tu información.
      </p>

      <h2>Límite de responsabilidad</h2>

      <p>
        En la máxima medida que permita la ley aplicable, Peso se ofrece sin garantías de ningún
        tipo, expresas o implícitas, y no se asume responsabilidad por daños derivados de su uso,
        incluidas pérdidas económicas, decisiones tomadas a partir de la información mostrada,
        pérdida de datos o interrupciones del servicio.
      </p>

      <h2>Tus datos y tu contenido</h2>

      <p>
        Tus transacciones y demás información siguen siendo tuyas. Peso solo las procesa para
        prestarte el servicio, como se detalla en la{" "}
        <Link href="/privacy">política de privacidad</Link>.
      </p>

      <h2>Suspensión</h2>

      <p>
        Se puede suspender o cerrar una cuenta que incumpla estos términos o que ponga en riesgo el
        servicio o a otras personas.
      </p>

      <h2>Cambios</h2>

      <p>
        Estos términos pueden actualizarse. La fecha de arriba indica la última versión, y los
        cambios importantes se avisarán dentro de la app. Seguir usando Peso después de un cambio
        significa que lo aceptas.
      </p>

      <h2>Contacto</h2>

      <p>
        Escribe a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </>
  );
}
