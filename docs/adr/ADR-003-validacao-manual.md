# ADR-003 — Validação manual de input em vez de biblioteca de schema

**Status:** Aceito
**Data:** 2026-05-22
**Contexto:** auditoria 2026-05-22 ([AUDIT_REPORT](../AUDIT_REPORT_2026-05-22.md), achado 📝)

---

## Contexto

O item 5 do `AUDIT_CHECKLIST.md` pede validação de todos os inputs com biblioteca dedicada (Zod, Joi, Yup, Pydantic). Organiza usa **helpers próprios escritos à mão**:

- `sanitizeString(str, maxLength)` — coage para string, trim, slice.
- `isValidEmail(email)` — regex simples + limite de 254 chars.
- `isValidPassword(password)` — tipo + faixa de tamanho (8-128).

Em `backend/routes/tasks.js`, os enums (`VALID_STATUSES`, `VALID_PRIORITIES`) são validados com `Array.includes`, e os IDs com `mongoose.Types.ObjectId.isValid`.

---

## Decisão

**Manter a validação manual.** Não introduzir Zod neste momento.

---

## Justificativa

1. **A superfície de entrada é pequena e estável.** Cinco endpoints (`/auth/register`, `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, CRUD de `/tasks`), com payloads de 1-5 campos cada. Schemas Zod aqui seriam um arquivo declarativo bonito — mas o custo de manutenção dos helpers atuais já é baixo.

2. **A defesa central contra injeção NoSQL é o `sanitizeString`, não o nome da biblioteca.** O ponto crítico do item 14 (queries parametrizadas) é que o input que entra em `findOne({ email })` seja garantidamente uma string — `sanitizeString` faz `typeof str !== 'string' ? '' : ...`, neutralizando o payload `{ $gt: '' }` que normalmente quebra Mongo. Trocar para `z.string().email()` daria o mesmo resultado no fim.

3. **Sem dívida silenciosa.** Esta decisão é explícita; se o projeto crescer (mais endpoints, payloads aninhados, refresh token), o gatilho de migração para Zod fica registrado abaixo.

---

## Alternativas consideradas

### Migrar para Zod com `.strict()` (rejeitada por ora)

**A favor:**
- Schemas reusáveis (mesmo schema valida o body e gera tipos TypeScript no frontend, se o projeto migrar para TS).
- `.strict()` rejeita campos extras — defesa contra mass-assignment automática.
- `zod-to-openapi` geraria documentação de API "de graça" (alinhado com o item 27 do checklist).

**Contra:**
- Adiciona dependência e fricção para 5 endpoints simples.
- O frontend é JS, não TS — o ganho de tipos compartilhados não se realiza hoje.

---

## Quando reabrir esta decisão

- Se o número de endpoints passar de ~15 (a complexidade da manutenção dos helpers começa a doer).
- Se for adicionada **documentação OpenAPI** (item 27) — Zod + `zod-to-openapi` é o caminho mais barato.
- Se o frontend migrar para **TypeScript** — schemas compartilhados passam a ter valor concreto.
- Se aparecer um endpoint com **payload aninhado** (ex: nested object, array de objetos) onde validação manual fica feia.

---

## Referências

- [AUDIT_REPORT_2026-05-22](../AUDIT_REPORT_2026-05-22.md) — achado 📝
- Item 5 do `AUDIT_CHECKLIST.md` — validação por biblioteca
- Item 14 — queries parametrizadas / injeção NoSQL (a defesa real está aqui)
