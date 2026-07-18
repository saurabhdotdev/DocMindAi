import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { UserRole, SubscriptionPlan } from '@prisma/client';
import { UserPayload } from '../middleware/auth.middleware';

const JWT_SECRET = process.env.JWT_SECRET || 'docmind_jwt_secret_token_dev_only_change_in_prod';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'docmind_jwt_refresh_token_dev_only_change_in_prod';
const ACCESS_EXPIRATION = process.env.JWT_ACCESS_EXPIRATION || '15m';
const REFRESH_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION || '7d';

export class AuthService {
  // Generate Access and Refresh tokens
  private static generateTokenPair(userPayload: UserPayload) {
    const accessToken = jwt.sign(userPayload, JWT_SECRET, {
      expiresIn: ACCESS_EXPIRATION,
    } as jwt.SignOptions);

    const refreshToken = jwt.sign({ id: userPayload.id }, JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_EXPIRATION,
    } as jwt.SignOptions);

    return { accessToken, refreshToken };
  }

  // Create a new user with standard subscription
  static async signup(data: any) {
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new AppError('User with this email already exists', 409);
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    // Create user and initial FREE subscription in transaction
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          role: UserRole.USER,
        },
      });

      await tx.subscription.create({
        data: {
          userId: newUser.id,
          plan: SubscriptionPlan.FREE,
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 Days free tier
        },
      });

      return newUser;
    });

    // Create email verification token
    const verificationToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '24h' });
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        token: verificationToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Note: In real production, trigger an email service here.
    // For now we mock-return the verification token link for testing.
    return {
      id: user.id,
      email: user.email,
      verificationToken,
    };
  }

  // Login a user
  static async login(data: any) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user || !user.passwordHash) {
      throw new AppError('Invalid email or password', 401);
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    const userPayload: UserPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const { accessToken, refreshToken } = this.generateTokenPair(userPayload);

    // Persist refresh token in db
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
      accessToken,
      refreshToken,
    };
  }

  // Refresh access token and rotate refresh tokens
  static async refresh(token: string) {
    let payload: any;
    try {
      payload = jwt.verify(token, JWT_REFRESH_SECRET);
    } catch (err) {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      throw new AppError('Refresh token has expired or been revoked', 401);
    }

    // Invalidate the old refresh token (Token rotation strategy)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    const userPayload: UserPayload = {
      id: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
    };

    const { accessToken, refreshToken: newRefreshToken } = this.generateTokenPair(userPayload);

    // Save the new refresh token in the db
    await prisma.refreshToken.create({
      data: {
        userId: storedToken.user.id,
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  // Logout / Revoke token
  static async logout(token: string) {
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token },
    });

    if (storedToken) {
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  // Verify user's email address
  static async verifyEmail(token: string) {
    const verificationRecord = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationRecord || verificationRecord.expiresAt < new Date()) {
      throw new AppError('Verification link is invalid or expired', 400);
    }

    // Mark user email verified and remove token
    await prisma.$transaction([
      prisma.user.update({
        where: { id: verificationRecord.userId },
        data: { isEmailVerified: true },
      }),
      prisma.verificationToken.delete({
        where: { id: verificationRecord.id },
      }),
    ]);
  }

  // Request password reset
  static async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Avoid leaking account existence info, return mock success
      return { success: true };
    }

    // Generate unique reset token (expires in 1hr)
    const resetToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1h' });

    // Store in DB, invalidate previous ones
    await prisma.passwordReset.deleteMany({
      where: { userId: user.id },
    });

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        token: resetToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // Mock-return reset token URL for development testing
    return {
      success: true,
      resetToken,
    };
  }

  // Complete password reset
  static async resetPassword(data: any) {
    const resetRecord = await prisma.passwordReset.findUnique({
      where: { token: data.token },
    });

    if (!resetRecord || resetRecord.expiresAt < new Date()) {
      throw new AppError('Reset token is invalid or has expired', 400);
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash },
      }),
      prisma.passwordReset.delete({
        where: { id: resetRecord.id },
      }),
      // Revoke all existing refresh tokens for security
      prisma.refreshToken.updateMany({
        where: { userId: resetRecord.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}
