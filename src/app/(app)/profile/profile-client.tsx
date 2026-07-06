"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { logoutAction, sendFeedback } from "@/lib/actions";
import { markAuthenticated } from "@/lib/app-lock";
import { merchantInitials } from "@/lib/format";

interface ProfileClientProps {
  name: string;
  email: string;
  avatarUrl: string | null;
  gmail: { linked: boolean; email: string | null; syncEnabled: boolean };
  hasPasskey: boolean;
  demoMode?: boolean;
}

export function ProfileClient({
  name,
  email,
  avatarUrl,
  gmail,
  hasPasskey,
  demoMode,
}: ProfileClientProps) {
  const router = useRouter();
  const [faceIdError, setFaceIdError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackState, setFeedbackState] = useState<"idle" | "sent" | "error">("idle");
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  async function activateFaceId() {
    setRegistering(true);
    setFaceIdError(null);
    try {
      const optionsRes = await fetch("/api/auth/register/options", { method: "POST" });
      if (!optionsRes.ok) throw new Error("No se pudo iniciar el registro");
      const optionsJSON = await optionsRes.json();
      const attestation = await startRegistration({ optionsJSON });
      const verifyRes = await fetch("/api/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attestation),
      });
      if (!verifyRes.ok) {
        const body = await verifyRes.json().catch(() => null);
        throw new Error(body?.error ?? "No se pudo registrar");
      }
      markAuthenticated(); // no pedir Face ID inmediatamente después de activarlo
      router.refresh();
    } catch (err) {
      setFaceIdError(err instanceof Error ? err.message : "Algo salió mal");
    } finally {
      setRegistering(false);
    }
  }

  const handleSendFeedback = () => {
    setFeedbackError(null);
    startSending(async () => {
      const result = await sendFeedback(feedback);
      if (!result.ok) {
        setFeedbackState("error");
        setFeedbackError(result.error ?? "No se pudo enviar");
        return;
      }
      setFeedbackState("sent");
      setFeedback("");
    });
  };

  const sectionClass = "mx-5 mb-3.5 rounded-card border border-line bg-card p-5";
  const labelClass = "text-xs font-semibold uppercase tracking-wide text-ink-muted";

  return (
    <main className="pt-safe">
      <div className="px-5 py-4">
        <h1 className="text-[28px] font-extrabold tracking-tight text-ink">Perfil</h1>
      </div>

      {/* Identidad */}
      <section className={`${sectionClass} flex items-center gap-4`}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="h-12 w-12 rounded-pill"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-pill bg-accent text-base font-semibold text-white">
            {merchantInitials(name)}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold tracking-tight text-ink">{name}</div>
          <div className="truncate text-[12px] text-ink-muted">{email}</div>
        </div>
      </section>

      {/* Gmail */}
      <section className={sectionClass}>
        <h2 className={labelClass}>Importación desde Gmail</h2>
        {gmail.linked && gmail.syncEnabled ? (
          <div className="mt-3 flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-pill bg-income" />
            <p className="text-[13px] font-medium text-ink">
              Conectado como <span className="font-semibold">{gmail.email}</span>
            </p>
          </div>
        ) : gmail.linked ? (
          <>
            <div className="mt-3 flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-pill bg-warning" />
              <p className="text-[13px] font-medium text-ink">
                El acceso a <span className="font-semibold">{gmail.email}</span> expiró
              </p>
            </div>
            <a
              href="/api/auth/google?consent=1"
              className="mt-3 block w-full rounded-btn bg-accent py-3 text-center text-[13px] font-bold text-white"
            >
              Reconectar Gmail
            </a>
          </>
        ) : (
          <>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
              Vincula tu Gmail para que Peso importe automáticamente tus transacciones de Qik. Sin
              esto, puedes registrar todo a mano con el botón +.
            </p>
            <a
              href="/api/auth/google?consent=1"
              className="mt-3 block w-full rounded-btn bg-accent py-3 text-center text-[13px] font-bold text-white"
            >
              Vincular Gmail
            </a>
          </>
        )}
      </section>

      {/* Face ID */}
      <section className={sectionClass}>
        <h2 className={labelClass}>Bloqueo con Face ID</h2>
        {hasPasskey ? (
          <div className="mt-3 flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-pill bg-income" />
            <p className="text-[13px] font-medium text-ink">
              Activado — la app pide Face ID al abrirla o tras 30s en segundo plano
            </p>
          </div>
        ) : (
          <>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
              Protege la app pidiendo Face ID (o el desbloqueo de tu dispositivo) cada vez que la
              abras.
            </p>
            <button
              onClick={activateFaceId}
              disabled={registering || demoMode}
              className="mt-3 w-full rounded-btn bg-accent py-3 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {registering ? "Activando…" : "Activar Face ID"}
            </button>
            {faceIdError && <p className="mt-2 text-xs font-medium text-expense">{faceIdError}</p>}
          </>
        )}
      </section>

      {/* Instalación PWA */}
      <section className={sectionClass}>
        <h2 className={labelClass}>Instalar en tu iPhone</h2>
        <ol className="mt-3 list-inside list-decimal space-y-1.5 text-[13px] leading-relaxed text-ink-muted">
          <li>Abre esta página en Safari</li>
          <li>
            Toca el botón <span className="font-semibold text-ink">Compartir</span> (cuadro con
            flecha)
          </li>
          <li>
            Elige <span className="font-semibold text-ink">Agregar a inicio</span>
          </li>
        </ol>
      </section>

      {/* Feedback */}
      <section className={sectionClass}>
        <h2 className={labelClass}>¿Qué mejorarías de Peso?</h2>
        {feedbackState === "sent" ? (
          <p className="mt-3 text-[13px] font-medium text-income">
            ¡Gracias! Tu comentario fue enviado.
          </p>
        ) : (
          <>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Cuéntanos qué te gustaría que la app hiciera distinto…"
              rows={3}
              maxLength={2000}
              className="mt-3 w-full resize-none rounded-btn border border-line bg-surface p-3 text-[13px] text-ink outline-none placeholder:text-ink-muted focus:border-accent"
            />
            {feedbackError && (
              <p className="mt-1 text-xs font-medium text-expense">{feedbackError}</p>
            )}
            <button
              onClick={handleSendFeedback}
              disabled={sending || !feedback.trim() || demoMode}
              className="mt-2 w-full rounded-btn bg-accent py-3 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {sending ? "Enviando…" : "Enviar comentario"}
            </button>
          </>
        )}
      </section>

      {/* Cerrar sesión */}
      <div className="px-5 pb-6">
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full py-3 text-center text-[13px] font-semibold text-expense"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
