const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestEnv, stopTestEnv, clearDb, registerUser, request } = require('./helpers');

let app;

describe('Auth — registro, login, middleware', () => {
  before(async () => { app = await startTestEnv(); });
  after(async () => { await stopTestEnv(); });
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
