import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, isScopedToUser } from "./test/fake-supabase";

/**
 * La otra mitad del aislamiento: las MUTACIONES.
 *
 * Una lectura sin filtro por `user_id` enseña datos ajenos; una mutación sin
 * filtro los MODIFICA o los BORRA. Como el servidor entra con la service role
 * key (que ignora el RLS), `deleteGoal("id-de-otro")` borraría la meta de otra
 * persona si a la consulta le faltara el `.eq("user_id", …)`.
 *
 * El test llama a las 34 server actions con entradas válidas, graba lo que
 * mandan a Supabase y exige que todo lo que toca una tabla por usuario esté
 * acotado al de la sesión — sea por filtro o porque el propio payload lleva
 * el user_id.
 */

const USER = "11111111-1111-1111-1111-111111111111";

const fake = createFakeSupabase();

vi.mock("./supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => fake.client,
}));

vi.mock("./users", () => ({
  requireUserId: async () => USER,
  deleteUserAccount: async () => undefined,
  getUserById: async () => ({ id: USER, email: "yo@ejemplo.com", name: "Yo" }),
  getPasswordAccount: async () => ({
    id: USER,
    passwordHash: null,
    failedAttempts: 0,
    lockedUntil: null,
  }),
  savePasswordHash: async () => undefined,
  getHomeCurrencyForUser: async () => "DOP",
}));

vi.mock("./rate-limit", () => ({
  checkRateLimit: async () => true,
  RATE_LIMITED_MESSAGE: "demasiados intentos",
  AUTH_LIMITS: {
    register: { limit: 5, windowSeconds: 3600 },
    login: { limit: 20, windowSeconds: 900 },
    setPassword: { limit: 10, windowSeconds: 3600 },
  },
}));

vi.mock("./sync", () => ({ runSyncForUser: async () => ({ synced: 0 }) }));
vi.mock("./webauthn", () => ({ deleteCredentialsForUser: async () => undefined }));
vi.mock("./push", () => ({ sendPushToUser: async () => undefined }));
vi.mock("./exchange-rate", () => ({
  getUsdToDopRate: async () => 60,
  getLatestCachedRate: async () => 60,
}));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));
// redirect() de Next lanza para cortar la ejecución; se imita para que las
// actions que redirigen (logout, borrar cuenta) se comporten igual aquí.
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));

const USER_SCOPED_TABLES = [
  "transactions",
  "budgets",
  "savings_goals",
  "recurring_expenses",
  "recurring_payments",
  "cards",
  "hidden_categories",
  "notification_dismissals",
  "categories",
  "gmail_accounts",
  "push_subscriptions",
  "api_tokens",
  "webauthn_credentials",
  "feedback",
];

/** users se toca por su clave primaria; rate_limits no es de un usuario. */
const GLOBAL_TABLES = ["users", "exchange_rates", "rate_limits"];

const MES = "2026-09-01";

/**
 * Actions que legítimamente no lanzan ninguna consulta sobre una tabla por
 * usuario, con el motivo. Todo lo demás DEBE consultar algo: si no, el test
 * estaría pasando en vacío (una entrada inválida que la action rechaza antes
 * de llegar a Supabase se vería como "aislamiento correcto").
 */
const SIN_CONSULTA: Record<string, string> = {
  logoutAction: "solo borra la cookie de sesión y redirige",
  deleteAccountAction: "delega el borrado en deleteUserAccount() (mockeado)",
  disableFaceId: "delega en deleteCredentialsForUser() (mockeado)",
  syncNow: "delega en runSyncForUser() (mockeado)",
  setPassword: "lee y escribe vía helpers de users.ts (mockeados)",
};

let actions: typeof import("./actions");

