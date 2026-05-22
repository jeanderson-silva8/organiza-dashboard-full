const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

// Carrega variáveis do .env
dotenv.config();

// Conecta MongoDB
connectDB();

const app = express();

// ═══════════════════════════════════════════════════════
// 🛡️ PROTOCOLO DE SEGURANÇA ENTERPRISE — CAMADA 3 & 4
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
  credentials: true
}));

// [SEGURANÇA] Rate Limiting Global — Proteção contra DDoS
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // Máximo 200 requisições por IP a cada 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Muitas requisições. Tente novamente em 15 minutos.' }
});
app.use(globalLimiter);

// [SEGURANÇA] Rate Limiting de Login — Anti Força Bruta
const authLimiter = rateLimit({
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

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Servidor rodando porta ${PORT}`);
  });
}

// Export para Serverless Function da Vercel
module.exports = app;
