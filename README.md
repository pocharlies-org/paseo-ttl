# paseo-ttl

Píldora en el composer de Paseo, en agentes Claude: el TTL de la ruta por LiteLLM. Siempre visible en escritorio; en el móvil, donde la fila de píldoras no cabe, solo sale con la caché a punto de caducar (≤ 5 min).

- La etiqueta es el número a secas (`36m`); cuenta y plan van en el popover.
- El color del icono dice el estado: verde hay caché, amarillo quedan ≤5 min, rojo no hay caché, lila es local.

El dato lo da el panel de control-nexus (`GET /api/session-routing/session/{sid}`, LAN/tailnet sin SSO); lo lee la mitad
de servidor del plugin (cache 15 s por sesión) y lo sirve al cliente por RPC, igual que paseo-plan con las tareas. El
tick de 30 s repinta la cuenta atrás descontando reloj desde la lectura. Panel alternativo: `PASEO_TTL_PANEL`.
