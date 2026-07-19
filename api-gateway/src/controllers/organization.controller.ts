import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

export class OrganizationController {
  // POST /v1/organizations — create org (user becomes ADMIN member)
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const { name } = req.body;
      if (!name?.trim()) return next(new AppError('Organization name is required', 400));

      // Check user doesn't already own an org
      const existing = await prisma.organization.findFirst({ where: { ownerId: req.user.id } });
      if (existing) return next(new AppError('You already have an organization', 400));

      const org = await prisma.organization.create({
        data: {
          name: name.trim(),
          ownerId: req.user.id,
          members: {
            create: { userId: req.user.id, role: 'ADMIN' },
          },
        },
        include: { members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
      });

      return res.status(201).json({ success: true, data: org });
    } catch (error) {
      return next(error);
    }
  }

  // GET /v1/organizations/me — get my org and members
  static async getMyOrg(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));

      const membership = await prisma.organizationMember.findFirst({
        where: { userId: req.user.id },
        include: {
          organization: {
            include: {
              members: {
                include: {
                  user: { select: { id: true, firstName: true, lastName: true, email: true } },
                },
              },
              invitations: { where: { accepted: false, expiresAt: { gt: new Date() } } },
            },
          },
        },
      });

      if (!membership) return res.status(200).json({ success: true, data: null });
      return res.status(200).json({ success: true, data: membership.organization });
    } catch (error) {
      return next(error);
    }
  }

  // POST /v1/organizations/invite — send invite
  static async invite(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const { email, role } = req.body;
      if (!email?.trim()) return next(new AppError('Email is required', 400));

      // Check requester is admin of an org
      const membership = await prisma.organizationMember.findFirst({
        where: { userId: req.user.id, role: 'ADMIN' },
        include: { organization: true },
      });
      if (!membership) return next(new AppError('You must be an organization Admin to invite members', 403));

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

      const invitation = await prisma.invitation.create({
        data: {
          organizationId: membership.organizationId,
          email: email.trim().toLowerCase(),
          role: role || 'VIEWER',
          expiresAt,
        },
      });

      // Return invite link (frontend handles sending email or sharing manually)
      const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:80'}/invite/${invitation.token}`;

      return res.status(201).json({ success: true, data: { invitation, inviteUrl } });
    } catch (error) {
      return next(error);
    }
  }

  // POST /v1/organizations/accept/:token — accept invite
  static async acceptInvite(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const { token } = req.params;

      const invitation = await prisma.invitation.findUnique({ where: { token } });
      if (!invitation || invitation.accepted || invitation.expiresAt < new Date()) {
        return next(new AppError('Invitation is invalid or has expired', 400));
      }

      // Add user to org
      await prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: invitation.organizationId, userId: req.user.id } },
        create: { organizationId: invitation.organizationId, userId: req.user.id, role: invitation.role },
        update: { role: invitation.role },
      });

      // Mark invite accepted
      await prisma.invitation.update({ where: { token }, data: { accepted: true } });

      return res.status(200).json({ success: true, message: 'Successfully joined the organization' });
    } catch (error) {
      return next(error);
    }
  }

  // DELETE /v1/organizations/members/:userId — remove member
  static async removeMember(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401));
      const { userId } = req.params;

      // Must be admin
      const membership = await prisma.organizationMember.findFirst({
        where: { userId: req.user.id, role: 'ADMIN' },
      });
      if (!membership) return next(new AppError('Forbidden', 403));

      await prisma.organizationMember.deleteMany({
        where: { organizationId: membership.organizationId, userId },
      });

      return res.status(200).json({ success: true, message: 'Member removed' });
    } catch (error) {
      return next(error);
    }
  }
}
