import { prisma } from "@/lib/prisma";

// Everything is scoped to an "owner": a Clerk org id for org workspaces, or a Clerk user id for
// personal ones. Clerk prefixes its ids, so they can't collide.
export const workspaceOwnerSelect = { clerkOrgId: true, creator: { select: { clerkId: true } } } as const;

export function workspaceOwnerId(workspace: { clerkOrgId: string | null; creator: { clerkId: string } }) {
  return workspace.clerkOrgId ?? workspace.creator.clerkId;
}

export async function getWorkspaceOwnerId(workspaceId: string) {
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: workspaceOwnerSelect });
  return workspaceOwnerId(workspace);
}

// A completed token purchase unlocks workspace features for this owner.
export async function getEntitlements(ownerId: string) {
  const wallet = await prisma.tokenWallet.findUnique({ where: { ownerId } });
  return {
    isPaid: (wallet?.purchased ?? 0) > 0,
    promptLimit: wallet?.purchased ?? 0,
    unlimitedWorkspaces: (wallet?.purchased ?? 0) > 0,
    publicSharing: (wallet?.purchased ?? 0) > 0,
    pdfExport: (wallet?.purchased ?? 0) > 0,
  };
}

export async function getPromptUsage(ownerId: string) {
  const wallet = await prisma.tokenWallet.findUnique({ where: { ownerId } });
  const limit = wallet?.purchased ?? 0;
  const remaining = wallet?.balance ?? 0;
  return { used: limit - remaining, limit, remaining, isPaid: limit > 0 };
}

export async function recordPrompt(ownerId: string, userId: string, workspaceId: string) {
  await prisma.agentPrompt.create({ data: { ownerId, userId, workspaceId } });
}
