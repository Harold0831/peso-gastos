"use client";

import { useState } from "react";
import { verifyPasskey } from "@/lib/webauthn-client";

type Status = "idle" | "working" | "error";

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleUnlock() {
    setStatus("working");
    setMessage(null);
    const result = await verifyPasskey();
    // Sin passkeys registrados no hay nada que verificar — deja pasar en
    // vez de bloquear a alguien que aún no completó /login por otra vía.
    if (result.ok || result.noCredentials) {
      onUnlock();
      return;
    }
    setStatus("error");
    setMessage(result.error);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-8 pb-safe pt-safe">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-2xl font-extrabold text-white shadow-card">
          P
        </div>
        <h1 className="mt-6 text-xl font-bold tracking-tight text-ink">Peso está bloqueado</h1>
        <p className="mt-2 text-sm text-ink-muted">Verifica tu identidad para continuar.</p>

        <button
          onClick={handleUnlock}
          disabled={status === "working"}
          className="mt-8 w-full rounded-btn bg-accent px-6 py-4 text-[15px] font-bold text-white shadow-[0_4px_12px_rgba(37,99,235,0.25)] transition active:scale-[0.98] disabled:opacity-60"
        >
          {status === "working" ? "Verificando…" : "Desbloquear con Face ID"}
        </button>

        {message && <p className="mt-4 text-sm font-medium text-expense">{message}</p>}
      </div>
    </div>
  );
}
