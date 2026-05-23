# 🛡️ Relatório de Auditoria de Segurança — ORGANIZA

> **Projeto:** Organiza — Task Manager Workspace (`organiza-dashboard-full`)
> **Stack:** MERN (MongoDB Atlas + Mongoose · Express 5 · React 19 · Node) — deploy Vercel Serverless
> **Estágio:** Produção
> **Repositório:** https://github.com/jeanderson-silva8/organiza-dashboard-full
> **Data:** 2026-05-22
> **Modo:** 🔴 PARANOICO (2 passadas — auditoria + revisão adversarial)
> **Checklist aplicado:** AUDIT_CHECKLIST.md v1.7.0 (57 itens) + addon contextual nenhum (CRUD REST simples)

---

## 🎯 Por que modo paranoico

Organiza expõe superfície de servidor real: autenticação JWT, hash de senha, fluxo de reset de senha por e-mail e dados privados de usuário (tarefas) em banco persistente. Diferente de um showcase estático, aqui um bug de autorização ou de validação tem custo concreto. A 2ª passada adversarial agrega valor — e, de fato, encontrou um bug funcional que a 1ª passada havia subestimado.

---

## 📊 Resumo executivo

Organiza tem uma base de segurança **acima da média para um projeto de portfólio**: autenticação aplicada em todas as rotas privadas, verificação de propriedade (anti-IDOR) nas tarefas, bcrypt cost 12, Helmet, CORS com allowlist, rate limit e body limit. O backend mostra cuidado real — comentários `[SEGURANÇA]`, logs sem PII, respostas genéricas no `forgot-password`.

**Porém, a auditoria encontrou 1 bug funcional crítico** que não é de segurança no sentido clássico, mas quebra o produto em produção: o **enum do model `Task` não bate com os valores que a rota grava**. Criar uma tarefa retorna HTTP 500; editar grava valores inválidos silenciosamente.

| Severidade | Qtd | Itens |
|---|---|---|
| 🔴 Bug real (crítico) | 1 | Enum `Task` incompatível entre model e rota |
| 🟠 Importante | 3 | Rate limit in-memory em serverless · JWT sem refresh/revogação · `jwt.verify` sem algoritmo fixado |
| 🟡 Qualidade | 6 | Sem fail-fast de envs · headers ausentes no frontend · token em `localStorage` · senha mínima 6 · timing no `forgot-password` · sem error handler central |
| 📝 Decisão consciente (→ ADR) | 3 | Validação manual (sem Zod) · sem refresh token · token em `localStorage` |
| 🟢 Diferenciação ausente | — | testes, CI, THREAT_MODEL, SECURITY.md, docs de API, ADRs, soft delete, audit log |

**Veredito:** 0 vulnerabilidades de severidade crítica exploráveis remotamente. 1 bug funcional crítico (🔴) que deve ser corrigido antes de qualquer outra coisa. Os achados 🟠 são endurecimentos legítimos de auth. Nenhum segredo vazado no repositório.

---

## 🔴 Bug real — corrigir primeiro

### 🔴-1 · Enum de `Task` incompatível entre o model e a rota — CRUD de tarefas quebrado

**Arquivos:** [`backend/models/Task.js:13-19`](../backend/models/Task.js) · [`backend/routes/tasks.js:16-17`](../backend/routes/tasks.js)

O schema do model define:

```js
status:   enum: ['Pendente', 'Em Progresso', 'Concluída']
priority: enum: ['Baixa', 'Média', 'Alta']
```

A rota `tasks.js` valida contra listas **completamente diferentes**:

```js
const VALID_STATUSES   = ['todo', 'in-progress', 'done', 'pending', 'completed'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
```

**Consequência em produção:**

1. **`POST /api/tasks` → HTTP 500.** A rota normaliza `status` para `'todo'` e `priority` para `'medium'` (defaults da lista em inglês). Em seguida `new Task({...}).save()` roda a validação do Mongoose contra o enum em português — `'todo'` não está em `['Pendente','Em Progresso','Concluída']` → `ValidationError` → cai no catch → 500. **Nenhuma tarefa pode ser criada.**
2. **`PUT /api/tasks/:id` grava lixo silenciosamente.** `findByIdAndUpdate` **não roda validadores por padrão** — então o update aceita `'todo'`/`'medium'` e persiste valores que violam o próprio schema. O banco fica com documentos inconsistentes.

