import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getCoreEnv } from "@/lib/server/env";

const INVALID_LOGIN_MESSAGE = "이메일 또는 비밀번호가 올바르지 않습니다.";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "Admin Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          throw new Error(INVALID_LOGIN_MESSAGE);
        }

        const env = getCoreEnv();
        const isEmailMatched = credentials.email === env.ADMIN_EMAIL;
        const isPasswordMatched = credentials.password === env.ADMIN_PASSWORD;

        if (!isEmailMatched || !isPasswordMatched) {
          throw new Error(INVALID_LOGIN_MESSAGE);
        }

        return {
          id: "env-admin",
          email: env.ADMIN_EMAIL,
          name: "SteelArt Admin",
          role: "admin",
        };
      },
    }),
  ],
  pages: {
    signIn: "/admin/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role ?? "admin";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = (token.role as string | undefined) ?? "admin";
      }
      return session;
    },
  },
};