async function invocaciones(): Promise<Record<string, () => Promise<unknown>>> {
  const a = actions;
  return {
    confirmTransaction: () => a.confirmTransaction({ id: "tx-1", category: "Alimentación" }),
    confirmTransactionsBulk: () =>
      a.confirmTransactionsBulk({ ids: ["tx-1", "tx-2"], category: "Alimentación" }),
    deleteTransaction: () => a.deleteTransaction("tx-1"),
    restoreTransaction: () => a.restoreTransaction("tx-1"),
    createTransaction: () =>
      a.createTransaction({
        type: "expense",
        merchant: "Colmado",
        amount: 100,
        currency: "DOP",
        date: "2026-09-01T12:00:00.000Z",
        category: "Alimentación",
      }),
    setOpeningBalance: () => a.setOpeningBalance({ amount: 5000 }),
    createRecurringExpense: () => a.createRecurringExpense({ name: "Netflix", currency: "DOP" }),
    deleteRecurringExpense: () => a.deleteRecurringExpense("rec-1"),
    setRecurringPaid: () =>
      a.setRecurringPaid({ recurring_id: "rec-1", month: MES, status: "paid" }),
    createCard: () =>
      a.createCard({ last4: "3326", nickname: "Visa", type: "debit", color: "#2563EB" }),
    updateCard: () =>
      a.updateCard({ id: "card-1", nickname: "Visa", type: "debit", color: "#2563EB" }),
    deleteCard: () => a.deleteCard("card-1"),
    setEnabledBanks: () => a.setEnabledBanks({ banks: ["qik"] }),
    createCategory: () => a.createCategory({ name: "Mascota", icon: "🐶", color: "#2563EB" }),
    updateCategory: () =>
      a.updateCategory({ id: "cat-1", name: "Mascota", icon: "🐶", color: "#2563EB" }),
    setCategoryHidden: () => a.setCategoryHidden({ category_id: "cat-1", hidden: true }),
    restoreDefaultCategories: () => a.restoreDefaultCategories(),
    deleteCategory: () => a.deleteCategory("cat-1"),
    createBudget: () => a.createBudget({ category_id: "cat-1", month: MES, limit_amount: 5000 }),
    copyBudgetsFromPreviousMonth: () => a.copyBudgetsFromPreviousMonth(MES),
    createGoal: () => a.createGoal({ name: "Viaje", target_amount: 50000, icon: "✈️" }),
    contributeToGoal: () => a.contributeToGoal({ goal_id: "goal-1", amount: 1000 }),
    withdrawFromGoal: () => a.withdrawFromGoal({ goal_id: "goal-1", amount: 1000 }),
    updateGoal: () =>
      a.updateGoal({
        id: "goal-1",
        name: "Viaje",
        target_amount: 50000,
        current_amount: 0,
        icon: "✈️",
      }),
    deleteGoal: () => a.deleteGoal("goal-1"),
    syncNow: () => a.syncNow(),
    disableFaceId: () => a.disableFaceId(),
    setPassword: () => a.setPassword({ password: "una frase larga" }),
    dismissNotifications: () => a.dismissNotifications({ entries: [{ id: "pending" }] }),
    savePushSubscription: () =>
      a.savePushSubscription({
        endpoint: "https://push.example.com/abc",
        keys: { p256dh: "clave", auth: "auth" },
      }),
    deletePushSubscription: () => a.deletePushSubscription("https://push.example.com/abc"),
    sendFeedback: () => a.sendFeedback("me gusta"),
    logoutAction: () => a.logoutAction(),
    deleteAccountAction: () => a.deleteAccountAction("ELIMINAR"),
  };
}

/** Ejecuta la action tolerando el throw de redirect() y los fallos de datos. */
async function ejecutar(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") return;
    throw err;
  }
}

beforeEach(async () => {
  fake.reset();
  vi.resetModules();
  actions = await import("./actions");
});

describe("aislamiento por user_id en las mutaciones (actions.ts)", () => {
  it("ninguna action escribe o lee una tabla por usuario sin acotarla", async () => {
    for (const [nombre, fn] of Object.entries(await invocaciones())) {
      fake.reset();
      await ejecutar(fn);

      for (const query of fake.queries) {
        if (!USER_SCOPED_TABLES.includes(query.table)) continue;
        expect(
          isScopedToUser(query, USER),
          `${nombre}() hace "${query.operation}" sobre "${query.table}" sin acotarlo al ` +
            `usuario en sesión. Filtros: ${JSON.stringify(query.calls)} · ` +
            `payload: ${JSON.stringify(query.payload)}`,
        ).toBe(true);
      }
    }
  });

  it("escribir en `users` va siempre por su clave primaria", async () => {
    for (const [nombre, fn] of Object.entries(await invocaciones())) {
      fake.reset();
      await ejecutar(fn);

      for (const query of fake.queries.filter((q) => q.table === "users")) {
        const porId = query.calls.some(
          (c) => c.method === "eq" && c.args[0] === "id" && c.args[1] === USER,
        );
        expect(porId, `${nombre}() tocó "users" sin acotar a la fila del usuario`).toBe(true);
      }
    }
  });

  it("cada action llega de verdad a Supabase (el test no pasa en vacío)", async () => {
    // Sin esto, una entrada que Zod rechazara antes de consultar se vería
    // como "aislamiento correcto" cuando en realidad no se probó nada.
    for (const [nombre, fn] of Object.entries(await invocaciones())) {
      if (nombre in SIN_CONSULTA) continue;
      fake.reset();
      await ejecutar(fn);

      // `users` cuenta: setOpeningBalance solo escribe ahí, y es una escritura
      // real que igual hay que acotar (por clave primaria, no por user_id).
      const llegoASupabase = fake.queries.some(
        (q) => USER_SCOPED_TABLES.includes(q.table) || q.table === "users",
      );
      expect(
        llegoASupabase,
        `${nombre}() no lanzó ninguna consulta: probablemente la entrada del test ya no ` +
          `pasa su validación, así que no está probando el aislamiento`,
      ).toBe(true);
    }
  });

  it("solo toca tablas conocidas (una tabla nueva obliga a clasificarla)", async () => {
    const conocidas = [...USER_SCOPED_TABLES, ...GLOBAL_TABLES];
    for (const [nombre, fn] of Object.entries(await invocaciones())) {
      fake.reset();
      await ejecutar(fn);
      for (const query of fake.queries) {
        if (query.operation === "rpc") continue;
        expect(
          conocidas,
          `${nombre}() toca la tabla "${query.table}", sin clasificar en este test`,
        ).toContain(query.table);
      }
    }
  });

  it("cubre TODAS las server actions exportadas", async () => {
    const cubiertas = Object.keys(await invocaciones());
    const exportadas = Object.entries(actions)
      .filter(([, value]) => typeof value === "function")
      .map(([nombre]) => nombre);

    const sinCubrir = exportadas.filter((nombre) => !cubiertas.includes(nombre));
    expect(sinCubrir, `server actions sin test de aislamiento: ${sinCubrir.join(", ")}`).toEqual(
      [],
    );
  });
});