Classificação: **🔴 bug real.** Não é trade-off nem escopo — é um descasamento que torna a feature principal do produto inoperante. Provavelmente o model foi escrito numa iteração (PT) e a rota noutra (EN) sem reconciliar.

**Correção (a aplicar na fase 2 — fora desta auditoria):** unificar o vocabulário. Recomendado adotar os valores em inglês como canônicos (mais comuns em API), atualizar o enum do model para `['todo','in-progress','done']` e `['low','medium','high','urgent']`, e ajustar o frontend (Dashboard) para ler/escrever esses valores. Alternativamente manter PT em ambos. O essencial é **uma fonte única de verdade** — idealmente uma constante compartilhada importada pelos dois lados. Adicionar `runValidators: true` ao `findByIdAndUpdate` para que o PUT também valide.

---

## 🟠 Achados importantes

### 🟠-2 · Rate limit in-memory em ambiente serverless (item 36 / item 37)

**Arquivo:** [`backend/server.js:44-61`](../backend/server.js)

`express-rate-limit` usa, por padrão, store **em memória**. Na Vercel cada função serverless é efêmera: após ~5 min de inatividade a instância dorme, e cada cold start zera os contadores. O `authLimiter` (5 tentativas/min) e o `globalLimiter` (200/15min) são **best effort, não garantidos** — um atacante que provoque/aguarde um cold start tem uma janela de burst.

Não é uma falha grave isolada (bcrypt cost 12 já encarece brute force), mas o README e os comentários do código vendem "Anti Força Bruta" e "Proteção contra DDoS" com mais confiança do que o ambiente entrega.

Classificação: **🟠 importante** — corrigir OU documentar como dívida consciente. Solução real: store compartilhado (Upstash Redis / Vercel KV). Se ficar como está, **documentar em ADR** (ver ADR-002 sugerido) e suavizar a linguagem do README.

### 🟠-3 · JWT de 15 min sem refresh token nem revogação (item 10)

**Arquivos:** [`backend/routes/auth.js:61,99`](../backend/routes/auth.js) · [`frontend/src/context/AuthContext.jsx`](../frontend/src/context/AuthContext.jsx)

O access token expira em 15 min — ótimo para a janela de risco. Mas **não há refresh token**: quando o token expira, o usuário simplesmente é deslogado no meio do uso (próxima chamada → 401 → `localStorage.removeItem`). Não há também estratégia de revogação (logout é só client-side; o token continua válido até expirar).

Classificação: **🟠 importante.** O par "expiração curta + sem refresh" troca segurança por uma UX ruim. Duas saídas válidas: (a) implementar refresh token httpOnly com rotação, ou (b) assumir conscientemente o trade-off e subir o `expiresIn` para algo usável (ex.: 2h) — documentando em ADR. Hoje o projeto está num meio-termo que não é nem o mais seguro nem o mais usável.

### 🟠-4 · `jwt.verify` não fixa o algoritmo (item 10)

**Arquivo:** [`backend/middleware/auth.js:16`](../backend/middleware/auth.js)

```js
const decoded = jwt.verify(token, process.env.JWT_SECRET);
```

Sem passar `{ algorithms: ['HS256'] }`, a verificação aceita qualquer algoritmo declarado no header do token. O `jsonwebtoken` v9 já rejeita `alg: none` por padrão, então o risco prático é baixo num monolito HS256 — mas fixar a allowlist é a prática correta e fecha a porta de confusão de algoritmo. Mesma observação para o `jwt.verify` do `reset-password` ([`auth.js:199`](../backend/routes/auth.js)).

Classificação: **🟠 importante** (endurecimento barato e direto).

---

## 🟡 Achados de qualidade

### 🟡-5 · Sem fail-fast de variáveis de ambiente (item 6)

`server.js` chama `dotenv.config()` e segue. Se `JWT_SECRET` estiver ausente, o servidor sobe e só falha no primeiro login (`jwt.sign` com secret `undefined`). `EMAIL_USER`/`EMAIL_PASS` idem — falham só no `forgot-password`. Recomendado validar as envs obrigatórias no boot e abortar com erro claro. Observação: `connectDB` faz `process.exit(1)` em falha de Mongo — correto em servidor tradicional, mas em serverless o ideal é deixar a função falhar com erro logado (não há processo longo para "matar").

### 🟡-6 · Frontend sem headers de segurança (item 56)

