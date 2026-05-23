const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  // Get token from header
  const authHeader = req.header('Authorization');
  if (!authHeader) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ msg: 'Token format is incorrect' });
  }

  try {
    // [SEGURANÇA] Algoritmo fixado — impede ataque de confusão de algoritmo (alg: none / RS↔HS)
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!decoded.user || !decoded.user.id) {
      return res.status(401).json({ msg: 'Token is not valid' });
    }
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
