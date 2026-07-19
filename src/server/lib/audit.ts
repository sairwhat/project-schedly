type AuditAction =
  | "user.login"
  | "user.register"
  | "user.logout"
  | "user.delete"
  | "user.admin_toggle"
  | "schedule.create"
  | "schedule.delete"
  | "upload.create"
  | "feedback.submit"
  | "admin.action";

export function auditLog(action: AuditAction, metadata?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      type: "audit",
      action,
      timestamp: new Date().toISOString(),
      ...metadata,
    })
  );
}
