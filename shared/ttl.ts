import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

// Lo que el panel de control-nexus sabe de la ruta de una sesión Claude (GET /api/session-routing/session/{sid}):
// con Claude, la cuenta que la sirve y el segundos que le quedan a esa decisión (ttl); con Alibaba/residente, el
// plan y su plan_ttl. El panel es la verdad única; aquí solo se recorta lo que la píldora pinta.
export const routingSchema = z.object({
  plan: z.string().nullable(),
  planTtl: z.number().nullable(),
  cuenta: z.string().nullable(),
  cuentaTtl: z.number().nullable(),
  readAtMs: z.number(),
});
export type Routing = z.output<typeof routingSchema>;

// Una sola llamada por tick para todas las píldoras (patrón de paseo-plan: una por píldora encola detrás del tráfico
// de los demás plugins).
export const ttlGet = defineRpc({
  name: "ttl.get",
  input: z.object({ sessionIds: z.array(z.string().min(1)).min(1).max(1000) }).strict(),
  output: z.object({ routing: z.record(z.string(), routingSchema.nullable()) }),
});

// «2h 10m» o «17m»; el ttl del panel decae con el reloj real, así que se descuenta desde su lectura.
export function fmtTtl(seconds: number): string {
  const m = Math.max(0, Math.round(seconds / 60));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function ttlVivo(r: Routing, nowMs: number): number | null {
  const base = r.cuenta ? r.cuentaTtl : r.planTtl;
  if (base == null) return null;
  return Math.max(0, base - (nowMs - r.readAtMs) / 1000);
}

// El número a secas («36m»), sin prefijo: se lee de un vistazo (Dani 07-11); cuenta y plan van en el popover.
export function ttlLabel(r: Routing | null, nowMs: number): string {
  const left = r ? ttlVivo(r, nowMs) : null;
  return left == null ? "—" : fmtTtl(left);
}

export type Tono = "success" | "warning" | "danger" | "local";

// Verde hay caché, amarillo queda ≤5 min, rojo no hay caché, lila es local (los colores del viejo servicio de
// cuentas de x86; el icono es el único gancho de color de la píldora, como en paseo-descuento).
export function ttlTono(r: Routing | null, nowMs: number): Tono {
  if (!r) return "danger";
  if (r.plan === "local") return "local";
  const left = ttlVivo(r, nowMs);
  if (left == null) return "danger";
  return left <= 300 ? "warning" : "success";
}

export function ttlLineas(r: Routing | null, nowMs: number): string[] {
  if (!r) return ["Sin datos del panel (control-nexus)"];
  const left = ttlVivo(r, nowMs);
  const quedan = left == null ? "sin ttl" : `quedan ${fmtTtl(left)}`;
  if (r.cuenta) return [`Cuenta Claude: ${r.cuenta}`, `Cache de la ruta: ${quedan}`];
  if (r.plan) return [`Plan: ${r.plan}`, `Cache de la ruta: ${quedan}`];
  return ["Sin datos del panel (control-nexus)"];
}
