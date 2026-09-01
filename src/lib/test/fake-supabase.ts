/**
 * Cliente falso de Supabase que GRABA las consultas en vez de ejecutarlas.
 *
 * Existe para una sola cosa: comprobar que toda lectura y toda mutación
 * están acotadas al usuario en sesión. En Peso ese aislamiento vive
 * ÚNICAMENTE en el código — las tablas tienen RLS activo pero sin policies, y
 * la service role key la ignora —, así que una consulta nueva a la que se le
 * olvide el `.eq("user_id", …)` le enseñaría los datos de un usuario a otro
 * sin que nada lo impida. Estos tests son la única red bajo esa cuerda.
 *
 * Es un Proxy y no una lista de métodos a mano para que siga funcionando si
 * mañana se usa un operador de PostgREST que hoy no aparece en el código: lo
 * graba igual en vez de romper el test con "no es una función".
 */

export interface RecordedCall {
  method: string;
  args: unknown[];
}

export interface RecordedQuery {
  table: string;
  /** La primera operación de la cadena: select (default), insert, update… */
  operation: string;
  /** Todo lo demás en el orden en que se encadenó (eq, is, or, order…). */
  calls: RecordedCall[];
  /** El objeto pasado a insert/update/upsert, si lo hubo. */
  payload?: unknown;
}

const MUTATIONS = new Set(["insert", "update", "upsert", "delete"]);
/** Métodos que hacen que la consulta devuelva UNA fila y no un array. */
const SINGLE = new Set(["single", "maybeSingle"]);

/**
 * Fila genérica para las consultas de UNA sola fila.
 *
 * No pretende ser realista: solo trae los campos que el código lee justo
 * después de un `maybeSingle()` (p. ej. `Number(goal.current_amount)`), para
 * que la función siga hasta lanzar su consulta de escritura — que es lo que
 * estos tests miran. Devolver `null` cortaría la ejecución antes de llegar
 * ahí y el test pasaría sin haber comprobado nada.
 */
const SINGLE_ROW = {
  id: "row-1",
  current_amount: 0,
  target_amount: 1000,
  limit_amount: 1000,
  amount: 100,
  opening_balance: 0,
  opening_balance_as_of: null,
  created_at: "2026-09-01T12:00:00.000Z",
  date: "2026-09-01T12:00:00.000Z",
  name: "fila de prueba",
  category: "Alimentación",
  currency: "DOP",
  type: "expense",
  confirmed: false,
  deleted_at: null,
};

export interface FakeSupabase {
  /** Todas las consultas de la última llamada, en orden. */
  queries: RecordedQuery[];
  /** Las que tocaron una tabla concreta. */
  on(table: string): RecordedQuery[];
  reset(): void;
  client: unknown;
}

export function createFakeSupabase(): FakeSupabase {
  const queries: RecordedQuery[] = [];

  function chainFor(query: RecordedQuery): unknown {
    const chain: Record<string | symbol, unknown> = {};
    const proxy: unknown = new Proxy(chain, {
      get(_target, prop) {
        // Await sobre la cadena: PostgREST resuelve aquí.
        if (prop === "then") {
          return (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
            const returnsOne = query.calls.some((c) => SINGLE.has(c.method));
            const result = returnsOne
              ? { data: { ...SINGLE_ROW }, error: null }
              : { data: [], error: null, count: 0 };
            return Promise.resolve(result).then(resolve, reject);
          };
        }
        return (...args: unknown[]) => {
          const name = String(prop);
          if (MUTATIONS.has(name)) {
            query.operation = name;
            if (name !== "delete") query.payload = args[0];
          } else {
            query.calls.push({ method: name, args });
          }
          return proxy;
        };
      },
    });
    return proxy;
  }

  const client = {
    from(table: string) {
      const query: RecordedQuery = { table, operation: "select", calls: [] };
      queries.push(query);
      return chainFor(query);
    },
    rpc(fn: string, args: unknown) {
      const query: RecordedQuery = {
        table: `rpc:${fn}`,
        operation: "rpc",
        calls: [],
        payload: args,
      };
      queries.push(query);
      // check_rate_limit devuelve true (permitido) para no frenar los tests.
      return Promise.resolve({ data: true, error: null });
    },
  };

  return {
    queries,
    on: (table) => queries.filter((q) => q.table === table),
    reset: () => queries.splice(0, queries.length),
    client,
  };
}

/**
 * ¿Esta consulta está acotada a `userId`?
 *
 * Acepta las tres formas legítimas que usa el código:
 *  - `.eq("user_id", uid)` — el caso normal.
 *  - `.or("user_id.is.null,user_id.eq.<uid>")` — categorías, donde las
 *    globales (user_id null) se comparten entre todos los usuarios.
 *  - un insert/upsert cuyo payload lleva `user_id` (no hay dónde filtrar).
 */
export function isScopedToUser(query: RecordedQuery, userId: string): boolean {
  const byEq = query.calls.some(
    (c) => c.method === "eq" && c.args[0] === "user_id" && c.args[1] === userId,
  );
  if (byEq) return true;

  const byOr = query.calls.some(
    (c) => c.method === "or" && typeof c.args[0] === "string" && c.args[0].includes(userId),
  );
  if (byOr) return true;

  return payloadCarriesUser(query.payload, userId);
}

function payloadCarriesUser(payload: unknown, userId: string): boolean {
  if (payload === null || payload === undefined) return false;
  const rows = Array.isArray(payload) ? payload : [payload];
  return (
    rows.length > 0 &&
    rows.every(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        (row as Record<string, unknown>).user_id === userId,
    )
  );
}
