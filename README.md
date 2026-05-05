# 🚀 ORGANIZA — Task Manager Workspace

> Aplicação **Full Stack** completa (MERN) para gestão inteligente de tarefas com autenticação JWT, dashboard interativo e deploy Serverless — do banco de dados ao pixel.

[![Acessar App](https://img.shields.io/badge/🌐_ACESSAR_APP-organiza.vercel.app-7C3AED?style=for-the-badge)](https://organiza-dashboard-full.vercel.app)
![Status](https://img.shields.io/badge/Status-Concluído-success?style=for-the-badge)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=for-the-badge&logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=for-the-badge&logo=mongodb&logoColor=white)

🟢 **LIVE DEMO:** [Acesse o ORGANIZA Ao Vivo Aqui](https://organiza-dashboard-full.vercel.app)

---

## 💻 Sobre o Projeto

O **ORGANIZA** é mais do que uma lista de tarefas — é uma prova de arquitetura modular focada em **Clean UI/UX** e desenvolvimento moderno **Full-Stack (MERN)**. Criado para oferecer uma experiência de usuário premium, o projeto emprega design com *Glassmorphism*, *Dark/Light Mode* instantâneo e layout intuitivo, apoiado por um backend sólido capaz de orquestrar autenticação segura e operações CRUD completas.

### ✨ Features

- 🔐 **Autenticação Segura** — JWT + Bcrypt com sessões stateless e middleware de proteção
- 🌓 **Dark / Light Mode** — Alternância instantânea com persistência de preferência
- 📊 **Dashboard Interativo** — Gráficos de progresso, estatísticas e ranqueamento de tarefas
- 📧 **Reset de Senha** — Fluxo completo com envio de e-mail via Nodemailer
- 🎨 **CSS Artesanal** — Design premium construído nativamente do zero (sem frameworks CSS)
- 📱 **Responsivo** — Layout adaptável para todas as telas
- 🔔 **Toasts & Feedbacks** — Mensagens de erro/sucesso precisas em tempo real

---

## 🛠️ Stack Tecnológico

### 📌 Frontend
| Tech | Uso |
|---|---|
| **React v19** | Motor de renderização com componentes reativos |
| **Vite.js v8** | Dev Server ultra-rápido substituto do Webpack |
| **React Router DOM** | SPA com navegação fluida entre páginas |
| **Axios** | Consumo enxuto da API REST |
| **CSS3 Custom** | Glassmorphism, gradientes e variáveis CSS (zero frameworks) |
| **Context API** | Estado global nativo para autenticação |
| **Lucide React** | Ícones vetoriais SVG modernos |

### 📌 Backend
| Tech | Uso |
|---|---|
| **Node.js + Express v5** | API REST com roteamento MVC otimizado |
| **MongoDB Atlas + Mongoose** | Banco NoSQL Cloud com validação estrita |
| **JWT** | Sessões stateless com revalidação por middleware |
| **Bcrypt** | Hash seguro de credenciais com salt aleatório |
| **Nodemailer** | Envio de e-mail para fluxo de recuperação de senha |

### 📌 Deploy
| Tech | Uso |
|---|---|
| **Vercel Serverless** | Hospedagem monorepo multi-services |

---

## 🚀 Como Rodar

```bash
git clone https://github.com/jeanderson-silva8/organiza-dashboard-full.git
cd organiza-dashboard-full

# Backend
cd backend && npm install && npm start

# Frontend (em outro terminal)
cd frontend && npm install && npm run dev
```

---

## 🎯 Por Que Este Projeto Se Destaca

1. **Domínio E2E** — Divisão clara entre Interface e Dados, sem "gambiarras" front-end
2. **Segurança Real** — Salts, interceptadores de API e proteção de rotas sensíveis
3. **Design System** — Toasts, loadings, bloqueios dinâmicos e UX centrada no usuário

---

Feito com dedicação 🧩 e muita lógica por **Jeanderson Silva**
