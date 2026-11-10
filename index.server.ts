import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { ttlGet, type Routing } from "./shared/ttl.ts";

// El panel de control-nexus (LAN/tailnet, sin SSO): PASEO_TTL_PANEL, o la primera línea de ~/.config/paseo-ttl/panel; vacío = sin ruta.
const PANEL = (
  process.env.PASEO_TTL_PANEL ??
  (() => {
    try {
      return readFileSync(`${homedir()}/.config/paseo-ttl/panel`, "utf8").trim();
    } catch {
      return "";
    }
  })()
).replace(/\/+$/, "");
const CACHE_MS = 15_000;

const cache = new Map<string, { at: number; value: Routing | null }>();

async function fetchRouting(sid: string): Promise<Routing | null> {
  const hit = cache.get(sid);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let value: Routing | null = null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    const res = await fetch(`${PANEL}/api/session-routing/session/${encodeURIComponent(sid)}`, { signal: ac.signal });
    if (res.ok) {
      const s = (await res.json()) as {
        plan?: string | null;
        plan_ttl?: number | null;
        claude?: { cuenta?: string | null; ttl?: number | null } | null;
      };
      const plan = s.plan ?? null;
      const cuenta = s.claude?.cuenta ?? null;
      const planTtl = s.plan_ttl ?? null;
      const cuentaTtl = s.claude?.ttl ?? null;
      value = plan || cuenta ? { plan, planTtl, cuenta, cuentaTtl, readAtMs: Date.now() } : null;
    }
  } catch {
    // El panel mudo no es un error del agente: la píldora dirá «sin ruta» y el siguiente tick reintenta.
  } finally {
    clearTimeout(timer);
  }
  cache.set(sid, { at: Date.now(), value });
  return value;
}

export default function contribute(server: PluginServerContext) {
  server.handle(ttlGet, async ({ sessionIds }) => ({
    routing: Object.fromEntries(await Promise.all(sessionIds.map(async (id) => [id, await fetchRouting(id)] as const))),
  }));
  return () => {
    cache.clear();
  };
}
