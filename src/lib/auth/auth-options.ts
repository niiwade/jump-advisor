import { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/prisma";
import GoogleProvider from "next-auth/providers/google";
import HubSpot from "next-auth/providers/hubspot";

function getRequiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

function assertEnv(key: string): string {
  return getRequiredEnv(key);
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    }
  }
}

// Log environment variables for debugging (redacted for security)
console.log("NEXTAUTH_URL:", process.env.NEXTAUTH_URL);
console.log("GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID ? "[Set]" : "[Not Set]");
console.log("GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET ? "[Set]" : "[Not Set]");

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: getRequiredEnv("GOOGLE_CLIENT_ID"),
      clientSecret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly',
          prompt: "consent",
          access_type: "offline",
        }
      }
    }),
    HubSpot({
      clientId: assertEnv("HUBSPOT_CLIENT_ID"),
      clientSecret: assertEnv("HUBSPOT_CLIENT_SECRET"),
      authorization: {
        params: { scope: "oauth contacts" }
      }
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
      }
      return session
    },
    async signIn({ account }) {
      // Handle the unsupported refresh_token_expires_in field from Google OAuth
      // Define a type for the Google account that includes the unsupported field
      interface GoogleOAuthAccount {
        provider: string;
        refresh_token_expires_in?: number;
      }
      
      if (account && account.provider === 'google' && (account as GoogleOAuthAccount).refresh_token_expires_in) {
        // Remove or convert the field to avoid errors
        delete (account as GoogleOAuthAccount).refresh_token_expires_in;
      }
      return true;
    },
    async redirect({ url, baseUrl }) {
      // Redirect to dashboard after successful login
      if (url.startsWith(baseUrl)) {
        if (url.includes('callbackUrl')) {
          return url;
        }
        return `${baseUrl}/dashboard`;
      }
      // Redirect to dashboard if on same host
      else if (url.startsWith('/')) {
        return `${baseUrl}/dashboard`;
      }
      return baseUrl;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
};
