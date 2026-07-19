import { cookies } from "next/headers";
import { BottomNav } from "@/components/bottom-nav";
import { AppLockGate } from "@/components/app-lock-gate";
import { ToastProvider } from "@/components/toast";
import { isSupabaseConfigured } from "@/lib/supabase";
import { SESSION_COOKIE, readSessionUserId } from "@/lib/session";
import { getCredentialsForUser } from "@/lib/webauthn";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // El bloqueo con Face ID solo aplica si el usuario registró un passkey
  // (desde /profile). Sin passkeys, la app no bloquea — evita mostrar una
  // pantalla de desbloqueo que no puede verificar nada.
  let lockEnabled = false;
  if (isSupabaseConfigured()) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const userId = token ? await readSessionUserId(token) : null;
    if (userId) {
      lockEnabled = (await getCredentialsForUser(userId)).length > 0;
    }
  }

  return (
    <AppLockGate enabled={lockEnabled}>
      <ToastProvider>
        <div className="mx-auto min-h-dvh max-w-lg pb-28">
          <div className="animate-screen-in">{children}</div>
          <BottomNav />
        </div>
      </ToastProvider>
    </AppLockGate>
  );
}
