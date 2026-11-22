"use server";

import { currentUser } from "@clerk/nextjs/server";
import { grantWelcomeTokens } from "@/lib/tokens";
import { prisma } from "@/lib/prisma";

// Looks up the local User row by clerkId, creating it on first sight.
// Plans and subscriptions live in Clerk, not here.
export async function checkUser() {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const existing = await prisma.user.findUnique({
    where: { clerkId: clerkUser.id },
  });

  if (existing) {
    await grantWelcomeTokens(clerkUser.id);
    return existing;
  }

  const email = clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) return null;

  const user = await prisma.user.upsert({
    where: { clerkId: clerkUser.id },
    update: {},
    create: {
      clerkId: clerkUser.id,
      email,
      name: `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim() || null,
      imageUrl: clerkUser.imageUrl,
    },
  });
  await grantWelcomeTokens(clerkUser.id);
  return user;
}
