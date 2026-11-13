import { neon } from "@neondatabase/serverless";
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  return neon(process.env.DATABASE_URL);
}
export async function ensureSchema() {
  const sql = db();
  await sql`CREATE TABLE IF NOT EXISTS gifts (
    id text PRIMARY KEY,
    access_key text NOT NULL,
    sender_token text NOT NULL,
    recipient_name text NOT NULL,
    occasion text NOT NULL,
    template text NOT NULL,
    message text NOT NULL DEFAULT '',
    image_url text,
    open_at timestamptz NOT NULL,
    status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','available','claimed','expired')),
    recipient_user_id bigint,
    bot_notified_at timestamptz,
    claimed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS gifts_due_idx ON gifts(status, open_at)`;
  await sql`CREATE INDEX IF NOT EXISTS gifts_recipient_idx ON gifts(recipient_user_id, status)`;
}