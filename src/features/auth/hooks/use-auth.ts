"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function useAuth() {
  const { data: session, isPending, refetch } = authClient.useSession();
  const router = useRouter();

  const signUp = useCallback(
    async (data: {
      email: string;
      username: string;
      firstName: string;
      lastName: string;
      password: string;
      birthdate: string;
      sex: string;
      homeAddress: string;
    }) => {
      const result = await authClient.signUp.email({
        ...data,
        name: `${data.firstName} ${data.lastName}`,
        callbackURL: "/verify-email/success",
      } as Parameters<typeof authClient.signUp.email>[0]);
      return result;
    },
    []
  );

  const signIn = useCallback(
    async (data: { email: string; password: string }) => {
      const result = await authClient.signIn.email({
        email: data.email,
        password: data.password,
        callbackURL: "/schedule",
      });
      return result;
    },
    []
  );

  const signOut = useCallback(async () => {
    await authClient.signOut();
    router.push("/login");
  }, [router]);

  return {
    user: session?.user ?? null,
    session: session ?? null,
    isLoading: isPending,
    isAuthenticated: !!session,
    refetchSession: refetch,
    signUp,
    signIn,
    signOut,
  };
}
