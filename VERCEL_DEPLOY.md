# Vercel Deploy Guide (Backend)

Isolated from AWS production. Use a **separate Neon Postgres** — never the live AWS RDS `DATABASE_URL`.

## 1. Neon database

1. Create a project at [https://neon.tech](https://neon.tech).
2. Create a database (free tier is fine).
3. Copy the **pooled** connection string (PgBouncer / “pooled”).
4. Optionally copy the **direct** (non-pooled) URL for migrations.

### Apply schema (local, against Neon only)

```bash
# Temporary: point ONLY at Neon (do not use AWS RDS)
export DATABASE_URL="postgresql://USER:PASS@HOST/DB?sslmode=require"
# If using pooled URL for the app, use direct URL for db push:
# export DATABASE_URL="<neon-direct-url>"

npx prisma db push
# optional: npm run seed:questions
```

Unset or restore your local `.env` afterward so it does not keep pointing at Neon if you develop against AWS.

### Vercel env

| Name | Value |
|------|--------|
| `DATABASE_URL` | Neon **pooled** URL only (never AWS RDS) |

Optional if you add `directUrl` later: `DIRECT_URL` = Neon direct URL.

## 2. Vercel project

1. Import GitHub repo `AllianceSoftSolution/vercel-construction-be`.
2. Framework: Other / Node (uses `vercel.json`).
3. Set all env vars below → Deploy.

## 3. Backend env checklist (Vercel dashboard)

| Name | Notes |
|------|--------|
| `DATABASE_URL` | Neon pooled Postgres — **not** AWS RDS |
| `JWT_SECRET` | New or shared secret (min 32 chars) |
| `NODE_ENV` | `production` |
| `GMAIL_USER` | Gmail for Nodemailer |
| `GMAIL_PASS` | Gmail app password |
| `AWS_REGION` | Region for **Vercel-only** S3 bucket |
| `AWS_ACCESS_KEY_ID` | Keys for that bucket |
| `AWS_SECRET_ACCESS_KEY` | Keys for that bucket |
| `AWS_BUCKET_NAME` | **Separate** bucket from production |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full service-account JSON as one line/string |

Do **not** put the production RDS URL or production S3 bucket name here.

## 4. Isolation reminder

- This repo must not trigger Elastic Beanstalk (AWS deploy workflow is disabled here).
- Vercel and AWS databases must stay disconnected.
- After deploy, API base is `https://<project>.vercel.app/api/`.
