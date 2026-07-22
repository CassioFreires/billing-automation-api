import { Router } from 'express';
import { TeamController } from '../controllers/team.controller.js';
import { jwtAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/require-role.middleware.js';

const teamRouter = Router();

// Gestão de equipe exige JWT e papel de gestão (OWNER ou ADMIN) — spec 0030.
teamRouter.use(jwtAuth);
teamRouter.use(requireRole('OWNER', 'ADMIN'));

const controller = new TeamController();

teamRouter.get('/', controller.list);
teamRouter.post('/', controller.invite);
teamRouter.patch('/:id/role', controller.changeRole);
teamRouter.delete('/:id', controller.remove);

export { teamRouter };
