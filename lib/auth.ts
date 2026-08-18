import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/utils";

// Bcrypt hash used as a compare target when a login email doesn't match any
// user, so response time is constant (defeats email-enumeration timing attack).
// Generated once at module load; cost=12 matches real user hashes.
const DUMMY_HASH = bcrypt.hashSync("__no_such_user__", 12);

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: normalizeEmail(credentials.email) },
        });
        // Always run bcrypt.compare even when the user isn't found, so response
        // time can't be used to enumerate valid emails. Compare against a fixed
        // dummy hash of "invalid" to spend the same ~150ms of CPU.
        const hash = user?.passwordHash ?? DUMMY_HASH;
        const ok = await bcrypt.compare(credentials.password, hash);
        if (!user || !ok) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
};
