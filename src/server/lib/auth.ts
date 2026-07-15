import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db/client";
import { sendEmail } from "@/server/lib/email";

export const auth = betterAuth({
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  user: {
    additionalFields: {
      username: {
        type: "string",
        required: true,
        unique: true,
      },
      firstName: {
        type: "string",
        required: true,
      },
      lastName: {
        type: "string",
        required: true,
      },
      birthdate: {
        type: "date",
        required: false,
      },
      sex: {
        type: "string",
        required: false,
      },
      isAdmin: {
        type: "boolean",
        required: false,
        defaultValue: false,
      },
      avatarUrl: {
        type: "string",
        required: false,
      },
      failedAttempts: {
        type: "number",
        required: false,
        defaultValue: 0,
      },
      lockedUntil: {
        type: "date",
        required: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password) => {
        const bcrypt = await import("bcryptjs");
        return bcrypt.hash(password, 12);
      },
      verify: async ({ password, hash }) => {
        const bcrypt = await import("bcryptjs");
        return bcrypt.compare(password, hash);
      },
    },
  },
  ...(process.env.RESEND_API_KEY
    ? {
        emailVerification: {
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
          sendVerificationEmail: async ({ user, url }) => {
            try {
              await sendEmail({
                to: user.email,
                subject: "Verify your Schedly account",
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
                    <h1 style="color: #e11d48; font-size: 24px; margin-bottom: 8px;">Welcome to Schedly!</h1>
                    <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                      Thanks for signing up. Please verify your email address by clicking the button below.
                    </p>
                    <a href="${url}" style="display: inline-block; background-color: #e11d48; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 16px 0;">
                      Verify Email Address
                    </a>
                    <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
                      If the button doesn't work, copy and paste this link into your browser:<br/>
                      <a href="${url}" style="color: #e11d48;">${url}</a>
                    </p>
                    <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
                      If you didn't create an account, you can safely ignore this email.
                    </p>
                  </div>
                `,
              });
            } catch (err) {
              console.error("[Auth] Failed to send verification email:", err);
            }
          },
        },
      }
    : {}),
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/api/auth/sign-in/email": {
        window: 10,
        max: 5,
      },
      "/api/auth/sign-up/email": {
        window: 60,
        max: 3,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7,
    },
  },
  advanced: {
    cookies: {
      sessionToken: {
        name: "schedly-session",
        attributes: {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        },
      },
    },
    ipAddress: {
      ipv6Subnet: 64,
    },
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  ],
  plugins: [nextCookies()],
});
