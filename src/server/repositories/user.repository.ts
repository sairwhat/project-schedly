import { db } from "@/server/db/client";

export const userRepository = {
  findById(id: string) {
    return db.user.findUnique({ where: { id } });
  },

  findByIdWithSessions(id: string) {
    return db.user.findUnique({
      where: { id },
      include: { sessions: true },
    });
  },

  findByIdWithSchedules(id: string) {
    return db.user.findUnique({
      where: { id },
      include: { schedules: { include: { classes: true } } },
    });
  },

  countUsers() {
    return db.user.count();
  },

  findAllUsers() {
    return db.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        username: true,
        isAdmin: true,
        emailVerified: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  },

  updateAvatar(id: string, avatarUrl: string) {
    return db.user.update({ where: { id }, data: { avatarUrl } });
  },

  toggleAdmin(id: string, isAdmin: boolean) {
    return db.user.update({
      where: { id },
      data: { isAdmin },
      select: { id: true, isAdmin: true },
    });
  },

  countByDateRange(start: Date, end: Date) {
    return db.user.count({
      where: { createdAt: { gte: start, lte: end } },
    });
  },
};
