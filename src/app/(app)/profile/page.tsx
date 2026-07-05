import { isSupabaseConfigured } from "@/lib/supabase";
import { getGmailStatus, getUserById, requireUserId } from "@/lib/users";
import { getCredentialsForUser } from "@/lib/webauthn";
import { ProfileClient } from "./profile-client";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  // Modo demo: sin Supabase no hay usuario ni Gmail que mostrar
  if (!isSupabaseConfigured()) {
    return (
      <ProfileClient
        name="Demo"
        email="demo@peso.app"
        avatarUrl={null}
        gmail={{ linked: false, email: null, syncEnabled: false }}
        hasPasskey={false}
        demoMode
      />
    );
  }

  const userId = await requireUserId();
  const [user, gmail, credentials] = await Promise.all([
    getUserById(userId),
    getGmailStatus(userId),
    getCredentialsForUser(userId),
  ]);

  return (
    <ProfileClient
      name={user?.name ?? user?.email ?? "Usuario"}
      email={user?.email ?? ""}
      avatarUrl={user?.avatar_url ?? null}
      gmail={{ linked: gmail.linked, email: gmail.email, syncEnabled: gmail.syncEnabled }}
      hasPasskey={credentials.length > 0}
    />
  );
}
