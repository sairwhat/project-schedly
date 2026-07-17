"use client";

import { useEffect, useState } from "react";
import { getAdminStats, getUsers, toggleAdminRole } from "./actions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
      <div className="space-y-6 p-4 sm:p-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="border-border/50">
              <CardContent className="pt-5 pb-4 text-center">
                <Skeleton className="h-8 w-16 mx-auto" />
                <Skeleton className="h-3 w-12 mx-auto mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="border-border/50">
          <CardHeader>
            <Skeleton className="h-5 w-16" />
          </CardHeader>
          <CardContent>
            <div className="hidden sm:block space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                  <Skeleton className="h-7 w-20 ml-auto" />
                </div>
              ))}
            </div>
            <div className="sm:hidden space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
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
          {/* Desktop table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 pr-4">Name</th>
                  <th className="pb-3 pr-4">Email</th>
                  <th className="pb-3 pr-4">Username</th>
                  <th className="pb-3 pr-4">Joined</th>
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
                    <td className="py-3 pr-4 text-muted-foreground">@{user.username}</td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 pr-4">
                      <RoleBadge isAdmin={user.isAdmin} />
                    </td>
                    <td className="py-3 text-right">
                      <ToggleAdminButton user={user} togglingId={togglingId} onToggle={handleToggle} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {users.map((user) => (
              <div key={user.id} className="rounded-xl border border-border/40 bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground text-sm">
                    {user.firstName} {user.lastName}
                  </p>
                  <RoleBadge isAdmin={user.isAdmin} />
                </div>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                <p className="text-xs text-muted-foreground">@{user.username}</p>
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                  <ToggleAdminButton user={user} togglingId={togglingId} onToggle={handleToggle} />
                </div>
              </div>
            ))}
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

function RoleBadge({ isAdmin }: { isAdmin: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        isAdmin
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {isAdmin ? "Admin" : "User"}
    </span>
  );
}

function ToggleAdminButton({
  user,
  togglingId,
  onToggle,
}: {
  user: AdminUser;
  togglingId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      disabled={togglingId === user.id}
      onClick={() => onToggle(user.id)}
    >
      {togglingId === user.id
        ? "Updating..."
        : user.isAdmin
          ? "Remove Admin"
          : "Make Admin"}
    </Button>
  );
}
