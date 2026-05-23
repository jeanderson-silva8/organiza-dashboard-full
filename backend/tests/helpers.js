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
  if (app) return app;

  mongoServer = await MongoMemoryServer.create();

  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = mongoServer.getUri();
  // JWT_SECRET precisa ter >= 32 chars (fail-fast no boot)
  process.env.JWT_SECRET = 'test-secret-must-be-at-least-32-characters-long-and-strong';
  process.env.EMAIL_USER = 'test@example.com';
  process.env.EMAIL_PASS = 'test-pass-for-ci-only';

  app = require('../server');

  // server.js faz connectDB() sem await; espera o Mongoose ficar conectado.
  if (mongoose.connection.readyState !== 1) {
    await new Promise((resolve, reject) => {
      mongoose.connection.once('open', resolve);
      mongoose.connection.once('error', reject);
    });
  }

  return app;
}

async function stopTestEnv() {
  try { await mongoose.disconnect(); } catch (_) { /* ignore */ }
  if (mongoServer) await mongoServer.stop();
  app = null;
}

async function clearDb() {
  const db = mongoose.connection.db;
  if (!db) return;
  const collections = await db.collections();
  for (const c of collections) {
    await c.deleteMany({});
  }
}

async function registerUser(app, { username = 'user', email, password = 'StrongPass123!' }) {
  const res = await request(app)
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
