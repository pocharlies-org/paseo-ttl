# paseo-ttl

Píldora en el composer de Paseo, siempre visible en agentes Claude: el TTL de la ruta por LiteLLM.

- Con un modelo Claude: la cuenta que sirve la sesión y lo que queda de su caché (`max · 36m`).
- Con Alibaba o el residente: el plan y su TTL (`alibaba · 17m`).
- Sin datos del panel: `ttl: sin ruta`.

El dato lo da el panel de control-nexus (`GET /api/session-routing/session/{sid}`, LAN/tailnet sin SSO); lo lee la mitad
de servidor del plugin (cache 15 s por sesión) y lo sirve al cliente por RPC, igual que paseo-plan con las tareas. El
tick de 30 s repinta la cuenta atrás descontando reloj desde la lectura. Panel alternativo: `PASEO_TTL_PANEL`.
