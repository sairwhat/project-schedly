"use client";

export function useProfile() {
  return {
    profile: null,
    isLoading: true,
    updateProfile: async (_data: Record<string, unknown>) => {},
  };
}
