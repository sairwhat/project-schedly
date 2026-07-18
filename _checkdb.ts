import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  console.log("DATABASE_URL:", process.env.DATABASE_URL);
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const db = new PrismaClient({ adapter });
  try {
    const tables = await db.$queryRawUnsafe<{table_name: string}[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    console.log("Tables:", tables.map(t => t.table_name).join(", "));

    const users = await db.$queryRawUnsafe<{id: string; email: string}[]>(
      'SELECT id, email FROM "users"'
    );
    console.log("Users:", JSON.stringify(users, null, 2));
  } catch (e) {
    console.error("Error:", e);
  }
  await db.$disconnect();
}
main();
