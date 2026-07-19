import { userRepository } from "@/server/repositories/user.repository";
import { feedbackRepository } from "@/server/repositories/feedback.repository";
import { scheduleRepository } from "@/server/repositories/schedule.repository";
import { uploadRepository } from "@/server/repositories/upload.repository";

export const adminService = {
  async getStats() {
    const [users, schedules, uploads, feedback] = await Promise.all([
      userRepository.countUsers(),
      scheduleRepository.countAll(),
      uploadRepository.countAll(),
      feedbackRepository.countAll(),
    ]);

    return { users, schedules, uploads, feedback };
  },

  async getUsers() {
    return userRepository.findAllUsers();
  },

  async toggleAdmin(userId: string, callerId: string) {
    if (userId === callerId) {
      throw new Error("Cannot change your own admin status");
    }

    const target = await userRepository.findById(userId);
    if (!target) throw new Error("User not found");

    return userRepository.toggleAdmin(userId, !target.isAdmin);
  },
};
