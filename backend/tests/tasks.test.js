const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestEnv, stopTestEnv, clearDb, registerUser, request } = require('./helpers');

let app;

describe('Tasks — CRUD, autorização anti-IDOR, regressão do enum 🔴', () => {
  before(async () => { app = await startTestEnv(); });
  after(async () => { await stopTestEnv(); });
  beforeEach(async () => { await clearDb(); });

  // ─── Regressão do bug 🔴 do enum (auditoria 2026-05-22) ─

  test('POST /api/tasks — cria com defaults pt-BR (regressão do enum quebrado)', async () => {
    const { token } = await registerUser(app, { email: 'a@x.com' });
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'minha tarefa' });
    assert.equal(
      res.status, 200,
      `criar tarefa simples deveria retornar 200; veio ${res.status}: ${JSON.stringify(res.body)}`,
    );
    assert.equal(res.body.title, 'minha tarefa');
    assert.equal(res.body.status, 'Pendente');
    assert.equal(res.body.priority, 'Média');
  });

  test('POST /api/tasks — aceita status e priority válidos em pt-BR', async () => {
    const { token } = await registerUser(app, { email: 'a@x.com' });
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 't', status: 'Em Progresso', priority: 'Alta' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'Em Progresso');
    assert.equal(res.body.priority, 'Alta');
  });

  test('PUT /api/tasks/:id — status fora do enum é IGNORADO (filtro + runValidators)', async () => {
    const { token } = await registerUser(app, { email: 'a@x.com' });
    const task = (await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 't' })).body;

    // Antes do fix: 'lixo-invalido' ia para fields.status, findByIdAndUpdate sem
    // runValidators aceitava silenciosamente. Agora: o filtro VALID_STATUSES
    // descarta, runValidators é o cinto de segurança redundante.
    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'lixo-invalido' });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'Pendente', 'status não pode ter mudado');
  });

  // ─── Autenticação obrigatória ──────────────────────────

  test('GET /api/tasks — sem token retorna 401', async () => {
    const res = await request(app).get('/api/tasks');
    assert.equal(res.status, 401);
  });

  test('POST /api/tasks — sem token retorna 401', async () => {
    const res = await request(app).post('/api/tasks').send({ title: 't' });
    assert.equal(res.status, 401);
  });

  // ─── Isolamento por usuário ────────────────────────────

  test('GET /api/tasks — só retorna tarefas do usuário autenticado', async () => {
    const { token: tokA } = await registerUser(app, { username: 'alice', email: 'a@x.com' });
    const { token: tokB } = await registerUser(app, { username: 'bob', email: 'b@x.com' });
    await request(app).post('/api/tasks').set('Authorization', `Bearer ${tokA}`).send({ title: 'da A' });
    await request(app).post('/api/tasks').set('Authorization', `Bearer ${tokB}`).send({ title: 'da B' });

    const resA = await request(app).get('/api/tasks').set('Authorization', `Bearer ${tokA}`);
    assert.equal(resA.body.length, 1);
    assert.equal(resA.body[0].title, 'da A');
  });

  // ─── Anti-IDOR ─────────────────────────────────────────

  test('PUT /api/tasks/:id — usuário A NÃO consegue editar tarefa do usuário B (IDOR)', async () => {
    const { token: tokA } = await registerUser(app, { username: 'alice', email: 'a@x.com' });
    const { token: tokB } = await registerUser(app, { username: 'bob', email: 'b@x.com' });
    const taskB = (await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokB}`)
      .send({ title: 'da B' })).body;

    const res = await request(app)
      .put(`/api/tasks/${taskB._id}`)
      .set('Authorization', `Bearer ${tokA}`)
      .send({ title: 'sequestrei' });
    assert.equal(res.status, 401);

    // Verifica que NADA mudou no banco — não basta receber 401, o estado precisa
    // estar intacto. (Ver item 20 do checklist: teste adversarial verifica também
    // o estado, não só o código de resposta.)
    const tasksDeB = (await request(app).get('/api/tasks').set('Authorization', `Bearer ${tokB}`)).body;
    assert.equal(tasksDeB[0].title, 'da B');
  });

  test('DELETE /api/tasks/:id — usuário A NÃO consegue deletar tarefa do usuário B (IDOR)', async () => {
    const { token: tokA } = await registerUser(app, { username: 'alice', email: 'a@x.com' });
    const { token: tokB } = await registerUser(app, { username: 'bob', email: 'b@x.com' });
    const taskB = (await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokB}`)
      .send({ title: 'da B' })).body;

    const res = await request(app)
      .delete(`/api/tasks/${taskB._id}`)
      .set('Authorization', `Bearer ${tokA}`);
    assert.equal(res.status, 401);

    const tasksDeB = (await request(app).get('/api/tasks').set('Authorization', `Bearer ${tokB}`)).body;
    assert.equal(tasksDeB.length, 1, 'tarefa da B continua viva');
  });

  // ─── Validação de ID ───────────────────────────────────

  test('PUT /api/tasks/:id — ID com formato inválido retorna 400 (não 500 por CastError)', async () => {
    const { token } = await registerUser(app, { email: 'a@x.com' });
    const res = await request(app)
      .put('/api/tasks/nao-eh-objectid')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'x' });
    assert.equal(res.status, 400);
  });

  test('DELETE /api/tasks/:id — ID com formato inválido retorna 400', async () => {
    const { token } = await registerUser(app, { email: 'a@x.com' });
    const res = await request(app)
      .delete('/api/tasks/nao-eh-objectid')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 400);
  });

  // ─── Identidade vem do token, não do body ──────────────

  test('POST /api/tasks — userId no body é IGNORADO; userId vem sempre do token (item 3)', async () => {
    const { token: tokA } = await registerUser(app, { username: 'alice', email: 'a@x.com' });
    const { user: userB } = await registerUser(app, { username: 'bob', email: 'b@x.com' });

    // Atacante autenticado como A tenta criar tarefa em nome de B passando user no body
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${tokA}`)
      .send({ title: 'falsificada', user: userB.id });
    assert.equal(res.status, 200);

    // A tarefa apareceu para A (dono real), e B não vê nada
    const tasksDeA = (await request(app).get('/api/tasks').set('Authorization', `Bearer ${tokA}`)).body;
    assert.equal(tasksDeA.length, 1);
  });
});
