import type {
  PluginButtonContentProps,
  PluginButtonIconProps,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Text, View } from "react-native";
import { ttlGet, ttlLabel, ttlLineas, ttlTono, ttlVisible, type Routing, type Tono } from "./shared/ttl.ts";

// Una píldora por agente Claude: el TTL de su ruta por LiteLLM, siempre visible en escritorio (en el móvil, solo con la caché a punto de caducar) — con Claude la cuenta que lo sirve y
// lo que queda de caché («max · 36m»), con Alibaba/residente el plan y el suyo («alibaba · 17m»). El dato lo lee el
// servidor del plugin del panel de control-nexus (ttl.get); el tick de 30 s repinta la cuenta atrás descontando reloj.

type PaseoAgent = Awaited<ReturnType<PluginClientContext["paseo"]["agents"]["list"]>>["entries"][number]["agent"];

interface Live {
  workspaceId: string;
  sessionId?: string;
  routing: Routing | null;
  label: string;
  visible: boolean;
  reg: ReturnType<PluginClientContext["addComposerPill"]>;
}

const isClaude = (agent: PaseoAgent) => agent.provider.startsWith("claude");

export default function contribute(client: PluginClientContext) {
  const live = new Map<string, Live>();
  const lifetime = new AbortController();
  let stopped = false;
  let stopAgents: (() => void) | undefined;
  // The host hands `layout.compact` to components only: the icon reports it.
  // shortcut: a pill hidden on a compact layout learns of a wider one only when it shows again (the next cache warning).
  let compact = false;

  // El color del icono dice el estado de la caché (verde/amarillo/rojo/lila); la etiqueta es el número.
  function TtlIcon(props: PluginButtonIconProps) {
    const agentId = props.context === "agent" ? props.agentId : "";
    const tono: Tono = ttlTono(live.get(agentId)?.routing ?? null, Date.now());
    useEffect(() => {
      if (compact === props.layout.compact) return;
      compact = props.layout.compact;
      repaint();
    }, [props.layout.compact]);
    const colors = props.theme.colors as Record<string, string | undefined>;
    const color =
      tono === "success" ? colors.statusSuccess :
      tono === "warning" ? (colors.statusWarning ?? "#eab308") :
      tono === "local" ? "#a78bfa" : colors.statusDanger;
    return <Icon name="Timer" size={props.size} color={color ?? props.theme.colors.foreground} />;
  }

  function TtlPopover(props: PluginButtonContentProps) {
    const [, tick] = useState(0); // la cuenta atrás sigue moviéndose con el popover abierto
    useEffect(() => {
      const t = setInterval(() => tick((n) => n + 1), 30_000);
      return () => clearInterval(t);
    }, []);
    const agentId = props.context === "agent" ? props.agentId : "";
    const lines = ttlLineas(live.get(agentId)?.routing ?? null, Date.now());
    return (
      <View style={{ padding: 4, gap: 2 }}>
        {lines.map((line) => (
          <Text key={line} style={{ color: props.theme.colors.foreground, fontSize: 13 }}>
            {line}
          </Text>
        ))}
      </View>
    );
  }

  const upsert = (agent: PaseoAgent) => {
    if (stopped || !isClaude(agent) || agent.status === "closed" || !agent.workspaceId) return drop(agent.id);
    const sessionId = agent.persistence?.sessionId ?? agent.runtimeInfo?.sessionId ?? undefined;
    const existing = live.get(agent.id);
    if (existing) {
      if (existing.workspaceId === agent.workspaceId) {
        existing.sessionId = sessionId ?? existing.sessionId;
        return;
      }
      drop(agent.id); // cambió de workspace: la píldora está registrada bajo el id viejo
    }
    const entry: Live = {
      workspaceId: agent.workspaceId,
      sessionId,
      routing: null,
      label: "…",
      visible: true,
      reg: client.addComposerPill({
        id: "ttl",
        workspaceId: agent.workspaceId,
        agentId: agent.id,
        button: { title: "Caché de LiteLLM (cuenta y tiempo restante)", icon: TtlIcon, label: "…", behavior: { kind: "popover", Content: TtlPopover } },
      }),
    };
    live.set(agent.id, entry);
  };

  const drop = (agentId: string) => {
    const l = live.get(agentId);
    if (!l) return;
    live.delete(agentId);
    l.reg.remove();
  };

  const repaint = () => {
    const now = Date.now();
    for (const l of live.values()) {
      const text = ttlLabel(l.routing, now);
      const visible = ttlVisible(compact, ttlTono(l.routing, now));
      if (text !== l.label || visible !== l.visible) {
        l.label = text;
        l.visible = visible;
        l.reg.update({ label: text, visible });
      }
    }
  };

  const poll = async () => {
    const mine = [...live.values()].filter((l): l is Live & { sessionId: string } => !!l.sessionId);
    if (!mine.length) return repaint();
    try {
      const { routing } = await client.rpc(ttlGet, { sessionIds: [...new Set(mine.map((l) => l.sessionId))] });
      if (stopped || lifetime.signal.aborted) return;
      for (const l of mine) l.routing = routing[l.sessionId] ?? null;
    } catch {
      for (const l of mine) l.routing = null;
    }
    repaint();
  };

  void client.paseo.agents.list({ subscribe: {} }).then((result) => {
    if (stopped || lifetime.signal.aborted) {
      void result.subscription?.release();
      return;
    }
    for (const entry of result.entries) upsert(entry.agent);
    stopAgents =
      result.subscription?.subscribe({
        snapshot: (snap) => {
          const vistos = new Set<string>();
          for (const entry of snap.entries) {
            vistos.add(entry.agent.id);
            upsert(entry.agent);
          }
          for (const id of [...live.keys()]) if (!vistos.has(id)) drop(id);
        },
        update: () => {}, // el roster llega por snapshot; los mensajes crudos no aportan
      }) ?? undefined;
    void poll();
  });

  const timer = setInterval(() => void poll(), 30_000);
  return () => {
    stopped = true;
    lifetime.abort();
    clearInterval(timer);
    stopAgents?.();
    for (const l of live.values()) l.reg.remove();
    live.clear();
  };
}
