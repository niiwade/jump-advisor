"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      await signIn("google", {
        callbackUrl: "/dashboard",
      });
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleHubspotLogin = async () => {
    setIsLoading(true);
    try {
      await signIn("hubspot", {
        callbackUrl: "/dashboard",
      });
    } catch (error) {
      console.error("HubSpot login failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <button
          type="button"
          className={`flex items-center justify-center rounded-md bg-[#4285F4] px-4 py-2 text-white ${
            isLoading ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onClick={handleGoogleLogin}
          disabled={isLoading}
        >
          <svg
            className="mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Sign in with Google
        </button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or connect CRM
            </span>
          </div>
        </div>

        <button
          type="button"
          className={`flex items-center justify-center rounded-md bg-[#FF7A59] px-4 py-2 text-white ${
            isLoading ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onClick={handleHubspotLogin}
          disabled={isLoading}
        >
          <svg
            className="mr-2 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            fill="currentColor"
          >
            <path d="M267.1 4.2c-15.6 5.8-25.1 19.2-25.1 35.3 0 16.8 9.4 29.6 26.1 35.7 7.5 2.7 20.1 2.7 27.5 0 16.8-6.1 26.1-18.9 26.1-35.7 0-16.1-9.5-29.5-25.1-35.3-8.1-3-21.4-3-29.5 0zM154.2 70.7c-16.6 5.8-26.2 19.3-26.2 36.8 0 17.5 9.6 31 26.2 36.8 7.7 2.7 20.4 2.7 28.1 0 16.6-5.8 26.2-19.3 26.2-36.8 0-17.5-9.6-31-26.2-36.8-7.7-2.7-20.4-2.7-28.1 0zM380.5 70.7c-16.6 5.8-26.2 19.3-26.2 36.8 0 17.5 9.6 31 26.2 36.8 7.7 2.7 20.4 2.7 28.1 0 16.6-5.8 26.2-19.3 26.2-36.8 0-17.5-9.6-31-26.2-36.8-7.7-2.7-20.4-2.7-28.1 0zM267.1 137.2c-15.6 5.8-25.1 19.2-25.1 35.3 0 16.8 9.4 29.6 26.1 35.7 7.5 2.7 20.1 2.7 27.5 0 16.8-6.1 26.1-18.9 26.1-35.7 0-16.1-9.5-29.5-25.1-35.3-8.1-3-21.4-3-29.5 0zM41.2 203.7c-16.6 5.8-26.2 19.3-26.2 36.8 0 17.5 9.6 31 26.2 36.8 7.7 2.7 20.4 2.7 28.1 0 16.6-5.8 26.2-19.3 26.2-36.8 0-17.5-9.6-31-26.2-36.8-7.7-2.7-20.4-2.7-28.1 0zM154.2 203.7c-16.6 5.8-26.2 19.3-26.2 36.8 0 17.5 9.6 31 26.2 36.8 7.7 2.7 20.4 2.7 28.1 0 16.6-5.8 26.2-19.3 26.2-36.8 0-17.5-9.6-31-26.2-36.8-7.7-2.7-20.4-2.7-28.1 0zM267.1 203.7c-15.6 5.8-25.1 19.2-25.1 35.3 0 16.8 9.4 29.6 26.1 35.7 7.5 2.7 20.1 2.7 27.5 0 16.8-6.1 26.1-18.9 26.1-35.7 0-16.1-9.5-29.5-25.1-35.3-8.1-3-21.4-3-29.5 0zM380.5 203.7c-16.6 5.8-26.2 19.3-26.2 36.8 0 17.5 9.6 31 26.2 36.8 7.7 2.7 20.4 2.7 28.1 0 16.6-5.8 26.2-19.3 26.2-36.8 0-17.5-9.6-31-26.2-36.8-7.7-2.7-20.4-2.7-28.1 0zM493.5 203.7c-16.6 5.8-26.2 19.3-26.2 36.8 0 17.5 9.6 31 26.2 36.8 7.7 2.7 20.4 2.7 28.1 0 16.6-5.8 26.2-19.3 26.2-36.8 0-17.5-9.6-31-26.2-36.8-7.7-2.7-20.4-2.7-28.1 0zM154.2 336.7c-16.6 5.8-26.2 19.3-26.2 36.8 0 17.5 9.6 31 26.2 36.8 7.7 2.7 20.4 2.7 28.1 0 16.6-5.8 26.2-19.3 26.2-36.8 0-17.5-9.6-31-26.2-36.8-7.7-2.7-20.4-2.7-28.1 0zM267.1 336.7c-15.6 5.8-25.1 19.2-25.1 35.3 0 16.8 9.4 29.6 26.1 35.7 7.5 2.7 20.1 2.7 27.5 0 16.8-6.1 26.1-18.9 26.1-35.7 0-16.1-9.5-29.5-25.1-35.3-8.1-3-21.4-3-29.5 0zM380.5 336.7c-16.6 5.8-26.2 19.3-26.2 36.8 0 17.5 9.6 31 26.2 36.8 7.7 2.7 20.4 2.7 28.1 0 16.6-5.8 26.2-19.3 26.2-36.8 0-17.5-9.6-31-26.2-36.8-7.7-2.7-20.4-2.7-28.1 0zM267.1 469.7c-15.6 5.8-25.1 19.2-25.1 35.3 0 16.8 9.4 29.6 26.1 35.7 7.5 2.7 20.1 2.7 27.5 0 16.8-6.1 26.1-18.9 26.1-35.7 0-16.1-9.5-29.5-25.1-35.3-8.1-3-21.4-3-29.5 0z" />
          </svg>
          Connect HubSpot
        </button>
      </div>
    </div>
  );
}
