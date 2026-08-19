"use client";

import { useState, useRef } from "react";
import { Check, Save } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { authClient } from "@/lib/auth-client";
import { uploadAvatar } from "@/app/(dashboard)/settings/actions";
import { Skeleton } from "@/components/ui/skeleton";
import { Skeleton as BoneSkeleton } from "boneyard-js/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HeaderBack } from "@/components/header-back";
import { NotificationBell } from "@/components/notification-bell";

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

export default function ProfilePage() {
  const { user, isLoading, refetchSession } = useAuth();
  const u = user as UserWithExtras | null;

  const [viewOpen, setViewOpen] = useState(false);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(u?.username || "");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [usernameError, setUsernameError] = useState("");

  async function handleSaveUsername() {
    const value = username.trim().replace(/^@/, "");
    if (!value) {
      setUsernameError("Username cannot be empty.");
      return;
    }
    setSavingUsername(true);
    setUsernameError("");
    setUsernameSaved(false);
    try {
      const result = await authClient.updateUser({
        username: value,
      } as Parameters<typeof authClient.updateUser>[0]);
      if (result.error) {
        setUsernameError(result.error.message || "Could not save username.");
      } else {
        setUsernameSaved(true);
        refetchSession();
        setTimeout(() => setUsernameSaved(false), 2000);
      }
    } catch {
      setUsernameError("Something went wrong. Try again.");
    }
    setSavingUsername(false);
  }

  const firstName = u?.firstName || "User";
  const lastName = u?.lastName || "";
  const displayName = lastName ? `${firstName} ${lastName}` : firstName;
  const initials = firstName.charAt(0).toUpperCase();

  const memberSince = u?.createdAt
    ? new Date(u.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "Unknown";

  const [imgError, setImgError] = useState(false);
  const rawAvatar = pendingUrl || u?.image || u?.avatarUrl || null;
  // Ensure avatar URL is absolute for Capacitor/PWA origins.
  const resolvedAvatar =
    rawAvatar && !rawAvatar.startsWith("data:") && !rawAvatar.startsWith("http") && rawAvatar.startsWith("/")
      ? `${typeof window !== "undefined" ? window.location.origin : ""}${rawAvatar}`
      : rawAvatar;
  const avatarUrl = imgError ? null : resolvedAvatar;

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    // Reset the broken-image flag for the newly picked photo.
    setImgError(false);
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
    <div className="mx-auto max-w-2xl pt-8 md:pt-0">
      <BoneSkeleton
        name="profile-page"
        loading={isLoading}
        fallback={
          <>
            <div className="flex flex-col items-center gap-4">
              <Skeleton className="h-20 w-20 rounded-full" />
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Card className="mt-6 border-border/50">
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border/40">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        }
      >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:mb-8">
        <div className="flex items-start gap-3">
          <HeaderBack to="/dashboard" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Profile
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Your account details at a glance.
            </p>
          </div>
        </div>
        <NotificationBell variant="inline" className="hidden md:flex" />
      </div>

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
                      onError={() => setImgError(true)}
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
                      <img src={avatarUrl} alt={displayName} onError={() => setImgError(true)} className="max-h-[70vh] max-w-full rounded-xl object-contain" />
                    ) : (
                      <div className="flex h-40 w-40 items-center justify-center rounded-full bg-primary/10 text-5xl font-semibold text-primary">
                        {initials}
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              <div className="flex min-w-0 flex-1 flex-col items-center gap-2 sm:items-start">
                <h3 className="w-full truncate text-center text-lg font-semibold text-foreground sm:text-left">{displayName}</h3>
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
                        <Spinner size={14} color="var(--primary)" />
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
            <div className="flex items-center justify-between gap-3 py-2 border-b border-border/40">
              <span className="shrink-0 text-sm text-muted-foreground">Email</span>
              <span className="truncate text-sm font-medium text-foreground">{u?.email}</span>
            </div>
            <div className="py-2 border-b border-border/40">
              <div className="flex items-center justify-between gap-3">
                <span className="shrink-0 text-sm text-muted-foreground">Username</span>
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="flex min-w-0 items-center gap-0.5 rounded-lg border border-border/60 bg-card/50 px-2 focus-within:border-primary/50">
                    <span className="text-sm text-muted-foreground">@</span>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      maxLength={24}
                      aria-label="Username"
                      className="w-28 min-w-0 bg-transparent py-1.5 text-sm font-medium text-foreground outline-none sm:w-36"
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                    onClick={handleSaveUsername}
                    disabled={savingUsername}
                    aria-label="Save username"
                  >
                    {savingUsername ? (
                      <Spinner size={16} color="var(--foreground)" />
                    ) : usernameSaved ? (
                      <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              {usernameError && (
                <p className="mt-1 text-right text-xs text-destructive">{usernameError}</p>
              )}
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">Member since</span>
              <span className="text-sm font-medium text-foreground">{memberSince}</span>
            </div>
          </CardContent>
        </Card>
      </div>
      </BoneSkeleton>
    </div>
  );
}
