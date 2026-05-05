const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const User = require('../models/User');
const nodemailer = require('nodemailer');

// ═══════════════════════════════════════════════════════
// 🛡️ PROTOCOLO DE SEGURANÇA ENTERPRISE — CAMADA 2 (IAM)
// ═══════════════════════════════════════════════════════

// Helpers de Sanitização de Input (Protocolo Enterprise - Camada 3)
function sanitizeString(str, maxLength = 200) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLength);
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password.length <= 128;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const username = sanitizeString(req.body.username, 50);
  const email = sanitizeString(req.body.email, 254).toLowerCase();
  const password = req.body.password;

  // [SEGURANÇA] Validação rigorosa de inputs
  if (!username || username.length < 3) {
    return res.status(400).json({ msg: 'Username deve ter no mínimo 3 caracteres.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ msg: 'Formato de e-mail inválido.' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ msg: 'Senha deve ter entre 6 e 128 caracteres.' });
  }

  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: 'User already exists' });
    }

    user = new User({ username, email, password });
    
    const salt = await bcrypt.genSalt(12); // [SEGURANÇA] Salt rounds aumentado para 12
    user.password = await bcrypt.hash(password, salt);
    
    await user.save();
    
    const payload = { user: { id: user.id } };

    // [SEGURANÇA] JWT expira em 15 minutos (não mais 1 dia)
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { id: user.id, username: user.username, email: user.email }});
    });
  } catch (err) {
    // [SEGURANÇA] Log Seguro — nunca expor detalhes internos ao cliente
    console.error('[AUTH] Erro no registro:', err.code || 'UNKNOWN');
    res.status(500).json({ msg: 'Erro interno do servidor.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const email = sanitizeString(req.body.email, 254).toLowerCase();
  const password = req.body.password;

  // [SEGURANÇA] Validação de inputs
  if (!isValidEmail(email)) {
    return res.status(400).json({ msg: 'Formato de e-mail inválido.' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ msg: 'Credenciais inválidas.' });
  }

  try {
    let user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: 'Invalid Credentials' });
    }

    const payload = { user: { id: user.id } };

    // [SEGURANÇA] JWT expira em 15 minutos
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' }, (err, token) => {
      if (err) throw err;
      res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    });
  } catch (err) {
    console.error('[AUTH] Erro no login:', err.code || 'UNKNOWN');
    res.status(500).json({ msg: 'Erro interno do servidor.' });
  }
});

// GET /api/auth/user
router.get('/user', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error('[AUTH] Erro ao buscar usuário:', err.code || 'UNKNOWN');
    res.status(500).json({ msg: 'Erro interno do servidor.' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const email = sanitizeString(req.body.email, 254).toLowerCase();

  if (!isValidEmail(email)) {
    return res.status(400).json({ msg: 'Formato de e-mail inválido.' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      // [SEGURANÇA] Resposta genérica para não revelar se o e-mail existe
      return res.json({ msg: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação.' });
    }

    // Cria um JWT descartável assinado com a senha atual (se ele trocar a senha depois, o link expira!)
    const secret = process.env.JWT_SECRET + user.password;
    const token = jwt.sign({ id: user.id }, secret, { expiresIn: '15m' });

    // O Frontend precisa estar rodando para a pessoa clicar no e-mail
    const frontendUrl = process.env.NODE_ENV === 'production' 
      ? 'https://organiza-dashboard-full.vercel.app'
      : 'http://localhost:3005';
      
    const resetLink = `${frontendUrl}/reset-password/${user.id}/${token}`;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: `"ORGANIZA Suporte" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Recuperação de Senha - ORGANIZA',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #1e5a44;">Redefinição de Senha</h2>
          <p>Você solicitou a recuperação de senha no Organiza Dashboard.</p>
          <p>Clique no botão abaixo para criar uma senha nova. O link é válido por apenas 15 minutos.</p>
          <a href="${resetLink}" style="display: inline-block; background-color: #1e5a44; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 10px;">
            Redefinir Senha
          </a>
          <p style="margin-top: 20px; font-size: 12px; color: #777;">Se você não solicitou isso, ignore este e-mail.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    // [SEGURANÇA] Resposta genérica — não confirma se o e-mail existe
    res.json({ msg: 'Se o e-mail estiver cadastrado, você receberá um link de recuperação.' });
    
  } catch (err) {
    console.error('[AUTH] Erro ao enviar e-mail de recuperação:', err.code || 'UNKNOWN');
    res.status(500).json({ msg: 'Erro no servidor ao processar sua solicitação.' });
  }
});

// POST /api/auth/reset-password/:id/:token
router.post('/reset-password/:id/:token', async (req, res) => {
  const { id, token } = req.params;
  const password = req.body.password;

  // [SEGURANÇA] Validação do novo password
  if (!isValidPassword(password)) {
    return res.status(400).json({ msg: 'Senha deve ter entre 6 e 128 caracteres.' });
  }

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ msg: 'Link inválido ou usuário não encontrado.' });

    // A assinatura do token é baseada na senha atual
    const secret = process.env.JWT_SECRET + user.password;
    
    try {
      jwt.verify(token, secret);
    } catch (err) {
      return res.status(400).json({ msg: 'Token expirado ou inválido. Solicite novamente.' });
    }

    // Encripta a senha nova
    const salt = await bcrypt.genSalt(12); // [SEGURANÇA] Salt rounds 12
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    res.json({ msg: 'Senha redefinida com sucesso! Você já pode fazer login.' });
    
  } catch (err) {
    console.error('[AUTH] Erro ao redefinir senha:', err.code || 'UNKNOWN');
    res.status(500).json({ msg: 'Erro no servidor ao redefinir a senha.' });
  }
});

module.exports = router;
