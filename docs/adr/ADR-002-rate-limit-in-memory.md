# ADR-002 — Rate limit in-memory aceito como dívida em ambiente serverless

**Status:** Aceito
**Data:** 2026-05-22
**Contexto:** auditoria 2026-05-22 ([AUDIT_REPORT](../AUDIT_REPORT_2026-05-22.md), achado 🟠-2)

---

## Contexto

Organiza usa `express-rate-limit` no backend, com dois limites:

- **`globalLimiter`** — 200 requests por IP a cada 15min, em todas as rotas.
- **`authLimiter`** — 5 requests por IP a cada 1min, em `/api/auth`.

O store padrão do `express-rate-limit` é **em memória**. Em deploy tradicional (VPS, container long-lived) isso funciona razoavelmente; o estado vive enquanto o processo viver.

Em **Vercel Serverless** o cenário é outro:

1. Cada função serverless tem ciclo de vida curto — após ~5min de inatividade no plano free, a instância dorme.
2. A primeira request após o sono (cold start) cria uma instância nova com contadores **zerados**.
3. Em escala horizontal (várias instâncias simultâneas), cada uma tem seu próprio Map — o atacante pode cair em instâncias diferentes a cada request.

**Implicação real:** o rate limit é **best effort, não garantido**. Um atacante que monitore o ciclo de cold start consegue uma janela de burst após cada despertar — e em escala horizontal a janela é multiplicada pelo número de instâncias ativas.

A auditoria classificou como 🟠 importante e ofereceu dois caminhos:

1. **Migrar para Vercel KV / Upstash Redis** — store compartilhado, persistente, rate limit garantido entre instâncias e cold starts.
2. **ADR registrando como dívida consciente** — manter in-memory, suavizar a linguagem do código.

---

## Decisão

**Adotada a opção 2.** O rate limit fica como está (in-memory) e este ADR registra a limitação como conhecida e aceita. A linguagem do código foi ajustada para refletir a realidade:

- O comentário do `globalLimiter` deixou de afirmar "Proteção contra DDoS" — rate limit por IP in-memory não protege contra DDoS real.
- O comentário do `authLimiter` deixou de afirmar "Anti Força Bruta" como se fosse a defesa principal — a defesa real de força bruta vem do `bcrypt cost 12` (hash de senha lento, item 9 do checklist).
- Os limites continuam configurados porque **agregam fricção a tentativas casuais**, e isso ainda tem valor mesmo no melhor cenário de bypass.

---

## Alternativas consideradas

### Migrar para Vercel KV ou Upstash Redis (rejeitada por ora)

**A favor:**
- Resolve o problema de verdade — contadores persistem entre cold starts e são compartilhados entre instâncias.
- `@upstash/ratelimit` tem integração pronta com Edge/Serverless.

**Contra:**
- Requer criar conta em um serviço externo (Upstash) ou ativar Vercel KV (com limites de plano).
- Adiciona duas envs (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) — mais superfície de configuração, mais coisa para falhar no deploy.
- Para um portfólio MERN sem ataques reais nem dados sensíveis, o custo de operação (mais um serviço para monitorar) não compensa.

---

## Trade-offs assumidos

| Aspecto | Custo aceito |
|---|---|
| Janela de burst pós-cold-start | Atacante que sincronize com o ciclo de sono consegue ~5 tentativas/minuto extras por instância despertada. Mitigado por bcrypt cost 12 — cada tentativa custa ~250ms de CPU server-side. |
| Escala horizontal | Em pico de tráfego, várias instâncias rodando em paralelo cada uma com seu Map. Aceito porque Organiza não tem tráfego suficiente para acionar escala horizontal real. |
| Defesa contra DDoS volumétrico | Inexistente neste limiter. A Vercel tem proteção DDoS de borda na infra deles — esse é o nível em que DDoS é tratado, não no aplicativo. |

---

## Nota sobre `/auth/reset-password/:id/:token` (peer review 2026-05-22)

O endpoint de reset-password **compartilha o `authLimiter`** com `/login`, `/register` e `/forgot-password` — não tem janela dedicada. Isso significa que uma tempestade de tentativas de login pode "comer" parte do orçamento de tentativas legítimas de reset. Aceito porque:

1. O **token de reset tem 256 bits de entropia** (HMAC-SHA256 sobre `JWT_SECRET + user.password`) — brute force é matematicamente impraticável independentemente do rate limit.
2. O `authLimiter` já protege contra fuzzing massivo do endpoint (5 req/min é apertado).
3. Janela dedicada por `:id` exigiria `keyGenerator` customizado + decisão sobre fallback se o IP for diferente — complexidade desproporcional ao risco.

Se um dia for adicionado um endpoint mais sensível em `/auth` (ex: `/auth/2fa-disable`, `/auth/change-email`), revisitar — o orçamento compartilhado pode ficar apertado.

---

## Quando reabrir esta decisão

- Se o produto começar a ter **tráfego real** e o rate limit virar parte da SLA.
- Se houver **incidente** de credential stuffing observado nos logs.
- Se for adicionado um endpoint mais sensível (ex: pagamento, exportação de dados) que justifique rate limit garantido.
- Em qualquer caso onde "best effort" deixe de ser aceitável.

Nesse momento, migrar para Upstash Redis ou Vercel KV passa a valer o custo.

---

## Referências

- [AUDIT_REPORT_2026-05-22](../AUDIT_REPORT_2026-05-22.md) — achado 🟠-2
- Item 36 do `AUDIT_CHECKLIST.md` — rate limit por usuário + nuance serverless
- [Documentação `express-rate-limit` — Stores](https://express-rate-limit.mintlify.app/reference/stores)
