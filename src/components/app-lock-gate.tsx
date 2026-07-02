"use client";

import { useLayoutEffect, useState } from "react";
import { isLockRequired, markAuthenticated } from "@/lib/app-lock";
import { LockScreen } from "./lock-screen";

/**
 * Overlay de bloqueo biométrico sobre el shell de la app. El contenido real
 * ya está montado detrás (evita perder estado/datos al bloquear), pero el
 * overlay lo tapa por completo hasta que se re-verifica el passkey.
 *
 * Arranca sin bloquear (para no chocar con SSR, que no tiene sessionStorage)
 * y usa useLayoutEffect para decidir sincrónicamente, antes del primer
 * paint del navegador, si hay que mostrar el overlay — así no hay flash de
 * contenido sin bloquear.
 */
export function AppLockGate({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [locked, setLocked] = useState(false);

  useLayoutEffect(() => {
    if (!enabled) return;
    if (isLockRequired()) setLocked(true);

    const onVisibilityChange = () => {
      if (!document.hidden && isLockRequired()) setLocked(true);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [enabled]);

  if (!enabled) return <>{children}</>;

  return (
    <>
      {children}
      {locked && (
        <LockScreen
          onUnlock={() => {
            markAuthenticated();
            setLocked(false);
          }}
        />
      )}
    </>
  );
}
