import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { AppError } from './errorHandler';
import { z } from 'zod';

export interface UserPayload {
  id: string;
  email: string;
  role: UserRole;
}

// Extend Request interface to include the logged-in user info
declare global {
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

// Generic Request validation middleware using Zod
export const validate = (schema: z.AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      req.body = parsed.body;
      req.query = parsed.query;
      req.params = parsed.params;
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

// Authenticate JWT tokens in standard request headers
export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication token is required', 401));
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET || 'docmind_jwt_secret_token_dev_only_change_in_prod';
    const decoded = jwt.verify(token, secret) as UserPayload;
    req.user = decoded;
    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Access token has expired', 401));
    }
    return next(new AppError('Invalid or malformed authentication token', 401));
  }
};

// Restrict access by user role
export const requireRole = (roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Authentication is required to perform this action', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }

    return next();
  };
};
