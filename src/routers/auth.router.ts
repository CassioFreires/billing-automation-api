import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';

const authRouter = Router();
const controller = new AuthController();

// Público: emite o JWT usado nas rotas internas.
authRouter.post('/login', controller.login);

export { authRouter };
