import { prisma } from "@/lib/prisma";

export async function grantWelcomeTokens(ownerId: string) {
  if (!ownerId.startsWith("user_")) return;
  // The conditional upsert grants once, including concurrent first visits.
  await prisma.$executeRaw`
    INSERT INTO "TokenWallet" ("ownerId", "balance", "purchased", "granted")
    VALUES (${ownerId}, 20, 0, 20)
    ON CONFLICT ("ownerId") DO UPDATE SET
      "balance" = "TokenWallet"."balance" + 20, "granted" = 20
    WHERE "TokenWallet"."granted" = 0
  `;
}

// Serializes requests for one wallet, including retries with the same message ID.
export async function spendToken(ownerId: string, id: string) {
  await grantWelcomeTokens(ownerId);
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
