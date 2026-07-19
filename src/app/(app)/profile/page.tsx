import { getCustomCategories } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase";
import { getGmailStatus, getUserById, requireUserId } from "@/lib/users";
import { getCredentialsForUser } from "@/lib/webauthn";
import { ProfileClient } from "./profile-client";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  // La sección de notificaciones solo aparece si las claves VAPID existen
  const pushConfigured = Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY,
  );

  // Modo demo: sin Supabase no hay usuario ni Gmail que mostrar
  if (!isSupabaseConfigured()) {
    return (
      <ProfileClient
        name="Demo"
        email="demo@peso.app"
        avatarUrl={null}
        gmail={{ linked: false, email: null, syncEnabled: false, enabledBanks: null }}
        hasPasskey={false}
        pushConfigured={false}
        customCategories={[]}
        demoMode
      />
    );
  }

  const userId = await requireUserId();
  const [user, gmail, credentials, customCategories] = await Promise.all([
    getUserById(userId),
    getGmailStatus(userId),
    getCredentialsForUser(userId),
    getCustomCategories(),
  ]);

  return (
    <ProfileClient
      name={user?.name ?? user?.email ?? "Usuario"}
      email={user?.email ?? ""}
      avatarUrl={user?.avatar_url ?? null}
      gmail={{
        linked: gmail.linked,
        email: gmail.email,
        syncEnabled: gmail.syncEnabled,
        enabledBanks: gmail.enabledBanks,
      }}
      hasPasskey={credentials.length > 0}
      pushConfigured={pushConfigured}
      customCategories={customCategories}
    />
  );
}
