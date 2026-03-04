import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type AuthedRequest = Request & {
  auth?: { userId: string; role: "student" | "admin" | "faculty" };
};

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.header("Authorization") || "";
  const [, token] = header.split(" ");
  if (!token) return res.status(401).json({ message: "Missing Authorization token" });

  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ message: "JWT_SECRET is not set" });

  try {
    const payload = jwt.verify(token, secret) as any;
    const userId = payload?.sub;
    const role = payload?.role;
    if (!userId || !role) return res.status(401).json({ message: "Invalid token" });
    req.auth = { userId, role };
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

export function requireRole(role: "student" | "admin" | "faculty") {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) return res.status(401).json({ message: "Unauthorized" });
    if (req.auth.role !== role) return res.status(403).json({ message: "Forbidden" });
    return next();
  };
}

