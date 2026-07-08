import Link from "next/link";
import { SUPPORTED_BANKS } from "@/lib/banks";

interface OnboardingCardProps {
  gmailLinked: boolean;
}

function Step({
  done,
  number,
  title,
  detail,
}: {
  done: boolean;
  number: number;
  title: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-pill text-[11px] font-bold ${
          done ? "bg-income text-white" : "bg-accent/10 text-accent"
        }`}
      >
        {done ? "✓" : number}
      </span>
      <span className="min-w-0">
        <span
          className={`block text-[13px] font-semibold ${done ? "text-ink-muted line-through" : "text-ink"}`}
        >
          {title}
        </span>
        <span className="block text-[11px] leading-relaxed text-ink-muted">{detail}</span>
      </span>
    </li>
  );
}

/**
 * Guía de primeros pasos, mostrada en el dashboard solo mientras el
 * usuario no tiene transacciones. Desaparece sola con el primer
 * movimiento (importado o manual) — no necesita estado de "descartar".
 */
export function OnboardingCard({ gmailLinked }: OnboardingCardProps) {
  const bankNames = SUPPORTED_BANKS.map((b) => b.name).join(", ");
  return (
    <section className="mt-3.5 rounded-card border border-line bg-card p-5">
      <h2 className="text-[15px] font-bold tracking-tight text-ink">Bienvenido a Peso 👋</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
        Conecta tu correo y tus gastos se registran solos cuando el banco te notifica.
      </p>
      <ol className="mt-4 space-y-3.5">
        <Step done number={1} title="Crea tu cuenta" detail="Listo — ya estás dentro." />
        <Step
          done={gmailLinked}
          number={2}
          title="Vincula tu Gmail"
          detail="Peso solo lee las notificaciones de tus bancos, nada más."
        />
        <Step
          done={false}
          number={3}
          title="Elige tus bancos"
          detail={`Soportamos ${bankNames}. Todos vienen activados — desmarca los que no uses en tu perfil.`}
        />
        <Step
          done={false}
          number={4}
          title="Registra tu primer gasto"
          detail="Llega solo desde el correo, o créalo a mano con el botón +."
        />
      </ol>
      {gmailLinked ? (
        <Link
          href="/profile"
          className="mt-5 block w-full rounded-btn bg-accent py-3 text-center text-[13px] font-bold text-white"
        >
          Revisar mis bancos
        </Link>
      ) : (
        // <a> normal: /api/auth/google es un route handler, no una página
        <a
          href="/api/auth/google?consent=1"
          className="mt-5 block w-full rounded-btn bg-accent py-3 text-center text-[13px] font-bold text-white"
        >
          Vincular Gmail
        </a>
      )}
    </section>
  );
}
