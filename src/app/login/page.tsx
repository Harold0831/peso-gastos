"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { verifyPasskey } from "@/lib/webauthn-client";
import { markAuthenticated } from "@/lib/app-lock";

type Status = "idle" | "working" | "error";

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleLogin() {
    setStatus("working");
    setMessage(null);
    try {
      const result = await verifyPasskey();
      if (!result.ok) {
        if (result.noCredentials) {
          // Primer uso: no hay passkeys registrados todavía → crear uno.
          await register();
          return;
        }
        throw new Error(result.error);
      }

      markAuthenticated();
      router.replace("/");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Algo salió mal, intenta de nuevo");
    }
  }

  async function register() {
    const optionsRes = await fetch("/api/auth/register/options", { method: "POST" });
    if (!optionsRes.ok) throw new Error("No se pudo iniciar el registro del passkey");

    const optionsJSON = await optionsRes.json();
    const attestation = await startRegistration({ optionsJSON });

    const verifyRes = await fetch("/api/auth/register/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(attestation),
    });
    if (!verifyRes.ok) {
      const body = await verifyRes.json().catch(() => null);
      throw new Error(body?.error ?? "No se pudo registrar el passkey");
    }
    markAuthenticated();
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-8 pb-safe">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-2xl font-extrabold text-white shadow-card">
          P
        </div>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-ink">Peso</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Tus gastos e ingresos, sincronizados desde Qik.
        </p>

        <button
          onClick={handleLogin}
          disabled={status === "working"}
          className="mt-10 w-full rounded-btn bg-accent px-6 py-4 text-[15px] font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,0.25)] transition active:scale-[0.98] disabled:opacity-60"
        >
          {status === "working" ? "Verificando…" : "Entrar con passkey"}
        </button>

        <p className="mt-4 text-xs text-ink-muted">
          En iPhone se abre Face ID automáticamente. La primera vez se crea tu passkey.
        </p>

        {message && <p className="mt-4 text-sm font-medium text-expense">{message}</p>}
      </div>
    </main>
  );
}
