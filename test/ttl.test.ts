import assert from "node:assert/strict";
import { test } from "node:test";
import { fmtTtl, ttlLabel, ttlLineas, ttlVivo, type Routing } from "../shared/ttl.ts";

const r = (over: Partial<Routing> = {}): Routing => ({
  plan: null,
  planTtl: null,
  cuenta: null,
  cuentaTtl: null,
  readAtMs: 0,
  ...over,
});

test("fmtTtl", () => {
  assert.equal(fmtTtl(1020), "17m");
  assert.equal(fmtTtl(7800), "2h 10m");
  assert.equal(fmtTtl(0), "0m");
});

test("claude: cuenta y lo que queda, descontado desde la lectura", () => {
  const routing = r({ cuenta: "max", cuentaTtl: 2148, readAtMs: 1000 });
  assert.equal(ttlLabel(routing, 1000), "max · 36m");
  assert.equal(ttlVivo(routing, 1000 + 60_000), 2088);
  assert.deepEqual(ttlLineas(routing, 1000), ["Cuenta Claude: max", "Cache de la ruta: quedan 36m"]);
});

test("alibaba: plan y plan_ttl", () => {
  const routing = r({ plan: "alibaba", planTtl: 1051, readAtMs: 0 });
  assert.equal(ttlLabel(routing, 0), "alibaba · 18m");
});

test("sin datos", () => {
  assert.equal(ttlLabel(null, 0), "ttl: sin ruta");
  assert.equal(ttlLabel(r(), 0), "ttl: sin ruta");
  assert.equal(ttlLabel(r({ plan: "local", readAtMs: 0 }), 0), "local · —");
});

test("el ttl no baja de cero", () => {
  assert.equal(ttlVivo(r({ cuenta: "max", cuentaTtl: 10, readAtMs: 0 }), 10 * 60_000), 0);
});
