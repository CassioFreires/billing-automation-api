import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';

const authRouter = Router();
const controller = new AuthController();

// Públicos: signup cria conta+usuário; login emite o JWT usado nas rotas internas.
authRouter.post('/register', controller.register);
authRouter.post('/login', controller.login);

export { authRouter };
