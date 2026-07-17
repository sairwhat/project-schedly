"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { authClient } from "@/lib/auth-client";
import { uploadAvatar } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type UserWithExtras = {
  firstName?: string;
  lastName?: string;
  email?: string;
  emailVerified?: boolean;
  username?: string;
  createdAt?: string;
  birthdate?: string;
  sex?: string;
  image?: string;
  avatarUrl?: string;
} & Record<string, unknown>;

export default function SettingsPage() {
  const { user, isLoading, refetchSession } = useAuth();
  const u = user as UserWithExtras | null;
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-background">
      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Account Settings
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Manage your account preferences and security.
            </p>
          </div>

          <Tabs defaultValue="overview">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="account">Account</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab u={u} refetchSession={refetchSession} />
            </TabsContent>
            <TabsContent value="account">
              <AccountTab u={u} />
            </TabsContent>
            <TabsContent value="security">
              <SecurityTab />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}

function OverviewTab({ u, refetchSession }: { u: UserWithExtras | null; refetchSession: () => void }) {
  const [viewOpen, setViewOpen] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const firstName = u?.firstName || "User";
  const lastName = u?.lastName || "";
  const displayName = lastName ? `${firstName} ${lastName}` : firstName;
  const initials = [u?.firstName?.[0], u?.lastName?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase()
    || firstName.charAt(0).toUpperCase();

  const memberSince = u?.createdAt
    ? new Date(u.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "Unknown";

  const avatarUrl = pendingUrl || (u as Record<string, unknown>)?.image as string || (u as Record<string, unknown>)?.avatarUrl as string || null;

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const preview = URL.createObjectURL(file);
    setPendingUrl(preview);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadAvatar(fd);
      if ("error" in result) {
        setUploadError(result.error);
        setPendingUrl(null);
      } else {
        setPendingUrl(result.url);
        refetchSession();
      }
    } catch {
      setUploadError("Upload failed. Try again.");
      setPendingUrl(null);
    }
    setUploading(false);
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/50">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Dialog open={viewOpen} onOpenChange={setViewOpen}>
              <DialogTrigger className="group relative shrink-0 cursor-pointer">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="h-20 w-20 rounded-full object-cover ring-2 ring-border/40 transition-shadow group-hover:ring-primary/40"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-2xl font-semibold text-primary ring-2 ring-border/40 transition-shadow group-hover:ring-primary/40">
                    {initials}
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>{displayName}</DialogTitle>
                </DialogHeader>
                <div className="flex items-center justify-center p-4">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="max-h-80 rounded-xl object-contain" />
                  ) : (
                    <div className="flex h-40 w-40 items-center justify-center rounded-full bg-primary/10 text-5xl font-semibold text-primary">
                      {initials}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <div className="flex flex-col items-center gap-2 sm:items-start">
              <h3 className="text-lg font-semibold text-foreground truncate">{displayName}</h3>
              <p className="text-sm text-muted-foreground truncate">{u?.email}</p>
              <p className="text-xs text-muted-foreground">@{u?.username}</p>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setViewOpen(true)}
                >
                  <svg className="mr-1 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <span className="flex items-center gap-1">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Uploading...
                    </span>
                  ) : (
                    <>
                      <svg className="mr-1 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                      </svg>
                      Change
                    </>
                  )}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
              {uploadError && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-1">{uploadError}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Account Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border/40">
            <span className="text-sm text-muted-foreground">Email verified</span>
            <span className={`text-sm font-medium ${u?.emailVerified ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400"}`}>
              {u?.emailVerified ? "Verified" : "Pending"}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/40">
            <span className="text-sm text-muted-foreground">Username</span>
            <span className="text-sm font-medium text-foreground">@{u?.username}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/40">
            <span className="text-sm text-muted-foreground">Birthdate</span>
            <span className="text-sm font-medium text-foreground">
              {u?.birthdate ? new Date(u.birthdate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "Not set"}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-border/40">
            <span className="text-sm text-muted-foreground">Sex</span>
            <span className="text-sm font-medium text-foreground capitalize">{u?.sex || "Not set"}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground">Member since</span>
            <span className="text-sm font-medium text-foreground">{memberSince}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AccountTab({ u }: { u: UserWithExtras | null }) {
  const [form, setForm] = useState({
    firstName: u?.firstName || "",
    lastName: u?.lastName || "",
    username: u?.username || "",
    birthdate: u?.birthdate ? new Date(u.birthdate).toISOString().split("T")[0] : "",
    sex: u?.sex || "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const result = await authClient.updateUser({
        name: form.lastName ? `${form.firstName} ${form.lastName}` : form.firstName,
        firstName: form.firstName,
        lastName: form.lastName,
        birthdate: form.birthdate ? new Date(form.birthdate) : null,
        sex: form.sex,
      } as Parameters<typeof authClient.updateUser>[0]);

      if (result.error) {
        setError(result.error.message || "Failed to update profile.");
      } else {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Personal Information</CardTitle>
        <CardDescription>Update your name and profile details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="firstName" className="text-sm font-medium">First name</Label>
            <Input
              id="firstName"
              value={form.firstName}
              onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
              className="h-10"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName" className="text-sm font-medium">Last name</Label>
            <Input
              id="lastName"
              value={form.lastName}
              onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
              className="h-10"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="username" className="text-sm font-medium">Username</Label>
          <Input
            id="username"
            value={form.username}
            disabled
            className="h-10 opacity-60"
          />
          <p className="text-xs text-muted-foreground">Username cannot be changed.</p>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">Sex</Label>
          <div className="grid grid-cols-3 gap-2">
            {["Male", "Female", "Other"].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setForm((p) => ({ ...p, sex: option.toLowerCase() }))}
                className={`h-10 rounded-lg border text-sm font-medium transition-colors ${
                  form.sex === option.toLowerCase()
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border/60 bg-card/50 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
            <Label htmlFor="birthdate" className="text-sm font-medium">Birthdate</Label>
            <Input
              id="birthdate"
              type="date"
              value={form.birthdate}
              onChange={(e) => setForm((p) => ({ ...p, birthdate: e.target.value }))}
              className="h-10"
            />
          </div>

        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center dark:border-green-800 dark:bg-green-950">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">Profile updated!</p>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <Button onClick={handleSave} disabled={loading} className="h-10 font-medium">
          {loading ? "Saving..." : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  );
}

function SecurityTab() {
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleChangePassword() {
    setError("");
    setSuccess(false);

    if (passwordForm.newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const result = await authClient.changePassword({
        newPassword: passwordForm.newPassword,
        currentPassword: passwordForm.currentPassword,
      });

      if (result.error) {
        setError(result.error.message || "Failed to change password.");
      } else {
        setSuccess(true);
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Change Password</CardTitle>
        <CardDescription>Make sure your account stays secure.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="currentPassword" className="text-sm font-medium">Current password</Label>
          <Input
            id="currentPassword"
            type="password"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
            autoComplete="current-password"
            className="h-10"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword" className="text-sm font-medium">New password</Label>
          <Input
            id="newPassword"
            type="password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
            autoComplete="new-password"
            className="h-10"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
            autoComplete="new-password"
            className="h-10"
          />
        </div>

        {success && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center dark:border-green-800 dark:bg-green-950">
            <p className="text-sm font-medium text-green-700 dark:text-green-400">Password updated!</p>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <Button onClick={handleChangePassword} disabled={loading} className="h-10 font-medium">
          {loading ? "Updating..." : "Update password"}
        </Button>
      </CardContent>
    </Card>
  );
}
