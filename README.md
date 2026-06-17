# 🚀 ORGANIZA — Task Manager Full-Stack

> Aplicação **Full-Stack MERN** para gestão de tarefas com autenticação JWT, recuperação de senha por e-mail e dashboard interativo — do banco ao pixel, com camadas de segurança aplicadas e auditadas.

[![Acessar App](https://img.shields.io/badge/🌐_ACESSAR_APP-organiza--dashboard--full.vercel.app-7C3AED?style=for-the-badge)](https://organiza-dashboard-full.vercel.app)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Express_5-339933?style=for-the-badge&logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy-Vercel_Serverless-000000?style=for-the-badge&logo=vercel&logoColor=white)
![CI](https://img.shields.io/github/actions/workflow/status/jeanderson-silva8/organiza-dashboard-full/ci.yml?branch=main&style=for-the-badge&label=CI&logo=githubactions&logoColor=white)
![Tests](https://img.shields.io/badge/Tests-33%2F33_passing-success?style=for-the-badge&logo=nodedotjs&logoColor=white)

🟢 **LIVE DEMO:** [Acesse o ORGANIZA Ao Vivo Aqui](https://organiza-dashboard-full.vercel.app)
🛡️ **Auditoria de Segurança Aplicada:** [Veja a auditoria 2026-05-22](docs/AUDIT_REPORT_2026-05-22.md)

<div align="center">
  <div style="max-width: 800px; background-color: #161b22; border: 1px solid #30363d; border-bottom: none; border-top-left-radius: 8px; border-top-right-radius: 8px; padding: 10px; font-family: monospace; font-size: 13px; color: #8b949e; text-align: left;">
   
  </div>
  <div style="max-width: 800px; border: 1px solid #30363d; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; overflow: hidden; line-height: 0;">
    <img src="assets/organiza-dashboard.gif" width="100%" height="auto" alt="Organiza Dashboard Demo" />
  </div>
</div>

---

## 💻 Sobre o Projeto

A maioria dos "task managers" de portfólio mostra um CRUD bonito e para por aí — auth simulada com `localStorage`, sem reset de senha, sem trade-off documentado. O resultado é uma demo que prova familiaridade com React, não engenharia de backend.

O **ORGANIZA** é a versão honesta desse projeto: um **task manager Full-Stack MERN real** — banco MongoDB Atlas, API Express, autenticação JWT com bcrypt e fluxo de recuperação de senha por e-mail via Nodemailer — servido como duas funções serverless na Vercel a partir de um monorepo. O design (glassmorphism + dark/light mode persistido) existe para que a interface acompanhe o nível da engenharia, não para esconder a falta dela.

A auditoria de segurança 2026-05-22 (modo paranoico, 2 passadas) está em [`docs/AUDIT_REPORT_2026-05-22.md`](docs/AUDIT_REPORT_2026-05-22.md). Todos os achados foram tratados — bug funcional crítico corrigido, endurecimentos de auth aplicados, decisões de escopo documentadas em ADRs.

---

## 🎯 Destaques Técnicos & Desafios Superados

**Conciliar autenticação stateless e UX numa arquitetura serverless onde nada do servidor persiste entre requests.**

JWT em deploy tradicional é trivial. Em serverless, decisões aparentemente pequenas (onde guardar o token, quanto tempo dura, como expirar) mudam a forma de operar o produto. Três decisões resolveram:

1. **Token de reset descartável amarrado à senha atual** — o link de reset enviado por e-mail é um JWT assinado com `JWT_SECRET + user.password`. Trocar a senha invalida automaticamente todos os links pendentes, sem precisar de tabela de tokens server-side. É a forma mais leve de revogação possível, e foi auditada como sólida (item 11 do checklist).
2. **Autorização explícita em todas as rotas de tarefa** — `PUT`/`DELETE`/`GET` em `/api/tasks` checam `task.user.toString() !== req.user.id` antes de tocar no documento. `userId` nunca vem do body do cliente — sempre do JWT autenticado. Fecha a classe de bug IDOR.
3. **Fail-fast de envs no boot** — sem `MONGO_URI`, `JWT_SECRET`, `EMAIL_USER` ou `EMAIL_PASS`, a função serverless aborta com erro claro no log da Vercel. `JWT_SECRET < 32 chars` também aborta. Antes, secret ausente quebrava silenciosamente só no primeiro login.

---

## 📐 Decisões Arquiteturais (Trade-offs)

- **JWT stateless `2h` em vez de refresh token httpOnly** — para um portfólio sem dados sensíveis, refresh token completo (collection nova, rotação, `/auth/refresh`, interceptor no frontend) é custo de complexidade sem retorno proporcional. Trade-off e gatilho de reabertura em [`ADR-001`](docs/adr/ADR-001-auth-jwt-stateless.md).
- **`express-rate-limit` in-memory como best effort** — o store padrão zera a cada cold start da Vercel; a defesa real contra força bruta vem do `bcrypt cost 12`. Documentado em [`ADR-002`](docs/adr/ADR-002-rate-limit-in-memory.md), com gatilhos para migrar para Vercel KV/Upstash quando o tráfego justificar.
- **Validação manual em vez de Zod** — cinco endpoints simples; `sanitizeString` coage tipos e já neutraliza injeção NoSQL no `findOne({ email })`. Schema library entraria como peso morto neste escopo. Decisão em [`ADR-003`](docs/adr/ADR-003-validacao-manual.md).
- **CSS3 do zero (sem Tailwind/Bootstrap)** — variáveis CSS + glassmorphism + dark mode persistido com ~600 linhas escritas à mão. Trade-off: mais código de UI para manter; ganho: zero dependência de framework de estilo, bundle menor, controle total da estética.

---

## <a id="seg-camadas"></a>🔒 Segurança — camadas e status

> *Auditoria 2026-05-22 (modo paranoico, 2 passadas): **0 vulnerabilidades críticas exploráveis**. 1 bug funcional crítico encontrado e corrigido (descasamento de enum entre model e rota — quebrava `POST /tasks` em produção). Endurecimentos de auth aplicados. Resumo detalhado em [`AUDIT_REPORT_2026-05-22`](docs/AUDIT_REPORT_2026-05-22.md); modelagem em [`THREAT_MODEL`](docs/THREAT_MODEL.md); política de reporte em [`SECURITY.md`](SECURITY.md).*

| Camada | Implementação | Status |
|---|---|:--:|
| Autenticação | JWT HS256 (`algorithms: ['HS256']` no `sign` e `verify`), `expiresIn: 2h`, `JWT_SECRET ≥ 32 chars` validado no boot | ✅ |
| Hash de senha | `bcrypt` cost 12 (~250ms por tentativa — defesa real contra brute force) | ✅ |
| Política de senha | Mínimo 8 caracteres, máximo 128 (recomendação NIST — comprimento > complexidade) | ✅ |
| Autorização | Toda rota privada exige middleware `auth`; PUT/DELETE de task validam propriedade — anti-IDOR | ✅ |
| Reset de senha | Token JWT descartável assinado com `JWT_SECRET + user.password` — trocar a senha invalida links pendentes automaticamente | ✅ |
| Anti-enumeração | `forgot-password` responde imediato com mensagem genérica; envio SMTP fire-and-forget — fecha enumeração por corpo *e* por timing | ✅ |
| Validação de entrada | Helpers manuais com coerção de tipo (`sanitizeString`), `mongoose.ObjectId.isValid` em IDs de rota — neutraliza injeção NoSQL ([`ADR-003`](docs/adr/ADR-003-validacao-manual.md)) | ✅ |
| Headers HTTP (API) | `helmet()` no Express — HSTS, `X-Content-Type-Options`, `X-Frame-Options`, etc. | ✅ |
| Headers HTTP (frontend) | `vercel.json` com CSP, HSTS preload, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` | ✅ |
| CORS | Allowlist explícita (produção + localhost + previews da Vercel) — sem wildcard | ✅ |
| Rate limit | `express-rate-limit` (200/15min global, 5/min em `/auth`) — best effort em serverless ([`ADR-002`](docs/adr/ADR-002-rate-limit-in-memory.md)) | 🟡 |
| Body limit | `express.json({ limit: '10kb' })` — anti payload bomb | ✅ |
| Segredos | `.env*` em `.gitignore`; só `.env.example` versionado; fail-fast no boot se ausentes | ✅ |
| Logs | `console.error` com `err.code` apenas — nunca `req.body`, nunca a `MONGO_URI` completa | ✅ |
| Frontend XSS | Zero `dangerouslySetInnerHTML`/`innerHTML`/`eval`; JSX escapa por padrão | ✅ |
| Source maps em prod | Vite com `sourcemap: false` (default) — código-fonte não exposto | ✅ |
| Segredos no bundle | Frontend só usa `VITE_API_URL` (URL, não segredo); nada sensível com prefixo `VITE_`; guard no CI faz `grep` por padrões de segredo no `dist/` | ✅ |
| Testes adversariais | 33 testes (`node:test` + Supertest + `mongodb-memory-server`): IDOR em PUT/DELETE, `alg:none` rejeitado, anti-enumeração no login e forgot-password, regressão do enum 🔴, suíte completa do `reset-password` (cross-id, reuso após troca, token sem `+user.password`, expirado) | ✅ |
| CI | GitHub Actions a cada PR: testes do backend, lint+build do frontend, `npm audit --audit-level=high`, guard de segredo no bundle | ✅ |

### O que NÃO está implementado (e por quê)

- **Refresh token + revogação server-side** — assumido como trade-off ([`ADR-001`](docs/adr/ADR-001-auth-jwt-stateless.md)). Token em `localStorage` com `expiresIn: 2h` é janela de risco aceita no escopo de portfólio.
- **Audit log de ações sensíveis** — fora do escopo deste projeto.
- **Soft delete em tarefas** — `findByIdAndDelete` é hard delete. Sem requisito de "desfazer" no produto.
- **Política HIBP no registro** — sem checagem de senhas vazadas via Have I Been Pwned. Mínimo de 8 caracteres + bcrypt cost 12 é a defesa atual.

---

## ✨ Principais Funcionalidades

- 🔐 **Autenticação completa** — registro, login, sessão JWT de 2h, logout, "esqueci minha senha" com link por e-mail
- 📊 **Dashboard interativo** — gráfico de progresso circular (conic-gradient), cards de estatística clicáveis como filtros, busca em tempo real
- ✅ **CRUD de tarefas** — título, prioridade (Baixa/Média/Alta), status (Pendente/Em Progresso/Concluída), data limite, edição inline
- 🌓 **Dark / Light mode** — alternância instantânea com persistência em `localStorage` + workaround específico para Safari iOS (repaint forçado)
- 📧 **Reset de senha** — fluxo completo via Nodemailer + Gmail SMTP, com token descartável seguro
- 🎨 **CSS3 do zero** — glassmorphism, gradientes, variáveis CSS, animações slide-up — sem framework de estilo
- 🔔 **Toasts contextuais** — feedback de sucesso/erro em todas as operações
- 📱 **Responsivo** — layout adaptável

---

## 🛠️ Stack Tecnológico & Arquitetura

### Backend
- **Node.js + Express v5** — API REST
- **MongoDB Atlas + Mongoose v9** — banco NoSQL gerenciado
- **JWT (`jsonwebtoken` v9)** — sessão stateless HS256
- **bcryptjs v3** — hash de senha cost 12
- **Helmet v8** — headers de segurança HTTP
- **express-rate-limit v8** — fricção a brute force
- **Nodemailer v8** — envio de e-mail para reset de senha
- **dotenv** — carga de envs no dev

### Frontend
- **React 19 + Vite 8** — base reativa + dev server
- **React Router DOM v7** — SPA
- **Context API** — estado global de autenticação
- **Axios** — cliente HTTP com interceptor para anexar Bearer token
- **CSS3 puro** — variáveis CSS + glassmorphism (sem Tailwind/Bootstrap)
- **Lucide React** — ícones SVG

### Deploy
- **Vercel Serverless** — monorepo com dois entrypoints (frontend estático + backend como função serverless), unificados por `vercel.json`. Headers de segurança aplicados na edge.

---

## 📂 Visão Geral da Estrutura

```text
organiza-dashboard-full/
├── vercel.json                 # Headers de segurança + roteamento serverless
├── SECURITY.md                 # Política de reporte de vulnerabilidades
├── backend/
│   ├── server.js               # Express boot, fail-fast envs, Helmet, CORS, rate limit
│   ├── config/db.js            # Conexão Mongo (log seguro — nunca URI completa)
│   ├── middleware/auth.js      # jwt.verify com algorithms fixado
│   ├── models/                 # User, Task (enums em pt-BR, fonte única de verdade)
│   └── routes/
│       ├── auth.js             # register, login, forgot-password, reset-password
│       └── tasks.js            # CRUD com autorização explícita e ObjectId.isValid
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── context/AuthContext.jsx
│       ├── services/api.js     # Axios + interceptor de Bearer token
│       └── pages/              # Login, Register, Dashboard, ForgotPassword, ResetPassword
└── docs/
    ├── AUDIT_REPORT_2026-05-22.md   # Auditoria paranoica completa (2 passadas)
    ├── THREAT_MODEL.md              # STRIDE + ameaças residuais aceitas
    └── adr/
        ├── ADR-001-auth-jwt-stateless.md
        ├── ADR-002-rate-limit-in-memory.md
        └── ADR-003-validacao-manual.md
```

---

## 🚀 Como Executar Localmente

### Requisitos
- Node.js 20+
- npm 10+
- Conta gratuita no MongoDB Atlas
- Conta Gmail com **senha de app** habilitada (para Nodemailer)

### Variáveis de ambiente

No diretório `backend/`, crie um `.env` a partir do `.env.example`:

```dotenv
MONGO_URI=mongodb+srv://USER:PASS@cluster.mongodb.net/organiza
JWT_SECRET=<gerar com: openssl rand -base64 64>   # ≥ 32 chars, obrigatório
EMAIL_USER=seu-email@gmail.com
EMAIL_PASS=<senha de app do Gmail — não a senha da conta>
```

Sem qualquer uma delas, o backend **aborta no boot** com erro claro (fail-fast).

### Rodando

```bash
git clone https://github.com/jeanderson-silva8/organiza-dashboard-full.git
cd organiza-dashboard-full

# Backend (porta 5000)
cd backend && npm install && npm run dev

# Frontend (em outro terminal — porta 5173)
cd frontend && npm install && npm run dev
```

---

## 👑 Autor

**Jeanderson Silva** 🤓✍️

*Desenvolvedor Full-Stack | Engenheiro de Software*

Do schema Mongoose ao gradiente cônico do gráfico de progresso, passando por autenticação JWT auditada, fluxo de reset de senha resistente a enumeração, fail-fast de envs no boot e camadas de segurança documentadas em ADRs.

Sinta-se à vontade para auditar o middleware `auth`, examinar a estratégia do token de reset descartável, ou ler o [relatório completo de auditoria](docs/AUDIT_REPORT_2026-05-22.md) — incluindo o que foi corrigido, o que ficou como dívida consciente, e por quê.
