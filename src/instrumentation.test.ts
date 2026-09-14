import { beforeEach, describe, expect, it, vi } from "vitest";

const reportIssue = vi.fn();
vi.mock("./lib/monitoring", () => ({ reportIssue: (...args: unknown[]) => reportIssue(...args) }));

const peticion = { path: "/transactions", method: "GET" };
const contexto = { routePath: "/transactions", routeType: "render" };

async function dispararError(error: unknown) {
  const { onRequestError } = await import("./instrumentation");
  await onRequestError(error, peticion, contexto);
}

function errorConDigest(digest: string, mensaje = "Error cargando transacciones: Bad Gateway") {
  return Object.assign(new Error(mensaje), { digest });
}

describe("aviso de errores de pantalla", () => {
  beforeEach(() => {
    reportIssue.mockClear();
    vi.resetModules(); // el freno vive en memoria del módulo
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
  });

  it("avisa con el mensaje real y el código que ve el usuario", async () => {
    await dispararError(errorConDigest("1397287176"));

    expect(reportIssue).toHaveBeenCalledTimes(1);
    const aviso = reportIssue.mock.calls[0][0] as { message: string; details: string[] };
    expect(aviso.message).toContain("/transactions");
    expect(aviso.details.join("\n")).toContain("Bad Gateway");
    // El digest es lo que permite cruzar el aviso con la captura de pantalla
    // que manda la persona; sin él hay que adivinar de qué error habla.
    expect(aviso.details.join("\n")).toContain("1397287176");
  });

  it("el mismo error repitiéndose es UN aviso, no treinta", async () => {
    // La causa más probable es que Supabase no responda, y entonces el
    // throttle de reportIssue (que vive en Postgres) falla abierto. Sin este
    // freno en memoria, quince personas tocando la app llenan el canal.
    for (let i = 0; i < 30; i++) await dispararError(errorConDigest("mismo-digest"));
    expect(reportIssue).toHaveBeenCalledTimes(1);
  });

  it("pero dos errores DISTINTOS sí avisan los dos", async () => {
    // Agrupar de más escondería un problema nuevo detrás de uno viejo.
    await dispararError(errorConDigest("digest-a"));
    await dispararError(errorConDigest("digest-b"));
    expect(reportIssue).toHaveBeenCalledTimes(2);
  });

  it("no avisa de un redirect ni de un not-found de Next", async () => {
    // Next.js los lanza como control de flujo: `redirect()` y `notFound()` son
    // comportamiento normal, no fallos.
    await dispararError(errorConDigest("NEXT_REDIRECT;replace;/login;307;"));
    await dispararError(errorConDigest("NEXT_NOT_FOUND"));
    expect(reportIssue).not.toHaveBeenCalled();
  });

  it("no se intenta fuera del runtime de Node", async () => {
    // El middleware corre en edge, donde no existe el cliente de Supabase que
    // usa el monitoreo.
    vi.stubEnv("NEXT_RUNTIME", "edge");
    await dispararError(errorConDigest("en-edge"));
    expect(reportIssue).not.toHaveBeenCalled();
  });

  it("un aviso que falla no empeora la petición que ya venía rota", async () => {
    reportIssue.mockRejectedValueOnce(new Error("Discord caído"));
    await expect(dispararError(errorConDigest("con-webhook-roto"))).resolves.toBeUndefined();
  });
});