[`vercel.json`](../vercel.json) só configura roteamento (`experimentalServices`). O Helmet protege as respostas da **API**, mas os assets estáticos do **frontend** saem sem CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options` nem `Referrer-Policy`. Recomendado adicionar um bloco `headers` no `vercel.json` cobrindo o frontend — mesmo padrão já aplicado em outros projetos do portfólio (Nexus Portal, TrendScope).

### 🟡-7 · Access token em `localStorage` (item 53)

[`AuthContext.jsx`](../frontend/src/context/AuthContext.jsx) e [`api.js`](../frontend/src/services/api.js) guardam o JWT em `localStorage` — legível por qualquer script, logo exposto a roubo via XSS. É uma decisão comum e aceitável para um projeto deste porte (não há `dangerouslySetInnerHTML` no código, então a superfície de XSS é pequena), mas deve ser **decisão consciente documentada** (ADR), não acidente. Caminho premium: token em memória + refresh httpOnly — alinha com o achado 🟠-3.

### 🟡-8 · Política de senha mínima de 6 caracteres (item 38)

[`auth.js:24-26`](../backend/routes/auth.js) — `isValidPassword` aceita ≥ 6. O NIST recomenda mínimo 8, idealmente mais; comprimento importa mais que complexidade. Subir para 8+ é uma linha. Checagem contra HIBP seria o nível diferenciação.

### 🟡-9 · Side-channel de timing no `forgot-password` (item 12)

[`auth.js:121-179`](../backend/routes/auth.js) — a resposta é genérica ✅ ("se o e-mail estiver cadastrado..."), o que impede enumeração pelo corpo. Mas o envio do e-mail é `await`ado **antes** de responder: para um e-mail cadastrado a resposta demora o envio SMTP; para um inexistente, retorna na hora. A diferença de latência permite enumeração de usuários. Mitigar respondendo imediatamente e enviando o e-mail de forma assíncrona (fire-and-forget), ou normalizando o tempo de resposta.

### 🟡-10 · Sem error handler centralizado (itens 22-23)

Cada controller tem seu `try/catch` repetido com `console.error` + `res.status(500)`. Funciona e os logs são limpos (só `err.code`), mas não há middleware de erro global nem classes de erro. É a diferença entre "funciona" e "padrão sênior". Melhoria de qualidade, não bug.

### 📝 Validação manual em vez de biblioteca (item 5)

A validação usa helpers próprios (`sanitizeString`, `isValidEmail`, `isValidPassword`) em vez de Zod/Joi. Funciona e — importante — o `sanitizeString` coage tudo para `string`, o que **neutraliza injeção NoSQL** nas queries `findOne({ email })` (item 14 ✅ na prática). Não é bug; é decisão de escopo. Migrar para Zod com `.strict()` daria rejeição de campos extras e schemas reusáveis. Vale registrar como decisão consciente.

---

## 🧾 Decisões conscientes sugeridas (→ ADR)

O projeto não tem pasta `docs/adr/`. Recomendados:

- **ADR-001 — Autenticação stateless com JWT em `localStorage`, sem refresh token.** Contexto: projeto de portfólio MERN, deploy serverless. Decisão e trade-offs (UX vs. segurança, XSS). Resolve formalmente 🟠-3 e 🟡-7.
- **ADR-002 — Rate limit in-memory aceito como dívida.** Registrar que em serverless o rate limit é best effort e a migração para Redis/KV é o caminho. Resolve 🟠-2.
- **ADR-003 — Validação manual em vez de schema library.** Por que helpers próprios bastam no escopo atual.

---

## ✅ O que está bem feito (não regredir)

- **Auth em todas as rotas privadas** — `tasks.js` e `/auth/user` usam o middleware `auth` (item 1 ✅).
- **Anti-IDOR** — `PUT`/`DELETE` de task checam `task.user.toString() !== req.user.id`; `GET` filtra por `user: req.user.id` (itens 2-3 ✅).
- **`userId` vem sempre do token**, nunca do body (item 3 ✅).
- **bcrypt cost 12** (item 9 ✅).
- **Helmet ativo** na API (item 32 ✅).
- **CORS com allowlist** explícita, sem wildcard (item 42 ✅).
- **Body limit 10kb** — anti payload bomb (✅).
- **Logs sem PII** — só `err.code`; `db.js` nunca imprime a URI (itens 25-26 ✅).
- **Segredos fora do versionado** — `.gitignore` cobre `.env*`; só `.env.example` está commitado (item 13 ✅).
- **`forgot-password` com resposta genérica** — não revela existência do e-mail pelo corpo (item 12 parcial ✅).
- **Token de reset assinado com `JWT_SECRET + user.password`** — padrão sólido: trocar a senha invalida automaticamente links de reset pendentes (item 11 ✅, decisão boa).
- **Entrypoint único** — `vercel.json` aponta backend para `backend/server.js`, o mesmo arquivo auditado; sem handler serverless paralelo bypassando defesas (item 17 ✅).

---

## 📋 Matriz de cobertura (57 itens)

| # | Item | Status | Nota |
|---|---|:--:|---|
| 1 | Auth em rotas privadas | ✅ | middleware `auth` em tasks e `/auth/user` |
| 2 | Autorização em toda operação | ✅ | checagem de propriedade em PUT/DELETE/GET tasks |
| 3 | IDs sensíveis vêm da sessão | ✅ | `user: req.user.id`, nunca do body |
| 4 | Identidade em handlers async | 🚫 | N/A — sem sockets/queues/jobs |
| 5 | Validação por biblioteca | 📝 | validação manual; coage tipos — funciona, sem Zod |
| 6 | Envs validadas no boot | 🟡 | sem fail-fast — 🟡-5 |
| 7 | Fail-fast de dependências | 🟡 | `connectDB` faz `exit(1)`; inadequado p/ serverless |
| 8 | Fail-fast preservado na orquestração | 🚫 | N/A — sem docker-compose/helm/terraform |
| 9 | Hash de senha adequado | ✅ | bcrypt cost 12 |
| 10 | JWT seguro + refresh + revogação | 🟠 | 15min OK; sem refresh/revogação; `verify` sem `algorithms` — 🟠-3, 🟠-4 |
| 11 | Comparação tempo-constante | ✅ | tokens validados via `jwt.verify`; sem `===` de segredo |
| 12 | Brute force protection | 🟡 | `authLimiter` existe; in-memory em serverless + timing — 🟠-2, 🟡-9 |
| 13 | Segredos fora do versionado | ✅ | `.gitignore` cobre `.env*`; só `.env.example` commitado |
| 14 | Queries parametrizadas | ✅ | Mongoose; `sanitizeString` coage p/ string — sem injeção NoSQL |
| 15 | Proteção SSRF | 🚫 | N/A — servidor não faz fetch de URL externa |
| 16 | Sem desserialização insegura / SSTI | ✅ | sem `eval`/`Function`; e-mail é template fixo |
| 17 | Serverless single-entrypoint | ✅ | `vercel.json` → `backend/server.js` (mesmo arquivo auditado) |
| 18 | Cookies httpOnly/secure/sameSite | 🚫 | N/A — auth via Bearer header, sem cookies |
| 19 | Testes de caminhos críticos | 🟢 | ausente |
| 20 | Testes adversariais (THREAT_MODEL) | 🟢 | ausente |
| 21 | CI/CD com checks por PR | 🟢 | ausente |
| 22 | Error handler centralizado | 🟡 | try/catch repetido por controller — 🟡-10 |
| 23 | Controllers usam `throw` | 🟡 | usam `res.status().json()` direto |
| 24 | Sem race conditions / TOCTOU | 🟡 | register tem `findOne`→`save` (mitigado por unique index) |
| 25 | Logging estruturado | 🟡 | `console.error` padronizado, mas não JSON |
| 26 | Logs sem PII/segredos | ✅ | só `err.code`; URI nunca logada |
| 27 | Documentação de API | 🟢 | ausente |
| 28 | THREAT_MODEL.md | 🟢 | ausente |
| 29 | Operações de cota atômicas | 🚫 | N/A — sem cotas/limites |
| 30 | SECURITY.md | 🟢 | ausente |
| 31 | README honesto | 🟡 | bom, mas "Anti DDoS/Força Bruta" otimista vs. rate limit in-memory |
| 32 | Headers de segurança (Helmet) | ✅ | `helmet()` na API |
| 33 | CSP estrita | 🟡 | Helmet default na API; frontend sem CSP — 🟡-6 |
| 34 | IDs com formato estrito | 🟡 | `findById(req.params.id)` sem regex; CastError vira 500 |
| 35 | Paginação em listagens | 🟡 | `GET /tasks` retorna array completo (aceitável no escopo) |
| 36 | Rate limit por usuário | 🟠 | só por IP, in-memory, serverless — 🟠-2 |
| 37 | IP confiável atrás de proxy | 🟡 | sem `trust proxy`; IP da Vercel pode não ser o real |
| 38 | Política de senha forte | 🟡 | mínimo 6 — recomendado 8+ — 🟡-8 |
| 39 | Health live + ready | 🟢 | só `GET /` retornando texto |
| 40 | Sem queries N+1 | ✅ | `Task.find` simples, sem populate em loop |
| 41 | Erros sem vazar stack em prod | ✅ | respostas genéricas; `err.code` só no log |
| 42 | CORS com allowlist | ✅ | função de origin com allowlist explícita |
| 43 | Proteção CSRF | ✅ | auth via Bearer header, não cookie — risco baixo |
| 44 | Dependências atualizadas + audit | 🟡 | versões recentes; sem Dependabot nem `npm audit` no CI |
| 45 | Correlation ID | 🟢 | ausente |
| 46 | Métricas/telemetria | 🟢 | ausente |
| 47 | Soft delete | 🟢 | `findByIdAndDelete` — hard delete |
| 48 | Audit log de ações sensíveis | 🟢 | ausente |
| 49 | Plano de backup/DR | 🟢 | ausente (MongoDB Atlas faz backup automático) |
| 50 | Política de retenção (LGPD) | 🟢 | ausente |
| 51 | Dockerfile multi-stage | 🚫 | N/A — deploy serverless Vercel |
| 52 | ADRs | 🟢 | ausente — 3 sugeridos acima |
| 53 | Onde o token é armazenado | 🟡 | `localStorage` — 🟡-7 |
| 54 | Guard de rota valida token | 🟡 | `AuthContext` só checa presença + chama `/auth/user`; sem decode/exp local |
| 55 | Conteúdo do usuário sanitizado | ✅ | sem `dangerouslySetInnerHTML`/`innerHTML`; JSX escapa por padrão |
| 56 | CSP no servidor do frontend | 🟡 | `vercel.json` sem `headers` — 🟡-6 |
| 57 | Erros do backend tratados na UI | ✅ | páginas usam `err.response?.data?.msg` com fallback amigável |

**Contagem:** ✅ 19 · 🟠 1 (item 10) · 🟡 17 · 🟢 14 · 🚫 6 · 📝 1 — (o bug 🔴-1 não é item do checklist universal: é descasamento funcional model↔rota, fora da grade dos 57.)

---

## 🔍 Nota da 2ª passada (revisão adversarial)

A 1ª passada tratou o achado do enum como "inconsistência menor de nomenclatura". A 2ª passada, seguindo o caminho de execução real (`new Task().save()` → validação do Mongoose), concluiu que **`POST /api/tasks` retorna 500 em produção** — a feature central do produto. Reclassificado de 🟡 para 🔴. É exatamente o tipo de bug que a passada adversarial existe para pegar: parecia cosmético, é funcional.

Outros pontos verificados na 2ª passada e confirmados **OK**: o `reset-password` exige consistência entre `:id` e `:token` (o secret é derivado da senha daquele usuário — não há como forjar para outro); o IDOR de tasks está realmente fechado; não há handler serverless paralelo bypassando o Helmet/CORS.

---

## 🛠️ Plano de ação sugerido (ordem de prioridade)

1. **🔴 Corrigir o enum `Task`** — unificar vocabulário model↔rota↔frontend; adicionar `runValidators: true` no `findByIdAndUpdate`. *(Bloqueia o produto — fazer primeiro.)*
2. **🟠 `jwt.verify` com `{ algorithms: ['HS256'] }`** nos dois pontos. *(1 linha cada.)*
3. **🟠 Decidir o rumo do JWT** — refresh token httpOnly **ou** ADR-001 + `expiresIn` usável.
4. **🟠 Rate limit** — migrar para Vercel KV/Upstash **ou** ADR-002 + ajustar linguagem do README.
5. **🟡 Headers no `vercel.json`** para o frontend (CSP, HSTS, etc.).
6. **🟡 Fail-fast de envs** no boot · senha mínima 8 · resposta imediata no `forgot-password`.
7. **🟢 Diferenciação** — `SECURITY.md`, `THREAT_MODEL.md`, ADRs, testes Vitest+Supertest dos caminhos de auth, CI.

> Conforme o método: esta auditoria **não aplica correções**. As correções entram numa fase 2 separada, após o aval do autor.

---

*Auditoria conduzida com o AUDIT_CHECKLIST.md v1.7.0 — framework "Protocolo de Segurança" (github.com/jeanderson-silva8/protocolo-de-seguranca). Modo paranoico: 2 passadas.*
