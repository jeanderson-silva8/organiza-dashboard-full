# 🎯 THREAT_MODEL — Organiza

**Última revisão:** 2026-05-22 · alinhada com [`AUDIT_REPORT_2026-05-22`](AUDIT_REPORT_2026-05-22.md).

---

## Ativos protegidos

| Ativo | Por quê |
|---|---|
| Credenciais de usuário (e-mail + hash de senha) | Compromisso → impersonação + uso em outros serviços (reuse de senha) |
| Tarefas privadas (`Task`) | Conteúdo pessoal — agenda, planos, notas |
| `JWT_SECRET` no servidor | Assina todos os tokens — compromisso = forjar sessão de qualquer usuário |
| Conexão MongoDB Atlas (`MONGO_URI`) | Acesso direto ao banco bypassa toda a aplicação |
| Credenciais SMTP do Gmail (`EMAIL_USER`/`EMAIL_PASS`) | Permite enviar e-mail em nome do produto — phishing |
| Disponibilidade do serviço | Indisponibilidade quebra confiança em demo de portfólio |

---

## Atores de ameaça

| Ator | Capacidades | Motivação |
|---|---|---|
| Visitante anônimo | Acesso público à URL | Curiosidade, reconhecimento, defacement oportunista |
| Usuário autenticado | Conta válida no produto | Acessar dados de outros usuários (IDOR), abusar de cotas |
| Atacante de credential stuffing | Bases de senhas vazadas | Tomar conta de usuários que reusam senha |
| Script kiddie / scanner automatizado | Ferramentas públicas (nuclei, dirb, sqlmap-like) | Encontrar low-hanging fruit |
| Ex-desenvolvedor | Conhece estrutura interna | Improvável neste projeto pessoal — mantido por uma pessoa |

**Fora do modelo:** atores estatais, ataques persistentes direcionados, supply chain comprometendo `npm` direto. Organiza não tem valor que atraia esse nível.

---

## Superfícies de ataque

1. **Endpoints públicos sem auth** — `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password/:id/:token`.
2. **Endpoints autenticados** — `GET /api/auth/user`, CRUD `/api/tasks`.
3. **Recepção de e-mail** — link de reset enviado pelo Gmail SMTP.
4. **Frontend estático** — bundle JS público, `localStorage` do navegador.
5. **`.env` de produção na Vercel** — interface administrativa da Vercel.

---

## STRIDE — ameaças por categoria

### S — Spoofing (passar-se por outro)

| Ameaça | Mitigação | Status |
|---|---|:--:|
| Forjar JWT com `alg: none` ou confusão de algoritmo | `jwt.verify(..., { algorithms: ['HS256'] })` no middleware e no reset-password | ✅ |
| JWT_SECRET fraco / hardcoded | Boot exige `JWT_SECRET` ≥ 32 chars; gerado por CSPRNG; fora do git | ✅ |
| `alg: none` em token de reset | Mesmo `algorithms: ['HS256']` aplicado | ✅ |
| Reset de senha forjado (token de outro usuário) | Token assinado com `JWT_SECRET + user.password` — secret derivado da senha atual, impossível forjar sem ter a senha | ✅ |
| Identidade `userId` vinda do body em vez do token | Toda rota privada usa `req.user.id` derivado do JWT — `userId` nunca lido do body | ✅ |

### T — Tampering (alterar dados)

| Ameaça | Mitigação | Status |
|---|---|:--:|
| Editar/deletar task de outro usuário (IDOR) | PUT/DELETE conferem `task.user.toString() !== req.user.id` → 401 | ✅ |
| Gravar enum inválido em `Task.status`/`priority` via PUT | `findByIdAndUpdate` agora com `runValidators: true` (corrigido 2026-05-22) | ✅ |
| Injeção NoSQL (`{ $gt: '' }` no email) | `sanitizeString` coage `typeof !== 'string' → ''` antes da query | ✅ |
| Mass-assignment (campo extra no body) | PUT só lê campos da allowlist explícita (`fields`); register/login ignoram extras | ✅ |
| Manipular ID com formato inválido | `mongoose.Types.ObjectId.isValid` antes de `findById` → 400 | ✅ |

