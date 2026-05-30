import express from 'express';
import cors from 'cors';
import { appRouter } from './index.js';
import prisma from './src/database/prisma.js';

const app = express();

// Configurações de segurança e requisição
app.use(cors({
  origin: process.env.FRONTEND_URL || '*', // Em produção, restrinja para a URL do seu painel React
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

/**
 * Injeção de todas as rotas da aplicação sob o prefixo global '/api'
 * O endpoint completo para disparo da automação ficará:
 * POST http://localhost:3333/api/notifications/trigger
 */
app.use('/api', appRouter);

// Tratamento global de erros para evitar que a sua API caia na VPS por exceções não tratadas
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Erro interno detectado:', err.message);
  res.status(500).json({ error: 'Ocorreu um erro interno no servidor de automação.' });
});

const PORT = process.env.PORT || 3333;

async function bootstrap() {

  try {

    console.log('🔄 Conectando ao banco...');

    await prisma.$connect();

    console.log('✅ Banco conectado com sucesso');

    app.listen(PORT, () => {
      console.log(`🚀 API rodando na porta ${PORT}`);
    });

  } catch (error) {

    console.error('❌ Falha ao conectar no banco');

    console.error(error);

    process.exit(1);
  }

}

bootstrap();