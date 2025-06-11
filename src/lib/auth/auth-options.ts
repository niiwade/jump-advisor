import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import HubspotProvider from "./hubspot-provider";
import { prisma } from "../db/prisma";

// Log environment variables for debugging (redacted for security)
console.log("NEXTAUTH_URL:", process.env.NEXTAUTH_URL);
console.log("GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID ? "[Set]" : "[Not Set]");
console.log("GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET ? "[Set]" : "[Not Set]");

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    signOut: "/login",
    error: "/login",
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      authorization: {
        params: {
          scope: "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar",
          prompt: "consent",
          access_type: "offline",
        },
      },
      allowDangerousEmailAccountLinking: true, // Allow linking accounts with the same email

      httpOptions: {
        timeout: 10000, // Increase timeout to 10 seconds
      },
    }),
    HubspotProvider({
      clientId: process.env.HUBSPOT_CLIENT_ID as string,
      clientSecret: process.env.HUBSPOT_CLIENT_SECRET as string,
      callbackUrl: process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/api/auth/callback/hubspot` : "http://localhost:3000/api/auth/callback/hubspot",
    }),
  ],
  callbacks: {
    async signIn({ account }) {
      // Handle the refresh_token_expires_in field if present in Google OAuth response
      if (account && 'refresh_token_expires_in' in account) {
        // Remove the field that's not in the Prisma schema to prevent adapter errors
        delete (account as Record<string, unknown>).refresh_token_expires_in;
      }
      return true;
    },
    
    async redirect({ url, baseUrl }) {
      // Always redirect to dashboard after sign in
      
      // If this is a sign-in callback or the root URL, redirect to dashboard
      if (url.includes('/api/auth/callback/') || url === baseUrl || url === `${baseUrl}/`) {
        return `${baseUrl}/dashboard`;
      }
      
      // For other URLs that start with the base URL, keep them as is
      if (url.startsWith(baseUrl)) {
        return url;
      }
      
      // Handle absolute URLs
      return url.startsWith('http') ? url : baseUrl;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.name = token.name;
        session.user.email = token.email;
        session.user.image = token.picture as string;
      }
      return session;
    },
    async jwt({ token, user }) {
      const dbUser = await prisma.user.findFirst({
        where: {
          email: token.email as string,
        },
      });

      if (!dbUser) {
        if (user) {
          token.id = user.id;
        }
        return token;
      }

      return {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        picture: dbUser.image,
      };
    },
  },
};
