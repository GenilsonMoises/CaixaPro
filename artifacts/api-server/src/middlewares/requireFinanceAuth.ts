import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

export const requireFinanceAuth: RequestHandler = (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Inicie sessão para aceder ao seu livro." });
    return;
  }

  req.userId = userId;
  next();
};
