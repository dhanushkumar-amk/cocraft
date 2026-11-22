import { prisma } from "@/lib/prisma";

// Serializes requests for one wallet, including retries with the same message ID.
export async function spendToken(ownerId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "ownerId" FROM "TokenWallet" WHERE "ownerId" = ${ownerId} FOR UPDATE`;
    const existing = await tx.tokenSpend.findUnique({ where: { id } });
    if (existing) return existing.ownerId === ownerId;
    const updated = await tx.tokenWallet.updateMany({
      where: { ownerId, balance: { gt: 0 } },
      data: { balance: { decrement: 1 } },
    });
    if (!updated.count) return false;
    await tx.tokenSpend.create({ data: { id, ownerId } });
    return true;
  });
}

export async function refundToken(ownerId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const removed = await tx.tokenSpend.deleteMany({ where: { id, ownerId } });
    if (removed.count) await tx.tokenWallet.update({ where: { ownerId }, data: { balance: { increment: 1 } } });
  });
}
