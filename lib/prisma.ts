import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = global as unknown as { prisma?: PrismaClient; prismaSchema?: string };
const cached = globalForPrisma.prisma;
const schema = JSON.stringify(Prisma.TokenWalletScalarFieldEnum);

// Hot reload can retain a client generated before the wallet models existed.
const currentClient = cached && globalForPrisma.prismaSchema === schema
  ? cached
  : undefined;
if (cached && !currentClient) {
  void cached.$disconnect().catch(() => {});
}

export const prisma = currentClient ?? new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchema = schema;
}
