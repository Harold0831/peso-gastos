"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import {
  deletePushSubscription,
  disableFaceId,
  logoutAction,
  savePushSubscription,
  sendFeedback,
  setEnabledBanks,
  setPassword,
} from "@/lib/actions";
import { markAuthenticated } from "@/lib/app-lock";
import { SUPPORTED_BANKS } from "@/lib/banks";
import { merchantInitials } from "@/lib/format";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";

interface ProfileClientProps {
  name: string;
  email: string;
  avatarUrl: string | null;
  gmail: {
    linked: boolean;
    email: string | null;
    syncEnabled: boolean;
    /** Ids de bancos a sincronizar; null = todos. */
    enabledBanks: string[] | null;
  };
  hasPasskey: boolean;
  /** true si las claves VAPID están configuradas en el servidor. */
  pushConfigured: boolean;
  /** true si la cuenta ya tiene contraseña (entró por correo o la fijó aquí). */
  passwordSet: boolean;
  demoMode?: boolean;
}

/** Clave pública VAPID (base64url) → Uint8Array para pushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function ProfileClient({
  name,
  email,
  avatarUrl,
  gmail,
  hasPasskey,
  pushConfigured,
  passwordSet,
  demoMode,
}: ProfileClientProps) {
  const router = useRouter();
  const toast = useToast();
  const [faceIdError, setFaceIdError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [disabling, startDisabling] = useTransition();
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  // Plataforma para las instrucciones de instalación de la PWA. Se detecta
  // tras el montaje (el user agent no existe en el render del servidor);
  // default iOS, el público principal de la app.
  const [platform, setPlatform] = useState<"ios" | "android">("ios");

  useEffect(() => {
    if (/android/i.test(navigator.userAgent)) setPlatform("android");
  }, []);

  // --- Notificaciones push ---
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    if (!pushConfigured) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setPushSupported(true);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setPushEnabled(Boolean(sub)))
      .catch(() => {});
  }, [pushConfigured]);

  async function enablePush() {
    setPushBusy(true);
    setPushError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushError("Permiso denegado — actívalo en los ajustes del navegador.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
        ) as BufferSource,
      });
      const result = await savePushSubscription(sub.toJSON());
      if (!result.ok) {
        await sub.unsubscribe().catch(() => {});
        setPushError(result.error ?? "No se pudo activar");
        return;
      }
      setPushEnabled(true);
      toast("✓ Notificaciones activadas");
    } catch (err) {
      console.error(err);
      setPushError("No se pudo activar. En iPhone, instala la app en tu inicio primero.");
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    setPushBusy(true);
    setPushError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setPushEnabled(false);
      toast("Notificaciones desactivadas");
    } catch {
      setPushError("No se pudo desactivar. Intenta de nuevo.");
    } finally {
      setPushBusy(false);
    }
  }

  const handleDisableFaceId = () => {
    startDisabling(async () => {
      const result = await disableFaceId();
      if (!result.ok) {
        setFaceIdError(result.error ?? "No se pudo desactivar");
        setConfirmingDisable(false);
        return;
      }
      toast("Face ID desactivado");
      setConfirmingDisable(false);
      router.refresh();
    });
  };
  const [feedback, setFeedback] = useState("");
  const [feedbackState, setFeedbackState] = useState<"idle" | "sent" | "error">("idle");
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  // null (todos) se materializa a la lista completa para los checkboxes
  const [banks, setBanks] = useState<string[]>(
    gmail.enabledBanks ?? SUPPORTED_BANKS.map((b) => b.id),
  );
  const [banksError, setBanksError] = useState<string | null>(null);
  const [savingBanks, startSavingBanks] = useTransition();

  const toggleBank = (id: string) => {
    setBanksError(null);
    const next = banks.includes(id) ? banks.filter((b) => b !== id) : [...banks, id];
    if (next.length === 0) {
      setBanksError("Deja al menos un banco activo");
      return;
    }
    const previous = banks;
    setBanks(next); // optimista: revierte si la action falla
    startSavingBanks(async () => {
      const result = await setEnabledBanks({ banks: next });
      if (!result.ok) {
        setBanks(previous);
        setBanksError(result.error ?? "No se pudo guardar");
      }
    });
  };

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

  // --- Contraseña (login por correo) ---
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [savingPw, startSavingPw] = useTransition();

  const handleSetPassword = () => {
    setPwError(null);
    startSavingPw(async () => {
      const result = await setPassword({
        password: newPw,
        ...(passwordSet ? { currentPassword: currentPw } : {}),
      });
      if (!result.ok) {
        setPwError(result.error ?? "No se pudo guardar");
        return;
      }
      toast(passwordSet ? "✓ Contraseña actualizada" : "✓ Contraseña creada");
      setPwOpen(false);
      setCurrentPw("");
      setNewPw("");
      router.refresh();
    });
  };

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
              Vincula tu Gmail para que Peso importe automáticamente las notificaciones de tus
              bancos (Qik, Popular, Caribe, Scotiabank, BHD). Sin esto, puedes registrar todo a mano
              con el botón +.
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

      {/* Bancos a sincronizar */}
      {gmail.linked && gmail.syncEnabled && (
        <section className={sectionClass}>
          <div className="flex items-center justify-between">
            <h2 className={labelClass}>Mis bancos</h2>
            {savingBanks && <span className="text-[11px] font-medium text-ink-muted">…</span>}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
            Peso solo busca correos de los bancos que marques aquí.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {SUPPORTED_BANKS.map((bank) => {
              const active = banks.includes(bank.id);
              return (
                <button
                  key={bank.id}
                  type="button"
                  onClick={() => toggleBank(bank.id)}
                  aria-pressed={active}
                  className={`rounded-pill border px-3.5 py-2 text-xs font-semibold transition ${
                    active
                      ? "border-accent bg-accent text-white"
                      : "border-line bg-surface text-ink"
                  }`}
                >
                  {active ? "✓ " : ""}
                  {bank.name}
                </button>
              );
            })}
          </div>
          {banksError && <p className="mt-2 text-xs font-medium text-expense">{banksError}</p>}
        </section>
      )}

      {/* Notificaciones push */}
      {pushConfigured && pushSupported && (
        <section className={sectionClass}>
          <h2 className={labelClass}>Notificaciones</h2>
          {pushEnabled ? (
            <>
              <div className="mt-3 flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-pill bg-income" />
                <p className="text-[13px] font-medium text-ink">
                  Activadas — te avisamos de transacciones por confirmar y presupuestos excedidos
                </p>
              </div>
              <button
                onClick={disablePush}
                disabled={pushBusy}
                className="mt-2 w-full py-2 text-center text-[13px] font-semibold text-ink-muted disabled:opacity-50"
              >
                {pushBusy ? "…" : "Desactivar en este dispositivo"}
              </button>
            </>
          ) : (
            <>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
                Recibe un aviso cuando lleguen transacciones por confirmar o superes un presupuesto.
                En iPhone, primero instala la app en tu pantalla de inicio.
              </p>
              <button
                onClick={enablePush}
                disabled={pushBusy || demoMode}
                className="mt-3 w-full rounded-btn bg-accent py-3 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {pushBusy ? "Activando…" : "Activar notificaciones"}
              </button>
            </>
          )}
          {pushError && <p className="mt-2 text-xs font-medium text-expense">{pushError}</p>}
        </section>
      )}

      {/* Contraseña — permite entrar sin Google. En iPhone es además la vía
          para no salir de la PWA al iniciar sesión (ver issue #29). */}
      <section className={sectionClass}>
        <h2 className={labelClass}>Contraseña</h2>
        {pwOpen ? (
          <>
            {passwordSet && (
              <input
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="Contraseña actual"
                className="mt-3 w-full rounded-btn border border-line bg-surface p-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent"
              />
            )}
            <input
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="Nueva contraseña (mínimo 8)"
              className="mt-2 w-full rounded-btn border border-line bg-surface p-3 text-sm text-ink outline-none placeholder:text-ink-muted focus:border-accent"
            />
            {pwError && <p className="mt-2 text-xs font-medium text-expense">{pwError}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setPwOpen(false);
                  setPwError(null);
                  setCurrentPw("");
                  setNewPw("");
                }}
                className="flex-1 rounded-btn border border-line py-2.5 text-[13px] font-semibold text-ink-muted"
              >
                Cancelar
              </button>
              <button
                onClick={handleSetPassword}
                disabled={savingPw || newPw.length < 8 || demoMode}
                className="flex-[1.5] rounded-btn bg-accent py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
              >
                {savingPw ? "Guardando…" : "Guardar contraseña"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-2.5">
              <span className={`h-2 w-2 rounded-pill ${passwordSet ? "bg-income" : "bg-line"}`} />
              <p className="text-[13px] font-medium text-ink">
                {passwordSet
                  ? "Puedes entrar con tu correo y contraseña"
                  : "Solo entras con Google"}
              </p>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
              {passwordSet
                ? "Útil en el iPhone: entrar con correo no saca la app del modo pantalla completa, como sí pasa con Google."
                : "Ponle una contraseña a tu cuenta para entrar sin Google. En iPhone evita que la app se abra con las barras del navegador al iniciar sesión."}
            </p>
            <button
              onClick={() => setPwOpen(true)}
              disabled={demoMode}
              className="mt-3 w-full rounded-btn bg-accent py-3 text-[13px] font-bold text-white disabled:opacity-50"
            >
              {passwordSet ? "Cambiar contraseña" : "Crear contraseña"}
            </button>
          </>
        )}
      </section>

      {/* Face ID */}
      <section className={sectionClass}>
        <h2 className={labelClass}>Bloqueo con Face ID</h2>
        {hasPasskey ? (
          <>
            <div className="mt-3 flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-pill bg-income" />
              <p className="text-[13px] font-medium text-ink">
                Activado — la app pide Face ID al abrirla o tras 30s en segundo plano
              </p>
            </div>
            <button
              onClick={() => setConfirmingDisable(true)}
              className="mt-2 w-full py-2 text-center text-[13px] font-semibold text-expense"
            >
              Desactivar Face ID
            </button>
            {faceIdError && <p className="mt-1 text-xs font-medium text-expense">{faceIdError}</p>}
            <ConfirmDialog
              open={confirmingDisable}
              title="¿Desactivar Face ID?"
              description="La app dejará de pedir tu identidad al abrirla. Puedes reactivarlo cuando quieras."
              confirmLabel="Desactivar"
              pending={disabling}
              onConfirm={handleDisableFaceId}
              onCancel={() => setConfirmingDisable(false)}
            />
          </>
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

      {/* Instalación PWA — instrucciones según la plataforma detectada */}
      <section className={sectionClass}>
        <h2 className={labelClass}>
          {platform === "android" ? "Instalar en tu Android" : "Instalar en tu iPhone"}
        </h2>
        {platform === "android" ? (
          <ol className="mt-3 list-inside list-decimal space-y-1.5 text-[13px] leading-relaxed text-ink-muted">
            <li>Abre esta página en Chrome</li>
            <li>
              Toca el menú <span className="font-semibold text-ink">⋮</span> (arriba a la derecha)
            </li>
            <li>
              Elige <span className="font-semibold text-ink">Agregar a pantalla principal</span>
            </li>
          </ol>
        ) : (
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
        )}
      </section>

      {/* Exportar datos */}
      <section className={sectionClass}>
        <h2 className={labelClass}>Tus datos</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          Descarga todas tus transacciones en un archivo CSV que puedes abrir en Excel o Google
          Sheets. Tuyas, cuando quieras.
        </p>
        {/* Un enlace normal y no un fetch: el navegador gestiona la descarga
            solo, con su barra de progreso, y funciona igual en iOS. */}
        <a
          href="/api/export"
          download
          className="mt-3 block w-full rounded-btn border border-line bg-surface py-3 text-center text-[13px] font-bold text-ink"
        >
          Descargar mis transacciones (CSV)
        </a>
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

      {/* Legal */}
      <div className="flex justify-center gap-5 px-5 pt-1 text-[12px]">
        <Link href="/privacy" className="font-semibold text-ink-muted">
          Privacidad
        </Link>
        <Link href="/terms" className="font-semibold text-ink-muted">
          Términos
        </Link>
      </div>

      {/* Cerrar sesión */}
      <div className="px-5 pt-3">
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full py-3 text-center text-[13px] font-semibold text-expense"
          >
            Cerrar sesión
          </button>
        </form>
      </div>

      {/* Eliminar cuenta: separado del resto y al final, para que nadie
          llegue aquí por accidente buscando otra cosa. */}
      <div className="mx-5 mb-6 mt-2 border-t border-line pt-4">
        <button
          onClick={() => setDeleteAccountOpen(true)}
          disabled={demoMode}
          className="w-full py-2 text-center text-[12px] font-semibold text-ink-muted disabled:opacity-50"
        >
          Eliminar mi cuenta y todos mis datos
        </button>
      </div>

      <DeleteAccountDialog open={deleteAccountOpen} onCancel={() => setDeleteAccountOpen(false)} />
    </main>
  );
}
