const mongoose = require('mongoose');

// ═══════════════════════════════════════════════════════
// 🛡️ CACHED CONNECTION — padrão para serverless (Vercel)
// ═══════════════════════════════════════════════════════
// Em serverless, cada cold start re-executa o top-level do módulo.
// Sem cache, cada request poderia abrir uma conexão nova (atingindo
// o limite do Atlas). A variável `cached` persiste entre invocações
// quentes, e a promise garante que requests concorrentes aguardem
// a mesma conexão sem criar duplicatas.

let cached = global.__mongooseConn;

if (!cached) {
  cached = global.__mongooseConn = { conn: null, promise: null };
}

const connectDB = async () => {
  // Conexão já estabelecida — reutiliza
  if (cached.conn) {
    return cached.conn;
  }

  // Primeira chamada — cria a promise de conexão
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGO_URI, {
        bufferCommands: false, // Desativa buffering — falha imediata se não conectou
      })
      .then((mongooseInstance) => {
        // [SEGURANÇA] Log Seguro — mostra apenas o host, nunca a URI completa com credenciais
        console.log(`[DB] MongoDB Connected: ${mongooseInstance.connection.host}`);
        return mongooseInstance;
      })
      .catch((error) => {
        // Limpa a promise cacheada para permitir retry no próximo cold start
        cached.promise = null;
        // [SEGURANÇA] Log Seguro — nunca imprimir a URI (contém senha)
        console.error('[DB] Falha na conexão com MongoDB. Verifique MONGO_URI no .env');
        throw error;
      });
  }

  // Aguarda a conexão completar (primeira chamada) ou retorna imediatamente (cache hit)
  cached.conn = await cached.promise;
  return cached.conn;
};

module.exports = connectDB;
