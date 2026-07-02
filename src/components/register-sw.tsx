"use client";

import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // El SW es solo para instalabilidad/caché básica; fallar no rompe la app.
      });
    }
  }, []);
  return null;
}
