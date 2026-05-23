const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startTestEnv, stopTestEnv, clearDb, registerUser, request } = require('./helpers');
const User = require('../models/User');

let app;

describe('Auth — registro, login, middleware', () => {
  before(async () => { app = await startTestEnv(); });
  // NÃO faz stopTestEnv aqui — o segundo describe (reset-password) precisa
  // do mesmo ambiente ativo. Cleanup final fica no último describe do arquivo.
  beforeEach(async () => { await clearDb(); });

  // ─── Registro ──────────────────────────────────────────

  test('POST /api/auth/register — payload válido cria usuário e retorna JWT', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'jeanderson',
      email: 'j@example.com',
      password: 'StrongPass123!',
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token, 'token deve vir no body');
    assert.equal(res.body.user.email, 'j@example.com');
    assert.equal(res.body.user.password, undefined, 'hash de senha não deve sair na resposta');
  });

  test('POST /api/auth/register — senha curta (< 8) é rejeitada (item 38 do checklist)', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'pedro', email: 'a@b.com', password: 'abc12',
    });
    assert.equal(res.status, 400);
    assert.match(res.body.msg, /senha/i);
  });

  test('POST /api/auth/register — email inválido é rejeitado', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'pedro', email: 'sem-arroba', password: 'StrongPass1!',
    });
    assert.equal(res.status, 400);
  });

  test('POST /api/auth/register — e-mail duplicado retorna 400', async () => {
    await registerUser(app, { email: 'dup@x.com' });
    const res = await request(app).post('/api/auth/register').send({
      username: 'pedro', email: 'dup@x.com', password: 'StrongPass1!',
    });
    assert.equal(res.status, 400);
  });

  // ─── Login ─────────────────────────────────────────────

  test('POST /api/auth/login — credencial errada retorna mensagem genérica (anti-enumeração)', async () => {
    await registerUser(app, { email: 'a@b.com', password: 'StrongPass1!' });
    const res = await request(app).post('/api/auth/login').send({
      email: 'a@b.com', password: 'wrong-pass',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.msg, 'Invalid Credentials');
  });

  test('POST /api/auth/login — usuário inexistente retorna a MESMA mensagem (anti-enumeração)', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@x.com', password: 'StrongPass1!',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.msg, 'Invalid Credentials');
  });

  test('POST /api/auth/login — credencial correta retorna token', async () => {
    await registerUser(app, { email: 'a@b.com', password: 'StrongPass1!' });
    const res = await request(app).post('/api/auth/login').send({
      email: 'a@b.com', password: 'StrongPass1!',
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  // ─── Forgot password (anti-enumeração) ─────────────────

  test('POST /api/auth/forgot-password — usuário existente retorna mensagem genérica', async () => {
    await registerUser(app, { email: 'real@x.com' });
    const res = await request(app).post('/api/auth/forgot-password').send({
      email: 'real@x.com',
    });
    assert.equal(res.status, 200);
    assert.match(res.body.msg, /se o e-mail estiver cadastrado/i);
  });

  test('POST /api/auth/forgot-password — usuário inexistente retorna a MESMA mensagem', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({
      email: 'nobody@x.com',
    });
    assert.equal(res.status, 200);
    assert.match(res.body.msg, /se o e-mail estiver cadastrado/i);
  });

  // ─── Middleware auth ───────────────────────────────────

  test('GET /api/auth/user — sem token retorna 401', async () => {
    const res = await request(app).get('/api/auth/user');
    assert.equal(res.status, 401);
  });

  test('GET /api/auth/user — token mal-formado retorna 401', async () => {
    const res = await request(app)
      .get('/api/auth/user')
      .set('Authorization', 'Bearer NOT_A_JWT');
    assert.equal(res.status, 401);
  });

  test('GET /api/auth/user — token alg:none é REJEITADO (algorithms HS256 fixado)', async () => {
    // header { alg: 'none', typ: 'JWT' } · payload com user.id falso · sem assinatura
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ user: { id: '507f1f77bcf86cd799439011' } })).toString('base64url');
    const noneToken = `${header}.${payload}.`;
    const res = await request(app)
      .get('/api/auth/user')
      .set('Authorization', `Bearer ${noneToken}`);
    assert.equal(res.status, 401, 'alg:none deve ser bloqueado pelo allowlist explícito');
  });

  test('GET /api/auth/user — token válido devolve o usuário SEM o campo password', async () => {
    const { token } = await registerUser(app, { email: 'me@x.com' });
    const res = await request(app)
      .get('/api/auth/user')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.email, 'me@x.com');
    assert.equal(res.body.password, undefined);
  });
});

