"use client";

import { useRef, useState, type ReactNode, type TouchEvent } from "react";

const THRESHOLD = 70;

/**
 * Pull-to-refresh minimalista para la PWA en iOS: detecta el arrastre hacia
 * abajo cuando la página está en el tope y dispara onRefresh al soltar.
 */
export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => void;
  children: ReactNode;
}) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);

  const onTouchStart = (e: TouchEvent) => {
    if (window.scrollY <= 0) {
      startY.current = e.touches[0].clientY;
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    if (startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    setPull(delta > 0 ? Math.min(delta * 0.4, THRESHOLD + 20) : 0);
  };

  const onTouchEnd = () => {
    if (pull >= THRESHOLD) onRefresh();
    startY.current = null;
    setPull(0);
  };

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        className="flex items-center justify-center overflow-hidden transition-[height]"
        style={{ height: pull }}
      >
        <span className="text-xs font-medium text-ink-muted">
          {pull >= THRESHOLD ? "Suelta para sincronizar" : "Desliza para sincronizar"}
        </span>
      </div>
      {children}
    </div>
  );
}
