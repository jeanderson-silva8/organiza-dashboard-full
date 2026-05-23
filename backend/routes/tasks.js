const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/auth');
const Task = require('../models/Task');

// ═══════════════════════════════════════════════════════
// 🛡️ PROTOCOLO DE SEGURANÇA — ROTAS PROTEGIDAS
// ═══════════════════════════════════════════════════════

// Helpers de Sanitização
function sanitizeString(str, maxLength = 500) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
}

// [SEGURANÇA] Fonte única de verdade dos enums — DEVE bater com models/Task.js.
// Frontend, model e rota usam o mesmo vocabulário (pt-BR). Auditoria 2026-05-22.
const VALID_STATUSES = ['Pendente', 'Em Progresso', 'Concluída'];
const VALID_PRIORITIES = ['Baixa', 'Média', 'Alta'];
const DEFAULT_STATUS = 'Pendente';
const DEFAULT_PRIORITY = 'Média';

// GET /api/tasks
router.get('/', auth, async (req, res) => {
  try {
    const tasks = await Task.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    console.error('[TASKS] Erro ao listar:', err.code || 'UNKNOWN');
    res.status(500).json({ msg: 'Erro interno do servidor.' });
  }
});

// POST /api/tasks
router.post('/', auth, async (req, res) => {
  // [SEGURANÇA] Sanitização de todos os inputs
  const title = sanitizeString(req.body.title, 200);
  const description = sanitizeString(req.body.description, 2000);
  const status = VALID_STATUSES.includes(req.body.status) ? req.body.status : DEFAULT_STATUS;
  const priority = VALID_PRIORITIES.includes(req.body.priority) ? req.body.priority : DEFAULT_PRIORITY;
  const dueDate = req.body.dueDate;

  if (!title || title.length < 1) {
    return res.status(400).json({ msg: 'Título é obrigatório.' });
  }

  try {
    const newTask = new Task({
      title,
      description,
      status,
      priority,
      dueDate,
      user: req.user.id
    });
    const task = await newTask.save();
    res.json(task);
  } catch (err) {
    console.error('[TASKS] Erro ao criar:', err.message || err.code || 'UNKNOWN');
    res.status(500).json({ msg: 'Erro interno do servidor.' });
  }
});

// PUT /api/tasks/:id
router.put('/:id', auth, async (req, res) => {
  try {
    // [SEGURANÇA] Valida formato do ID antes de consultar (evita CastError → 500)
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ msg: 'ID de tarefa inválido.' });
    }
    let task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ msg: 'Task not found' });
    
    // Ensure task belongs to user
    if (task.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    // [SEGURANÇA] Sanitização dos campos de update
    const fields = {};
    if (req.body.title) fields.title = sanitizeString(req.body.title, 200);
    if (req.body.description !== undefined) fields.description = sanitizeString(req.body.description, 2000);
    if (req.body.status && VALID_STATUSES.includes(req.body.status)) fields.status = req.body.status;
    if (req.body.priority && VALID_PRIORITIES.includes(req.body.priority)) fields.priority = req.body.priority;
    if (req.body.dueDate) fields.dueDate = req.body.dueDate;

    // [SEGURANÇA] runValidators garante que o update respeite os enums do schema
    task = await Task.findByIdAndUpdate(
      req.params.id,
      { $set: fields },
      { returnDocument: 'after', runValidators: true }
    );
    res.json(task);
  } catch (err) {
    console.error('[TASKS] Erro ao atualizar:', err.code || 'UNKNOWN');
    res.status(500).json({ msg: 'Erro interno do servidor.' });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    // [SEGURANÇA] Valida formato do ID antes de consultar (evita CastError → 500)
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ msg: 'ID de tarefa inválido.' });
    }
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ msg: 'Task not found' });

    // Ensure task belongs to user
    if (task.user.toString() !== req.user.id) {
      return res.status(401).json({ msg: 'Not authorized' });
    }

    await Task.findByIdAndDelete(req.params.id);
    res.json({ msg: 'Task removed' });
  } catch (err) {
    console.error('[TASKS] Erro ao deletar:', err.code || 'UNKNOWN');
    res.status(500).json({ msg: 'Erro interno do servidor.' });
  }
});

module.exports = router;
