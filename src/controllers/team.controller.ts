import { Request, Response } from 'express';
import { TeamService, TeamError, Actor } from '../services/team.service.js';
import { validateInviteMember, validateChangeRole } from '../dtos/team.dto.js';
import { AuthPayload } from '../middlewares/auth.middleware.js';

function actorOf(req: Request): Actor {
  const auth = (req as Request & { auth?: AuthPayload }).auth;
  return {
    id: String(auth?.sub ?? ''),
    role: String(auth?.role ?? ''),
    tenantId: String(auth?.tenantId ?? ''),
  };
}

function mapError(error: any, res: Response) {
  if (error instanceof TeamError) {
    const status = error.code === 'EMAIL_TAKEN' ? 409 : error.code === 'NOT_FOUND' ? 404 : 400;
    return res.status(status).json({ error: error.message, code: error.code });
  }
  return res.status(400).json({ error: error?.message ?? 'Erro na gestão de equipe' });
}

/** Gestão de equipe do tenant (spec 0030). */
export class TeamController {
  private service: TeamService;

  constructor(deps?: { service?: TeamService }) {
    this.service = deps?.service ?? new TeamService();
  }

  list = async (req: Request, res: Response): Promise<void> => {
    try {
      const members = await this.service.list(actorOf(req).tenantId);
      res.json(members);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };

  invite = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = validateInviteMember(req.body);
      const member = await this.service.invite(actorOf(req), data);
      res.status(201).json(member);
    } catch (error: any) {
      mapError(error, res);
    }
  };

  changeRole = async (req: Request, res: Response): Promise<void> => {
    try {
      const { role } = validateChangeRole(req.body);
      const member = await this.service.changeRole(actorOf(req), String(req.params.id), role);
      res.json(member);
    } catch (error: any) {
      mapError(error, res);
    }
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.service.remove(actorOf(req), String(req.params.id));
      res.json(result);
    } catch (error: any) {
      mapError(error, res);
    }
  };
}
