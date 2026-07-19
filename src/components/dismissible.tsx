"use client";

import { useEffect, useState } from "react";

/**
 * Envuelve un banner/aviso con un botón ✕ que lo oculta para siempre
 * (localStorage). Antídoto contra la fatiga de avisos: un banner que
 * aparece eternamente termina ignorado — mejor dejar que el usuario diga
 * "entendido, no me interesa" y que la opción siga viva en su lugar
 * permanente (el perfil).
 *
 * Renderiza null hasta el primer efecto en cliente para no mostrar un
 * banner ya descartado durante un instante (el localStorage no existe en
 * el render del servidor).
 */
export function Dismissible({
  storageKey,
  className,
  children,
}: {
  /** Clave única en localStorage, ej. "peso-banner-faceid". */
  storageKey: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(localStorage.getItem(storageKey) !== "1");
  }, [storageKey]);

  if (!visible) return null;

  return (
    <div className={`relative ${className ?? ""}`}>
      {children}
      <button
        aria-label="Descartar aviso"
        onClick={() => {
          localStorage.setItem(storageKey, "1");
          setVisible(false);
        }}
        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-pill text-base leading-none text-ink-muted"
      >
        ✕
      </button>
    </div>
  );
}
