import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  const p = new PrismaClient({ adapter });
  try {
    const rows = await p.$queryRawUnsafe(`SELECT id, email, "avatar_url" FROM users LIMIT 5`);
    console.log(rows);
  } finally {
    await p.$disconnect();
  }
}

main();
