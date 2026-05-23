const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

// Carrega variáveis do .env
dotenv.config();

// ═══════════════════════════════════════════════════════
// 🛡️ FAIL-FAST DE ENVS — falha cedo, com erro claro
// ═══════════════════════════════════════════════════════
// Sem isso, JWT_SECRET ausente só quebraria no primeiro login (secret undefined),
// e EMAIL_USER/PASS só no primeiro forgot-password. Auditoria 2026-05-22.
const REQUIRED_ENVS = ['MONGO_URI', 'JWT_SECRET', 'EMAIL_USER', 'EMAIL_PASS'];
const missingEnvs = REQUIRED_ENVS.filter((k) => !process.env[k] || process.env[k].trim() === '');
if (missingEnvs.length > 0) {
  console.error(
    `[BOOT] Variáveis de ambiente obrigatórias ausentes: ${missingEnvs.join(', ')}. ` +
      `Defina-as no .env (local) ou nas Environment Variables do projeto na Vercel.`
  );
  throw new Error(`Missing required env vars: ${missingEnvs.join(', ')}`);
}
// JWT_SECRET muito curto = secret fraco. CSPRNG mínimo recomendado: 32 bytes ⇒ ≥ 32 chars.
if (process.env.JWT_SECRET.length < 32) {
  console.error('[BOOT] JWT_SECRET muito curto. Use `openssl rand -base64 64` para gerar.');
  throw new Error('JWT_SECRET too short (min 32 chars)');
}

const app = express();

// [SERVERLESS] Middleware que garante conexão MongoDB ativa antes de processar qualquer request.
// Em serverless (Vercel), o top-level executa no cold start, mas connectDB() retorna uma promise
// que pode NÃO ter resolvido quando o primeiro request chega. Sem este middleware, o Mongoose
// tenta operar sem conexão ativa e falha silenciosamente (err.code === undefined → "UNKNOWN").
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('[DB] Falha ao conectar antes do request:', err.message);
    res.status(503).json({ msg: 'Serviço temporariamente indisponível. Tente novamente.' });
  }
});


// ═══════════════════════════════════════════════════════
// 🛡️ Camadas de segurança aplicadas
// ═══════════════════════════════════════════════════════

// [SEGURANÇA] Headers HTTP de proteção (Helmet)
// Configura automaticamente: X-Content-Type-Options, X-Frame-Options,
// Strict-Transport-Security (HSTS), X-XSS-Protection, etc.
app.use(helmet());

// [SEGURANÇA] CORS Restrito — Aceita APENAS o frontend autorizado
const allowedOrigins = [
  'https://organiza-dashboard-full.vercel.app',
  'http://localhost:3005',
  'http://localhost:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    // Permite requisições sem origin (ex: Postman, curl em dev)
    if (!origin) return callback(null, true);
    // Permite origens da lista fixa
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // Permite URLs de preview/deploy da Vercel (ex: organiza-dashboard-full-abc123.vercel.app)
    if (/^https:\/\/organiza-dashboard-full.*\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Bloqueado pela política de CORS'));
  },
  // [SEGURANÇA] credentials: false — autenticação é via header `Authorization: Bearer`,
  // não via cookie. Sem cookies, habilitar credentials apenas amplia a superfície de
  // CORS sem entregar nenhum recurso. Peer review 2026-05-22.
  credentials: false
}));

// [SEGURANÇA] Rate Limiting — best effort em serverless (ver ADR-002).
// Store in-memory: contadores zeram a cada cold start. Mitigação real de força
// bruta vem do bcrypt cost 12. Migração para Vercel KV/Upstash é trabalho futuro.
// Em ambiente de teste, viramos no-op para não atrapalhar os testes adversariais
// (que disparam dezenas de requests em sequência contra /auth).
const isTest = process.env.NODE_ENV === 'test';
const noopLimiter = (req, res, next) => next();

const globalLimiter = isTest ? noopLimiter : rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // Máximo 200 requisições por IP a cada 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Muitas requisições. Tente novamente em 15 minutos.' }
});
app.use(globalLimiter);

// [SEGURANÇA] Rate Limiting agressivo em /auth — janela curta, threshold baixo
const authLimiter = isTest ? noopLimiter : rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 5, // Máximo 5 tentativas por minuto
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Muitas tentativas de login. Aguarde 1 minuto.' }
});

app.use(express.json({ limit: '10kb' })); // Limita tamanho do body (anti payload bomb)

// Main Root Route
app.get('/', (req, res) => {
  res.send('API is running...');
});

// Importar rotas (com rate limiting no auth)
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/tasks', require('./routes/tasks'));

// Fallback caso a Vercel corte o /api da requisição (Route Prefix)
app.use('/auth', authLimiter, require('./routes/auth'));
app.use('/tasks', require('./routes/tasks'));

const PORT = process.env.PORT || 5000;

// Só ouve uma porta quando o arquivo é executado diretamente (npm run dev / node server.js).
// Em produção serverless (Vercel) e em testes (require do supertest), o módulo é
// apenas importado e o handler é usado via `module.exports`. require.main !== module
// nesses casos. Isso evita conflito de porta entre suíte de testes paralela.
if (require.main === module && process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Servidor rodando porta ${PORT}`);
  });
}

// Export para Serverless Function da Vercel
module.exports = app;
