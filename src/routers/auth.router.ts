import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { jwtAuth } from '../middlewares/auth.middleware.js';

const authRouter = Router();
const controller = new AuthController();

// Públicos: signup cria conta+usuário; login emite o JWT usado nas rotas internas.
authRouter.post('/register', controller.register);
authRouter.post('/login', controller.login);
// Perfil do usuário logado (spec 0030) — exige JWT.
authRouter.get('/me', jwtAuth, controller.me);

export { authRouter };
