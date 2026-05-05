const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    // [SEGURANÇA] Log Seguro — mostra apenas o host, nunca a URI completa com credenciais
    console.log(`[DB] MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    // [SEGURANÇA] Log Seguro — nunca imprimir a URI (contém senha)
    console.error('[DB] Falha na conexão com MongoDB. Verifique MONGO_URI no .env');
    process.exit(1);
  }
};

module.exports = connectDB;
