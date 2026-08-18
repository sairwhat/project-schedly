import { db } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma/client";

export interface CreateAuditLogData {
  action: string;
  userId?: string | null;
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export interface AuditLogQuery {
  action?: string;
  userId?: string;
  limit: number;
  cursor?: string;
}

export const auditRepository = {
  create(data: CreateAuditLogData) {
    return db.auditLog.create({ data });
  },

  findMany({ action, userId, limit, cursor }: AuditLogQuery) {
    return db.auditLog.findMany({
      where: {
        ...(action ? { action } : {}),
        ...(userId ? { userId } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            username: true,
            isAdmin: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
    });
  },

  distinctActions() {
    return db.auditLog.findMany({
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
    });
  },
};