// ─────────────────────────────────────────────────────────────
// Reset password — testes adversariais (peer review 2026-05-22)
// ─────────────────────────────────────────────────────────────
//
// Endpoint sensível (operação destrutiva: troca senha) que estava sem cobertura
// de teste. A peer review pediu cenários adversariais explícitos para validar
// as propriedades de segurança: secret derivado da senha invalida tokens antigos,
// cross-id é matematicamente impossível, alg:none é bloqueado, etc.

describe('Auth — reset-password (cenários adversariais)', () => {
  before(async () => { app = await startTestEnv(); });
  after(async () => { await stopTestEnv(); });
  beforeEach(async () => { await clearDb(); });

  // Helper: sobe um usuário e devolve o token de reset válido para ele
  async function setupResetFlow(email = 'victim@x.com') {
    await registerUser(app, { username: 'victim', email, password: 'OriginalPass1!' });
    const user = await User.findOne({ email });
    const secret = process.env.JWT_SECRET + user.password;
    const token = jwt.sign({ id: user.id }, secret, { expiresIn: '15m', algorithm: 'HS256' });
    return { user, token };
  }

  // ─── Caminho feliz (regression guard) ───────────────────

  test('POST /reset-password — token válido troca a senha e novo login funciona', async () => {
    const { user, token } = await setupResetFlow('happy@x.com');
    const res = await request(app)
      .post(`/api/auth/reset-password/${user.id}/${token}`)
      .send({ password: 'NewStrongPass2!' });
    assert.equal(res.status, 200);

    const login = await request(app).post('/api/auth/login').send({
      email: 'happy@x.com', password: 'NewStrongPass2!',
    });
    assert.equal(login.status, 200);
    assert.ok(login.body.token);
  });

  // ─── ID malformado — pega o achado da peer review ──────

  test('POST /reset-password — id malformado retorna 400 (não 500 por CastError)', async () => {
    const { token } = await setupResetFlow();
    const res = await request(app)
      .post(`/api/auth/reset-password/nao-eh-objectid/${token}`)
      .send({ password: 'NewStrongPass2!' });
    assert.equal(res.status, 400);
    assert.match(res.body.msg, /inválid/i);
  });

  // ─── ID válido mas inexistente ──────────────────────────

  test('POST /reset-password — id válido mas inexistente retorna 404', async () => {
    const { token } = await setupResetFlow();
    const ghost = '507f1f77bcf86cd799439011';
    const res = await request(app)
      .post(`/api/auth/reset-password/${ghost}/${token}`)
      .send({ password: 'NewStrongPass2!' });
    assert.equal(res.status, 404);
  });

  // ─── Senha fraca ────────────────────────────────────────

  test('POST /reset-password — senha < 8 caracteres é rejeitada', async () => {
    const { user, token } = await setupResetFlow();
    const res = await request(app)
      .post(`/api/auth/reset-password/${user.id}/${token}`)
      .send({ password: 'abc' });
    assert.equal(res.status, 400);
    assert.match(res.body.msg, /senha/i);
  });

  // ─── Token alg:none ─────────────────────────────────────

  test('POST /reset-password — token alg:none é REJEITADO (algorithms HS256 fixado)', async () => {
    const { user } = await setupResetFlow();
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ id: user.id })).toString('base64url');
    const noneToken = `${header}.${payload}.`;
    const res = await request(app)
      .post(`/api/auth/reset-password/${user.id}/${noneToken}`)
      .send({ password: 'NewStrongPass2!' });
    assert.equal(res.status, 400);
  });

  // ─── Token expirado ─────────────────────────────────────

  test('POST /reset-password — token expirado é rejeitado', async () => {
    await registerUser(app, { username: 'expired', email: 'exp@x.com', password: 'OriginalPass1!' });
    const user = await User.findOne({ email: 'exp@x.com' });
    const secret = process.env.JWT_SECRET + user.password;
    const expired = jwt.sign({ id: user.id }, secret, { expiresIn: '-1s', algorithm: 'HS256' });
    const res = await request(app)
      .post(`/api/auth/reset-password/${user.id}/${expired}`)
      .send({ password: 'NewStrongPass2!' });
    assert.equal(res.status, 400);
  });

  // ─── Token assinado SEM concatenar user.password (propriedade matemática) ──

  test('POST /reset-password — token assinado só com JWT_SECRET (sem +user.password) é rejeitado', async () => {
    // Esse teste prova a propriedade central do esquema: o link só é válido se foi
    // gerado pelo /forgot-password (que sabe a senha atual). Um atacante que conheça
    // só o JWT_SECRET (ex: leak interno parcial) ainda não consegue forjar reset.
    const { user } = await setupResetFlow();
    const halfToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '15m', algorithm: 'HS256' });
    const res = await request(app)
      .post(`/api/auth/reset-password/${user.id}/${halfToken}`)
      .send({ password: 'NewStrongPass2!' });
    assert.equal(res.status, 400);
  });

  // ─── Cross-id attack ────────────────────────────────────

  test('POST /reset-password — token de Mallory NÃO funciona com :id de Vítima (cross-id)', async () => {
    // Propriedade matemática do esquema: secret = JWT_SECRET + user.password.
    // Mallory gera token válido pra si mesma. Tenta usar com :id da Vítima.
    // findById(victim.id) retorna a Vítima → secret_recalc = JWT_SECRET + vitima.password
    // → assinatura não bate → jwt.verify falha → 400.
    await registerUser(app, { username: 'mallory', email: 'mal@x.com', password: 'MalloryPass1!' });
    await registerUser(app, { username: 'vitima', email: 'vic@x.com', password: 'VictimPass1!' });
    const mallory = await User.findOne({ email: 'mal@x.com' });
    const victim  = await User.findOne({ email: 'vic@x.com' });

    const malSecret = process.env.JWT_SECRET + mallory.password;
    const malToken = jwt.sign({ id: mallory.id }, malSecret, { expiresIn: '15m', algorithm: 'HS256' });

    const res = await request(app)
      .post(`/api/auth/reset-password/${victim.id}/${malToken}`)
      .send({ password: 'AttackerOwnedNow1!' });
    assert.equal(res.status, 400);

    // Confirma que a senha da Vítima continua sendo a original
    const stillVictim = await request(app).post('/api/auth/login').send({
      email: 'vic@x.com', password: 'VictimPass1!',
    });
    assert.equal(stillVictim.status, 200, 'senha da Vítima continua intacta');
  });

  // ─── Reuso após troca de senha (propriedade de revogação automática) ──

  test('POST /reset-password — mesmo token usado 2x falha na 2ª (secret muda quando senha troca)', async () => {
    const { user, token } = await setupResetFlow('twice@x.com');

    const first = await request(app)
      .post(`/api/auth/reset-password/${user.id}/${token}`)
      .send({ password: 'FirstNewPass1!' });
    assert.equal(first.status, 200);

    // Segunda tentativa com o mesmo token: agora user.password mudou,
    // então secret = JWT_SECRET + new_hash ≠ secret que assinou o token.
    const second = await request(app)
      .post(`/api/auth/reset-password/${user.id}/${token}`)
      .send({ password: 'SecondNewPass1!' });
    assert.equal(second.status, 400, 'reuso de link de reset deve falhar');
  });
});
