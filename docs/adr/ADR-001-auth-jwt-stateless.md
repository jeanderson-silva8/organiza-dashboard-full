# ADR-001 — Autenticação stateless com JWT, sem refresh token

**Status:** Aceito
**Data:** 2026-05-22
**Contexto:** auditoria 2026-05-22 ([AUDIT_REPORT](../AUDIT_REPORT_2026-05-22.md), achado 🟠-3)

---

## Contexto

Organiza é um projeto de portfólio MERN com deploy serverless (Vercel). A autenticação usa JWT assinado com `HS256`, transmitido pelo header `Authorization: Bearer` e armazenado no `localStorage` do navegador.

A versão original do código usava `expiresIn: '15m'` sem refresh token. A combinação era ruim: token tão curto que o usuário caía deslogado no meio do uso (próxima request → 401 → `localStorage.removeItem`), mas sem o ganho operacional de revogação por refresh.

A auditoria classificou como 🟠 importante e ofereceu dois caminhos:

1. **Refresh token httpOnly com rotação** — access curto (15min) + refresh longo (7d) em cookie `httpOnly` + endpoint `/auth/refresh` + collection `RefreshToken` com revogação.
2. **ADR + expiração usável** — manter stateless, subir `expiresIn` para um valor que cobre uma sessão típica, documentar o trade-off.

---

## Decisão

**Adotada a opção 2.** O access token passa a ter `expiresIn: '2h'` e o algoritmo é fixado em `HS256` (tanto no `sign` quanto no `verify`). Sem refresh token. Sem revogação server-side. Logout é client-side (`localStorage.removeItem('token')`).

Implementação:

- [`backend/routes/auth.js`](../../backend/routes/auth.js) — `jwt.sign(payload, secret, { expiresIn: '2h', algorithm: 'HS256' }, ...)` em `register` e `login`.
- [`backend/middleware/auth.js`](../../backend/middleware/auth.js) — `jwt.verify(token, secret, { algorithms: ['HS256'] })`.
- Token de **reset de senha** continua com `expiresIn: '15m'` — é um caso diferente (uso único, secret derivado da senha atual do usuário, invalidado automaticamente ao trocar a senha).

---

## Alternativas consideradas

### Refresh token httpOnly com rotação (rejeitada)

**A favor:**
- Janela de risco do access token volta a ser curta (15min).
- Revogação real possível (deletar a família do refresh).
- Detecção de roubo de token via reuse-detection.

**Contra:**
- Adiciona uma collection (`RefreshToken`), uma rota (`/auth/refresh`), rotação a cada uso, e tratamento de erro de reuse.
- Frontend precisa de interceptor que chama `/refresh` quando recebe 401 e reroda a request.
- O cookie `httpOnly` em deploy multi-domínio na Vercel exige cuidado com `SameSite=None; Secure` ou domínio compartilhado — não é trivial num monorepo Vercel.
- Para um projeto de portfólio sem dados financeiros ou regulados, o ganho de segurança não compensa o custo de complexidade.

### Subir `expiresIn` para 24h (rejeitada)

**Contra:** janela de risco grande demais sem nenhuma estratégia de revogação. 24h de validade para um token roubado é incompatível com armazenamento em `localStorage` (vulnerável a XSS — ver ADR-001 relacionado se vier um futuro ADR sobre storage).

---

## Trade-offs assumidos

| Aspecto | Custo aceito |
|---|---|
| Janela de risco do access token | 2h se o token for roubado via XSS. Mitigado pela ausência de `dangerouslySetInnerHTML` no código, pelo CSP do `vercel.json` e pelo escopo "task manager" (dados pessoais, sem PII sensível nem dinheiro). |
| Revogação | Inexistente. Logout só limpa o cliente; o JWT continua válido server-side até expirar. Aceito porque o produto não tem fluxo de "expulsar dispositivo" nem dados que justifiquem. |
| UX | Sessão dura 2h — alinhado com sessão típica de "abrir o dashboard, organizar tarefas, fechar". |

---

## Quando reabrir esta decisão

- Se Organiza ganhar **dados sensíveis** (financeiros, médicos, multi-tenant com isolamento crítico).
- Se houver **incidente de roubo de token** observado em produção.
- Se o produto precisar de **logout efetivo server-side** (ex: "sair de todas as sessões").
- Se o expiresIn de 2h se mostrar **operacionalmente curto** na prática (relatos de usuário sendo deslogado no meio do uso).

Nesse momento, implementar refresh token httpOnly com rotação passa a valer o custo.

---

## Referências

- [AUDIT_REPORT_2026-05-22](../AUDIT_REPORT_2026-05-22.md) — achados 🟠-3 e 🟠-4
- Item 10 do `AUDIT_CHECKLIST.md` — JWT seguro + refresh + revogação
