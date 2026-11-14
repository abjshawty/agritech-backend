import { Client } from "pg";

// Creates the database named in DATABASE_URL if it does not exist yet.
// Connects to the default `postgres` maintenance database to do so.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not defined.");
}

const target = new URL(url);
const name = decodeURIComponent(target.pathname.slice(1));
if (!name) {
  throw new Error("DATABASE_URL does not specify a database name.");
}

const admin = new URL(url);
admin.pathname = "/postgres";

const client = new Client({ connectionString: admin.toString() });
await client.connect();
try {
  const { rowCount } = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [name],
  );
  if (rowCount === 0) {
    await client.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
    console.log(`Created database "${name}".`);
  }
} finally {
  await client.end();
}
