"use client";

import { useEffect, useState } from "react";
import { getAdminStats, getUsers, toggleAdminRole } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AdminUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  isAdmin: boolean;
  emailVerified: boolean;
  createdAt: Date;
};

export default function AdminPage() {
  const [stats, setStats] = useState<{
    users: number;
    schedules: number;
    uploads: number;
    feedback: number;
  } | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [s, u] = await Promise.all([getAdminStats(), getUsers()]);
        setStats(s);
        setUsers(u as AdminUser[]);
      } catch {
        window.location.href = "/login";
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleToggle(userId: string) {
    setTogglingId(userId);
    try {
      const updated = await toggleAdminRole(userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isAdmin: updated.isAdmin } : u))
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update role");
    }
    setTogglingId(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Admin Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage users and monitor your platform.
        </p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Users" value={stats.users} />
          <StatCard label="Schedules" value={stats.schedules} />
          <StatCard label="Uploads" value={stats.uploads} />
          <StatCard label="Feedback" value={stats.feedback} />
        </div>
      )}

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 pr-4">Name</th>
                  <th className="pb-3 pr-4">Email</th>
                  <th className="hidden pb-3 pr-4 sm:table-cell">Username</th>
                  <th className="hidden pb-3 pr-4 md:table-cell">Joined</th>
                  <th className="pb-3 pr-4">Role</th>
                  <th className="pb-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {users.map((user) => (
                  <tr key={user.id} className="transition-colors hover:bg-muted/30">
                    <td className="py-3 pr-4 font-medium text-foreground">
                      {user.firstName} {user.lastName}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{user.email}</td>
                    <td className="hidden py-3 pr-4 text-muted-foreground sm:table-cell">
                      @{user.username}
                    </td>
                    <td className="hidden py-3 pr-4 text-muted-foreground md:table-cell">
                      {new Date(user.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.isAdmin
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {user.isAdmin ? "Admin" : "User"}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        disabled={togglingId === user.id}
                        onClick={() => handleToggle(user.id)}
                      >
                        {togglingId === user.id
                          ? "Updating..."
                          : user.isAdmin
                            ? "Remove Admin"
                            : "Make Admin"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="border-border/50">
      <CardContent className="pt-5 pb-4 text-center">
        <p className="text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
        <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
