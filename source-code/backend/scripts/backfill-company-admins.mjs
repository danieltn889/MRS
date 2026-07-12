// One-off backfill: create a company_admin account for every company that has
// no owner (created_by IS NULL), using {slug}@recruitment.com + password123.
// Run once from source-code/backend: node scripts/backfill-company-admins.mjs
import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const TEMP_PASSWORD = 'password123';

const slugify = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

async function main() {
  const client = await pool.connect();
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(TEMP_PASSWORD, salt);

  try {
    const companiesRes = await client.query(
      `SELECT id, name FROM companies WHERE created_by IS NULL AND deleted_at IS NULL ORDER BY created_at`
    );

    console.log(`Found ${companiesRes.rows.length} companies with no admin.\n`);

    let created = 0;
    let skipped = 0;

    for (const company of companiesRes.rows) {
      const baseSlug = slugify(company.name) || `company-${company.id.slice(0, 8)}`;
      let email = `${baseSlug}@recruitment.com`;
      let suffix = 1;

      // Dedupe against existing emails
      // eslint-disable-next-line no-await-in-loop
      while ((await client.query('SELECT id FROM users WHERE email = $1', [email])).rows.length > 0) {
        email = `${baseSlug}-${suffix}@recruitment.com`;
        suffix += 1;
      }

      try {
        await client.query('BEGIN');

        const userRes = await client.query(
          `INSERT INTO users (email, password_hash, user_type, status)
           VALUES ($1, $2, 'company_admin', 'active')
           RETURNING id`,
          [email, passwordHash]
        );
        const userId = userRes.rows[0].id;

        await client.query(
          `INSERT INTO company_team (company_id, user_id, name, title, email, role)
           VALUES ($1, $2, $3, 'Admin', $4, 'admin')`,
          [company.id, userId, `${company.name} Admin`, email]
        );

        await client.query('UPDATE companies SET created_by = $1, updated_at = NOW() WHERE id = $2', [userId, company.id]);

        await client.query('COMMIT');
        created += 1;
        console.log(` ${company.name} -> ${email}`);
      } catch (err) {
        await client.query('ROLLBACK');
        skipped += 1;
        console.error(`✗ ${company.name} failed: ${err.message}`);
      }
    }

    console.log(`\nDone. Created ${created}, skipped ${skipped}. Password for all: ${TEMP_PASSWORD}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
