import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { storage } from "../storage";

const JWT_SECRET = process.env.JWT_SECRET || "dental-clinic-secret-key";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    clinicId: string;
  };
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  console.log("=== AUTH DEBUG ===");
  console.log("authHeader:", authHeader);
  console.log("extracted token:", token ? `${token.substring(0, 10)}...` : "NO TOKEN");

  if (!token) {
    console.log("ERROR: No token provided");
    return res.status(401).json({ message: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    console.log("Token decoded successfully, userId:", decoded.userId);
    
    const user = await storage.getUserById(decoded.userId);
    console.log("User found:", user ? { id: user.id, email: user.email, role: user.role, isActive: user.isActive } : "NO USER");
    
    if (!user || !user.isActive) {
      console.log("ERROR: Invalid or inactive user");
      return res.status(401).json({ message: "Invalid or inactive user" });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      clinicId: user.clinicId,
    };

    console.log("Auth successful for user:", req.user.email);
    next();
  } catch (error) {
    console.log("ERROR: Token verification failed:", error);
    return res.status(403).json({ message: "Invalid token" });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    next();
  };
};

export const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "24h" });
};
