"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register";

/**
 * Login/registro con correo, como alternativa a Google. Es same-origin a
 * propósito: en iOS, salir a accounts.google.com saca a la PWA del modo
 * standalone y la sesión termina en el almacén equivocado (ver issue #29).
 * Por aquí nunca se abandona el dominio.
 */
export function EmailAuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/email/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "login" ? { email, password } : { name, email, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "No se pudo continuar. Inténtalo de nuevo.");
        return;
      }
      // La sesión ya viene en la cookie de la respuesta.
      router.replace("/");
      router.refresh();
    } catch {
      setError("No hay conexión. Revisa tu internet e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "w-full rounded-btn border border-line bg-surface p-3.5 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent";

  return (
    <form onSubmit={submit} className="mt-4 w-full text-left">
      {mode === "register" && (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre"
          autoComplete="name"
          maxLength={60}
          required
          className={`${inputClass} mb-2`}
        />
      )}
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        inputMode="email"
        autoCapitalize="none"
        autoComplete="email"
        placeholder="Correo"
        required
        className={`${inputClass} mb-2`}
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        type="password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        placeholder={mode === "login" ? "Contraseña" : "Contraseña (mínimo 8 caracteres)"}
        required
        className={inputClass}
      />

      {error && <p className="mt-3 text-sm font-medium text-expense">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-3 w-full rounded-btn bg-accent py-4 text-[15px] font-bold text-white shadow-card transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy ? "Un momento…" : mode === "login" ? "Entrar" : "Crear cuenta"}
      </button>

      <p className="mt-3 text-center text-[13px] text-ink-muted">
        {mode === "login" ? (
          <>
            ¿No tienes cuenta?{" "}
            <button
              type="button"
              onClick={() => switchMode("register")}
              className="font-semibold text-accent"
            >
              Créala aquí
            </button>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta?{" "}
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="font-semibold text-accent"
            >
              Entra aquí
            </button>
          </>
        )}
      </p>

      {mode === "login" && (
        <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-muted">
          ¿Olvidaste tu contraseña? Entra con Google usando el mismo correo y cámbiala desde tu
          perfil.
        </p>
      )}
    </form>
  );
}
