// Infra compartilhada das suítes de teste.
// Sobe um MongoDB in-memory, popula as envs obrigatórias (necessário porque
// server.js faz fail-fast no boot — ver auditoria 2026-05-22), e só então
// requeresce o módulo do servidor.
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

let mongoServer;
let app;

async function startTestEnv() {
  // Se não há mongoServer ou ele foi parado, cria um novo
  if (!mongoServer) {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();
  }

  // Popula envs obrigatórias (idempotente — não causa erro se já existem)
  process.env.NODE_ENV = 'test';
  // JWT_SECRET precisa ter >= 32 chars (fail-fast no boot)
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    process.env.JWT_SECRET = 'test-secret-must-be-at-least-32-characters-long-and-strong';
  }
  process.env.EMAIL_USER = process.env.EMAIL_USER || 'test@example.com';
  process.env.EMAIL_PASS = process.env.EMAIL_PASS || 'test-pass-for-ci-only';

  // Se a conexão Mongoose morreu (ex: stopTestEnv anterior), reconecta
  if (mongoose.connection.readyState !== 1) {
    global.__mongooseConn = null;
    const connectDB = require('../config/db');
    await connectDB();
  }

  // Carrega o app apenas uma vez (require cache)
  if (!app) {
    app = require('../server');
  }

  return app;
}

async function stopTestEnv() {
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
  global.__mongooseConn = null;
}

async function clearDb() {
  // Se a conexão não está ativa, ignora a limpeza silenciosamente.
  if (mongoose.connection.readyState !== 1) return;
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.collections();
  for (const c of collections) {
    await c.deleteMany({});
  }
}

async function registerUser(appInstance, { username = 'user', email, password = 'StrongPass123!' }) {
  const res = await request(appInstance)
    .post('/api/auth/register')
    .send({ username, email, password });
  if (res.status !== 200) {
    throw new Error(`registerUser falhou: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token, user: res.body.user };
}

module.exports = {
  startTestEnv,
  stopTestEnv,
  clearDb,
  registerUser,
  request,
};
