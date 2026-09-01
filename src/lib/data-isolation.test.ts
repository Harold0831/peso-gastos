import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, isScopedToUser } from "./test/fake-supabase";

/**
 * El aislamiento entre usuarios de Peso vive SOLO en el código: las tablas
 * tienen RLS activo pero sin policies, y el servidor entra con la service
 * role key, que lo ignora. O sea: si una consulta se olvida del filtro por
 * `user_id`, un usuario ve los datos de otro y no hay ninguna otra barrera
 * que lo impida.
 *
 * Estos tests son esa barrera. Recorren TODAS las funciones exportadas de
 * data.ts, graban las consultas que lanzan y exigen que cada una toque solo
 * datos del usuario en sesión. El último test cierra el círculo: si alguien
 * añade una función nueva y no la incluye aquí, falla.
 */

const USER = "11111111-1111-1111-1111-111111111111";
const OTRO_USUARIO = "22222222-2222-2222-2222-222222222222";

const fake = createFakeSupabase();

vi.mock("./supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => fakeClient(),
}));

vi.mock("./users", () => ({
  requireUserId: async () => USER,
  getHomeCurrencyForUser: async () => "DOP",
  // getAttentionItems lo importa dinámicamente para el aviso de Gmail caído.
  getGmailStatus: async () => ({
    linked: true,
    email: "quien@sea.com",
    syncEnabled: true,
    enabledBanks: null,
  }),
}));

vi.mock("./exchange-rate", () => ({
  getLatestCachedRate: async () => 60,
}));

function fakeClient() {
  return fake.client as ReturnType<typeof createFakeSupabase>["client"] & Record<string, never>;
}

/**
 * Tablas cuyas filas pertenecen a UN usuario. Toda consulta sobre ellas debe
 * ir filtrada. Se listan a mano a propósito: añadir una tabla por usuario y
 * no ponerla aquí es exactamente el descuido que estos tests deben cazar, así
 * que la lista es parte de la revisión de cualquier migración nueva.
 */
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

/**
 * Tablas que NO son de un usuario y por eso no llevan filtro:
 *  - users: se consulta por su clave primaria (`eq("id", userId)`).
 *  - exchange_rates: la tasa del día es global, igual para todos.
 *  - rate_limits: la clave es la IP o la acción, no el usuario.
 */
const GLOBAL_TABLES = ["users", "exchange_rates", "rate_limits"];

const MES = new Date(2026, 8, 1);

/**
 * Cada función exportada de data.ts con argumentos plausibles. El test de
 * cobertura de más abajo obliga a mantener esta lista completa.
 */
const LECTURAS: Record<string, () => Promise<unknown>> = {};

let data: typeof import("./data");

beforeEach(async () => {
  fake.reset();
  vi.resetModules();
  data = await import("./data");
});

async function registrarLecturas() {
  const d = await import("./data");
  Object.assign(LECTURAS, {
    getTransactions: () => d.getTransactions({ month: MES }),
    getAllTransactionsForExport: () => d.getAllTransactionsForExport(),
    getPendingTransactions: () => d.getPendingTransactions(),
    getPendingSummary: () => d.getPendingSummary(),
    getTransactionById: () => d.getTransactionById("tx-1"),
    getPendingCount: () => d.getPendingCount(),
    getMonthSummary: () => d.getMonthSummary(MES),
    getAvailableBalance: () => d.getAvailableBalance(),
    getHomeCurrency: () => d.getHomeCurrency(),
    getAllCategories: () => d.getAllCategories(),
    getCategories: () => d.getCategories(),
    getHiddenCategoryIds: () => d.getHiddenCategoryIds(),
    getBudgetsForMonth: () => d.getBudgetsForMonth(MES),
    getGoals: () => d.getGoals(),
    getCategorySpend: () => d.getCategorySpend(MES),
    getDailyExpenses: () => d.getDailyExpenses(MES),
    getRecurringExpenses: () => d.getRecurringExpenses(),
    getRecurringForMonth: () => d.getRecurringForMonth(MES),
    getCards: () => d.getCards(),
    getCardsForMonth: () => d.getCardsForMonth(MES),
    getUnregisteredCards: () => d.getUnregisteredCards(),
    getAttentionItems: () => d.getAttentionItems(),
  });
}

describe("aislamiento por user_id en las lecturas (data.ts)", () => {
  it("ninguna lectura consulta una tabla por usuario sin filtrarla", async () => {
    await registrarLecturas();

    for (const [nombre, ejecutar] of Object.entries(LECTURAS)) {
      fake.reset();
      await ejecutar();

      for (const query of fake.queries) {
        if (!USER_SCOPED_TABLES.includes(query.table)) continue;
        expect(
          isScopedToUser(query, USER),
          `${nombre}() consulta "${query.table}" sin acotarla al usuario en sesión. ` +
            `Filtros vistos: ${JSON.stringify(query.calls)}`,
        ).toBe(true);
      }
    }
  });

  it("nunca filtra por un usuario que no es el de la sesión", async () => {
    await registrarLecturas();

    for (const [nombre, ejecutar] of Object.entries(LECTURAS)) {
      fake.reset();
      await ejecutar();

      for (const query of fake.queries) {
        const filtroAjeno = query.calls.some(
          (c) => c.method === "eq" && c.args[0] === "user_id" && c.args[1] !== USER,
        );
        expect(filtroAjeno, `${nombre}() filtró por un user_id distinto al de la sesión`).toBe(
          false,
        );
        expect(
          JSON.stringify(query.calls).includes(OTRO_USUARIO),
          `${nombre}() mencionó el id de otro usuario`,
        ).toBe(false);
      }
    }
  });

  it("las consultas a `users` van por su clave primaria, no sueltas", async () => {
    await registrarLecturas();

    for (const [nombre, ejecutar] of Object.entries(LECTURAS)) {
      fake.reset();
      await ejecutar();

      for (const query of fake.queries.filter((q) => q.table === "users")) {
        const porId = query.calls.some(
          (c) => c.method === "eq" && c.args[0] === "id" && c.args[1] === USER,
        );
        expect(porId, `${nombre}() leyó "users" sin acotar a la fila del usuario`).toBe(true);
      }
    }
  });

  it("solo toca tablas conocidas (una tabla nueva obliga a clasificarla)", async () => {
    await registrarLecturas();
    const conocidas = [...USER_SCOPED_TABLES, ...GLOBAL_TABLES];

    for (const [nombre, ejecutar] of Object.entries(LECTURAS)) {
      fake.reset();
      await ejecutar();
      for (const query of fake.queries) {
        if (query.operation === "rpc") continue;
        expect(
          conocidas,
          `${nombre}() consulta la tabla "${query.table}", que no está clasificada como ` +
            `por-usuario ni global en este test`,
        ).toContain(query.table);
      }
    }
  });

  it("cubre TODAS las funciones exportadas de data.ts", async () => {
    await registrarLecturas();

    // Si añades una función que consulta datos y no la registras arriba,
    // este test falla — que es justo el punto: nada nuevo entra sin revisar
    // que esté acotado al usuario.
    const exportadas = Object.entries(data)
      .filter(([, value]) => typeof value === "function")
      .map(([nombre]) => nombre)
      // Puras, sin acceso a datos: no hay nada que aislar.
      .filter((nombre) => !["startOfAstDay", "countsTowardBalance"].includes(nombre));

    const sinCubrir = exportadas.filter((nombre) => !(nombre in LECTURAS));
    expect(
      sinCubrir,
      `funciones de data.ts sin test de aislamiento: ${sinCubrir.join(", ")}`,
    ).toEqual([]);
  });
});
