# 🛡️ Política de Segurança — Organiza

Obrigado por dedicar atenção à segurança do Organiza. Este documento descreve como reportar vulnerabilidades e o que esperar do processo.

## Versões suportadas

O Organiza é um projeto de portfólio. A versão suportada é a que está em `main` e publicada em `https://organiza-dashboard-full.vercel.app`. Versões antigas não recebem patches.

## Como reportar uma vulnerabilidade

**Não abra uma issue pública** para vulnerabilidades de segurança.

Reporte via um destes canais:

- **E-mail:** [silvajeanderson165@gmail.com](mailto:silvajeanderson165@gmail.com) — assunto começando com `[SECURITY] Organiza:`
- **GitHub Security Advisories:** aba `Security` → `Report a vulnerability` em [github.com/jeanderson-silva8/organiza-dashboard-full](https://github.com/jeanderson-silva8/organiza-dashboard-full)

Inclua, se possível:
- Descrição do problema e impacto estimado.
- Passos para reproduzir (PoC, request, payload).
- Versão / commit em que foi observado.
- Sua sugestão de mitigação (opcional).

## SLA de resposta

Por ser projeto de portfólio mantido por uma pessoa, o SLA é informal:

- **Resposta inicial:** até 5 dias úteis.
- **Avaliação e plano:** até 14 dias.
- **Correção em produção:** depende da severidade — críticos têm prioridade, médios entram no próximo ciclo.

## Escopo

**No escopo:**
- API backend em `https://organiza-dashboard-full.vercel.app/api/*`
- Frontend em `https://organiza-dashboard-full.vercel.app`
- Repositório `github.com/jeanderson-silva8/organiza-dashboard-full`

**Fora do escopo:**
- Infraestrutura da Vercel, MongoDB Atlas, Gmail (Nodemailer) — reporte direto aos vendors.
- Falta de rate limit garantido em ambiente serverless — decisão consciente registrada em [`docs/adr/ADR-002`](docs/adr/ADR-002-rate-limit-in-memory.md).
- Access token em `localStorage` — decisão consciente registrada em [`docs/adr/ADR-001`](docs/adr/ADR-001-auth-jwt-stateless.md).

## Práticas de segurança implementadas

Resumo factual — detalhamento e evidências no [relatório de auditoria](docs/AUDIT_REPORT_2026-05-22.md):

| Camada | Implementação |
|---|---|
| Autenticação | JWT HS256, secret ≥ 32 chars (validado no boot), `expiresIn: 2h`, verificação com `algorithms: ['HS256']` |
| Senha | `bcrypt` cost 12, mínimo 8 caracteres |
| Reset de senha | Token JWT descartável assinado com `JWT_SECRET + user.password` — invalidado automaticamente ao trocar a senha |
| Autorização | Todas as rotas privadas exigem middleware `auth`; PUT/DELETE de task checam propriedade (anti-IDOR) |
| Validação | Helpers manuais com coerção de tipo (neutraliza injeção NoSQL); IDs validados com `mongoose.Types.ObjectId.isValid` ([ADR-003](docs/adr/ADR-003-validacao-manual.md)) |
| Headers HTTP | `helmet()` na API + CSP/HSTS/`X-Frame-Options`/`Referrer-Policy`/`Permissions-Policy` no `vercel.json` para o frontend |
| CORS | Allowlist explícita (origem do produção + localhost) |
| Rate limit | `express-rate-limit` (best effort — ver [ADR-002](docs/adr/ADR-002-rate-limit-in-memory.md)) |
| Segredos | `.env*` em `.gitignore`; só `.env.example` versionado |
| Fail-fast | Boot aborta se `MONGO_URI`, `JWT_SECRET`, `EMAIL_USER` ou `EMAIL_PASS` faltarem |
| Frontend | Sem `dangerouslySetInnerHTML`/`innerHTML`/`eval`; JSX escapa por padrão |

## Modelagem de ameaças

Veja [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

## Histórico de auditorias

- **2026-05-22** — auditoria paranoica completa (2 passadas) aplicando o framework [Protocolo de Segurança](https://github.com/jeanderson-silva8/protocolo-de-seguranca) — [relatório](docs/AUDIT_REPORT_2026-05-22.md). Resultado: 0 vulnerabilidades críticas exploráveis, 1 bug funcional crítico corrigido (enum de `Task`), endurecimentos de auth aplicados, suíte de 24 testes adversariais (`node:test` + Supertest + `mongodb-memory-server`) e CI no GitHub Actions cobrindo testes + audit + guard de segredo no bundle.
