import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { storage } from "../storage";
import { API_DENY_ENFORCED, featureForPath, sanitizeFeatureAccess, type FeatureAccess } from "../../shared/features";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("JWT_SECRET ou SESSION_SECRET deve estar configurado.");
  return secret;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    clinicId: string;
    fullName: string;
    featureAccess?: FeatureAccess;
  };
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ code: "TOKEN_OBRIGATORIO", message: "Token de acesso obrigatório." });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as any;
    const user = await storage.getUserById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ code: "USUARIO_INVALIDO", message: "Usuário inválido." });
    }
    if (!user.isActive) {
      return res.status(401).json({ code: "USUARIO_INATIVO", message: "Usuário inativo." });
    }
    if (decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ code: "TOKEN_REVOGADO", message: "Sessão revogada. Entre novamente." });
    }
    if (user.role !== "superadmin") {
      if (!user.clinicId) {
        return res.status(403).json({ code: "CLINICA_AUSENTE", message: "Usuário sem clínica vinculada." });
      }
      const clinic = await storage.getClinicById(user.clinicId);
      if (!clinic) {
        return res.status(403).json({ code: "CLINICA_INVALIDA", message: "Clínica não encontrada." });
      }
      if (clinic.status === "suspended") {
        return res.status(403).json({ code: "CLINICA_SUSPENSA", message: "Clínica suspensa. Contate o suporte." });
      }
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      clinicId: user.clinicId || "",
      fullName: user.fullName,
      featureAccess: sanitizeFeatureAccess(user.featureAccess),
    };

    const feature = featureForPath(req.originalUrl);
    if (feature && user.role !== "superadmin" && req.user.featureAccess?.[feature] === "deny" && API_DENY_ENFORCED.has(feature)) {
      return res.status(403).json({ code: "RECURSO_BLOQUEADO", message: "Acesso a esta funcionalidade foi bloqueado para o seu usuário." });
    }

    next();
  } catch (error) {
    return res.status(403).json({ code: "TOKEN_INVALIDO", message: "Token inválido ou expirado." });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ code: "AUTENTICACAO_OBRIGATORIA", message: "Autenticação obrigatória." });
    }

    if (!roles.includes(req.user.role)) {
      const feature = featureForPath(req.originalUrl);
      // Liberação explícita por usuário vale independentemente do perfil, exceto rotas fora do mapa de funcionalidades.
      if (feature && req.user.featureAccess?.[feature] === "allow") return next();
      return res.status(403).json({ code: "PERMISSAO_INSUFICIENTE", message: "Permissão insuficiente." });
    }

    next();
  };
};

export const generateToken = (userId: string, tokenVersion = 0): string => {
  return jwt.sign({ userId, tokenVersion }, getJwtSecret(), { expiresIn: "24h" });
};
