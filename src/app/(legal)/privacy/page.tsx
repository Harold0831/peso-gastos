import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de privacidad · Peso",
  description: "Qué datos guarda Peso, para qué los usa y cómo eliminarlos.",
};

/**
 * Política de privacidad. Además de ser lo correcto, es un REQUISITO de
 * Google: para pedir el scope gmail.readonly hay que publicar una URL de
 * política accesible sin login, y declarar el uso limitado de los datos
 * (Limited Use). El texto describe lo que la app hace de verdad — si cambia
 * lo que se guarda o con quién se comparte, hay que actualizar esto Y la
 * fecha en lib/legal.ts.
 */
export default function PrivacyPage() {
  return (
    <>
      <h1>Política de privacidad</h1>
      <p className="updated">Última actualización: {LEGAL_UPDATED}</p>

      <p>
        Peso es una aplicación de finanzas personales que reúne tus gastos e ingresos en un solo
        lugar. Esta política explica, sin rodeos, qué datos guarda, para qué los usa y cómo puedes
        eliminarlos.
      </p>

      <h2>En resumen</h2>
      <ul>
        <li>Tus datos financieros son tuyos y solo tú los ves dentro de la app.</li>
        <li>Peso no vende ni alquila tu información a nadie, ni la usa para publicidad.</li>
        <li>
          Si vinculas tu Gmail, Peso lee <strong>únicamente</strong> las notificaciones de los bancos
          que hayas activado — nunca el resto de tu correo.
        </li>
        <li>
          Puedes eliminar tu cuenta y todos tus datos en cualquier momento desde tu perfil, sin
          pedírselo a nadie.
        </li>
      </ul>

      <h2>Qué datos guarda Peso</h2>

      <h3>Datos de tu cuenta</h3>
      <ul>
        <li>
          Si entras con Google: tu correo, tu nombre, tu foto de perfil y el identificador de tu
          cuenta de Google.
        </li>
        <li>
          Si te registras con correo y contraseña: tu correo, tu nombre y un{" "}
          <strong>hash</strong> de tu contraseña (scrypt). La contraseña en sí nunca se guarda y no
          se puede recuperar del hash.
        </li>
      </ul>

      <h3>Datos financieros que tú registras o que Peso importa</h3>
      <ul>
        <li>Transacciones: monto, moneda, fecha, comercio, categoría y últimos 4 dígitos de la tarjeta cuando el banco los incluye.</li>
        <li>Presupuestos, metas de ahorro, gastos fijos, tarjetas y categorías que crees.</li>
        <li>Tu saldo de apertura, si lo ajustas manualmente.</li>
      </ul>

      <h3>Datos técnicos</h3>
      <ul>
        <li>
          Si vinculas Gmail: un <em>token</em> de acceso de Google, guardado{" "}
          <strong>cifrado</strong> (AES-256-GCM), y el identificador de cada correo ya procesado
          para no importarlo dos veces.
        </li>
        <li>Si activas Face ID: la clave pública de tu passkey (nunca tu huella ni tu rostro, que jamás salen de tu dispositivo).</li>
        <li>Si activas notificaciones: la dirección de envío que te asigna tu navegador o sistema.</li>
        <li>Si usas el atajo de voz de iOS: un hash del token de ese atajo.</li>
        <li>Los comentarios que envíes desde la sección de sugerencias de tu perfil.</li>
      </ul>

      <p>
        Peso <strong>no</strong> usa cookies de publicidad ni de analítica, ni rastrea tu navegación.
        La única cookie es la de tu sesión, necesaria para mantenerte dentro de la app.
      </p>

      <h2>Cómo usa Peso el acceso a tu Gmail</h2>

      <p>
        Vincular Gmail es <strong>opcional</strong>: puedes usar Peso registrando todo a mano. Si lo
        vinculas, Peso pide el permiso <code>gmail.readonly</code> (solo lectura) y lo usa así:
      </p>

      <ul>
        <li>
          <strong>Solo busca correos de bancos.</strong> La búsqueda se limita a las direcciones de
          notificación de los bancos que tú activas en tu perfil. Los demás correos de tu bandeja
          nunca se descargan ni se leen.
        </li>
        <li>
          <strong>No se guarda el correo.</strong> De cada notificación bancaria se extraen el monto,
          la fecha, el comercio y la tarjeta; el cuerpo del mensaje se descarta y no queda
          almacenado.
        </li>
        <li>
          <strong>Nunca se envía, borra ni modifica</strong> nada en tu cuenta de Gmail. El permiso
          es de solo lectura y no lo permitiría.
        </li>
        <li>
          <strong>Puedes revocarlo cuando quieras</strong>, desde tu perfil en Peso o desde{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer noopener"
          >
            los permisos de tu cuenta de Google
          </a>
          . Al hacerlo, la importación automática se detiene.
        </li>
      </ul>

      <p>
        El uso y la transferencia por parte de Peso de la información recibida de las APIs de Google
        se ajusta a la{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer noopener"
        >
          Política de Datos de Usuario de los Servicios de API de Google
        </a>
        , incluidos sus requisitos de Uso Limitado (<em>Limited Use</em>). En particular, los datos
        obtenidos de Gmail se usan exclusivamente para mostrarte tus propias transacciones dentro de
        Peso, no se transfieren a terceros salvo lo descrito abajo, no se usan con fines
        publicitarios y no se emplean para entrenar modelos de inteligencia artificial
        generalizados.
      </p>

      <h2>Con quién se comparten tus datos</h2>

      <p>Peso no vende tus datos. Se apoya en estos proveedores para funcionar:</p>

      <ul>
        <li>
          <strong>Supabase</strong> — la base de datos donde viven tus transacciones y tu cuenta.
        </li>
        <li>
          <strong>Vercel</strong> — el servidor donde corre la aplicación.
        </li>
        <li>
          <strong>Google (Gmail API)</strong> — de donde se leen las notificaciones bancarias, si
          vinculaste tu correo.
        </li>
        <li>
          <strong>Google (Gemini API)</strong> — para sugerirte una categoría, Peso le envía{" "}
          <em>el nombre del comercio, el monto, la moneda y si es gasto o ingreso</em>. No se le
          envía tu nombre, tu correo, tu número de tarjeta ni el correo original. Si usas el atajo de
          voz, también recibe la frase que dictaste.
        </li>
        <li>
          <strong>open.er-api.com</strong> — la tasa de cambio del día. No recibe ningún dato tuyo:
          solo se le pregunta cuánto vale el dólar.
        </li>
        <li>
          <strong>El servicio de notificaciones de tu dispositivo</strong> (Apple o Google), si
          activas las notificaciones push.
        </li>
      </ul>

      <p>
        También se compartirán datos si la ley lo exige mediante un requerimiento válido de una
        autoridad competente.
      </p>

      <h2>Cuánto tiempo se guardan</h2>

      <p>
        Mientras tengas la cuenta abierta. Cuando eliminas tu cuenta desde tu perfil, se borran de
        inmediato y de forma permanente tus transacciones, presupuestos, metas, gastos fijos,
        tarjetas, categorías, el token de Gmail y tu perfil. La eliminación{" "}
        <strong>no se puede deshacer</strong> y no queda una copia tuya en la aplicación. Las copias
        de seguridad de la base de datos pueden conservar los datos unos días más antes de rotarse.
      </p>

      <h2>Tus derechos</h2>

      <ul>
        <li>
          <strong>Acceder</strong> a tus datos: están todos visibles dentro de la app.
        </li>
        <li>
          <strong>Corregirlos</strong>: puedes editar o eliminar cualquier transacción.
        </li>
        <li>
          <strong>Eliminarlos</strong>: Perfil → Eliminar cuenta.
        </li>
        <li>
          <strong>Retirar el permiso de Gmail</strong> sin perder el resto de tu cuenta.
        </li>
      </ul>

      <h2>Seguridad</h2>

      <p>
        La conexión siempre va cifrada (HTTPS). Los tokens de Gmail se guardan cifrados con
        AES-256-GCM y las contraseñas como hash scrypt. Cada consulta a la base de datos está acotada
        a tu usuario. Aun así, ningún sistema es infalible: Peso es un proyecto pequeño y no puede
        garantizar seguridad absoluta.
      </p>

      <h2>Menores de edad</h2>

      <p>Peso no está dirigida a menores de 13 años y no recoge datos de ellos a sabiendas.</p>

      <h2>Cambios a esta política</h2>

      <p>
        Si cambia algo relevante, se actualizará esta página y la fecha de arriba. Los cambios
        importantes se avisarán dentro de la app.
      </p>

      <h2>Contacto</h2>

      <p>
        Para cualquier duda sobre tus datos, escribe a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <p>
        Ver también los <Link href="/terms">términos de uso</Link>.
      </p>
    </>
  );
}