### R — Repudiation (negar ação)

| Ameaça | Mitigação | Status |
|---|---|:--:|
| Usuário nega ter criado/deletado task | Audit log de ações sensíveis | 🟢 não implementado — fora do escopo de portfólio |

### I — Information Disclosure (vazamento)

| Ameaça | Mitigação | Status |
|---|---|:--:|
| Stack trace ao cliente em produção | Catches retornam mensagem genérica; só `err.code` vai para log | ✅ |
| Enumeração de usuários no `forgot-password` (corpo) | Resposta genérica sempre | ✅ |
| Enumeração via timing no `forgot-password` | Envio de e-mail desacoplado da resposta (fire-and-forget) — corrigido 2026-05-22 | ✅ |
| Vazamento da MongoDB URI no log | `db.js` loga só `conn.connection.host`, nunca a URI completa | ✅ |
| Vazamento de PII em logs | Logs registram só `err.code` e ações, nunca `req.body` | ✅ |
| Source maps de produção expondo código | Vite com `sourcemap: false` (default) | ✅ |
| Segredo embutido no bundle do frontend | Frontend só usa `VITE_API_URL` (URL, sem segredo); nada sensível com prefixo `VITE_` | ✅ |
| Segredo no histórico do git | `.gitignore` cobre `.env*`; só `.env.example` versionado | ✅ |

### D — Denial of Service

| Ameaça | Mitigação | Status |
|---|---|:--:|
| Payload bomb (body grande) | `express.json({ limit: '10kb' })` | ✅ |
| Burst de requests por IP | `globalLimiter` 200/15min, `authLimiter` 5/min — best effort em serverless (ver ADR-002) | 🟡 |
| Brute force de senha | bcrypt cost 12 (~250ms/tentativa) + `authLimiter` | ✅ |
| DDoS volumétrico | Proteção de borda da Vercel — fora do app | ✅ (por infra) |
| Mongo lento por query sem índice | `Task.find({ user })` usa `_id` + ref de user; volume baixo no escopo | ✅ |

### E — Elevation of Privilege

| Ameaça | Mitigação | Status |
|---|---|:--:|
| Bypass de auth em rota privada | Middleware `auth` aplicado em `/api/tasks` e `/api/auth/user` | ✅ |
| Token de outro usuário aceito | `auth` valida assinatura e extrai `user.id` do payload — não confiável de outra forma | ✅ |
| XSS rouba token do `localStorage` → impersonação | Sem `dangerouslySetInnerHTML`, sem `innerHTML`; CSP no `vercel.json` (`script-src 'self' 'unsafe-inline'` — risco residual de XSS via injeção em ponto sem sanitização, mitigado por escape automático do JSX) | 🟡 (storage em localStorage — ADR-001) |
| CSRF | Auth via header `Authorization: Bearer`, sem cookie — vetor CSRF não se aplica | ✅ |

---

## Ameaças residuais aceitas

1. **Janela de risco do JWT (2h).** Token roubado é válido até expirar; sem revogação server-side. Aceito em [ADR-001](adr/ADR-001-auth-jwt-stateless.md).
2. **Rate limit best effort em serverless.** Janela de burst pós-cold-start. Aceito em [ADR-002](adr/ADR-002-rate-limit-in-memory.md).
3. **Token em `localStorage`.** Vulnerável a XSS se houver. Aceito por escopo de portfólio (sem `dangerouslySetInnerHTML` no código atual) — ver ADR-001.
4. **Audit log inexistente.** Não há registro de "quem fez o quê e quando". Fora do escopo de portfólio.
5. **Sem HIBP no registro de senha.** Senha mínima 8, sem checagem contra base de senhas vazadas. Aceitável no escopo.

---

## Próximas revisões

Atualizar este documento sempre que:
- Houver mudança de superfície (rota nova, integração externa).
- Houver incidente em produção.
- Uma das ameaças aceitas mudar de status (ex: adoção de Redis fecha o 🟡 do rate limit).
