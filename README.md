This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/pages/api-reference/create-next-app).

## Authentication

Every page and API route requires a signed-in session (see `middleware.ts`), except `/login` and `/api/auth/*`.

- Users sign in with **email + password**. Passwords are hashed with scrypt; sessions are HMAC-signed httpOnly cookies (7 days).
- Nobody can sign in until a super admin sets a password for them in the **admin panel at `/admin`**. Setting/changing a password, changing a role, or revoking access signs that user out everywhere (within ~1 minute).
- Without a password, users use **Request access** on the login page, which emails `dhruvshdarshansh@gmail.com` (via Resend) and lists the request in the admin panel.
- Super admins can also be bootstrapped from the CLI:
  `node --env-file=.env scripts/set-user-password.mjs <email> <password> [--super-admin]`
- Set `SESSION_SECRET` (random, 32+ chars, e.g. `openssl rand -base64 48`) in the environment. If absent, a key is derived from `SUPABASE_SERVICE_ROLE_KEY`.
- Schema: `migrations/013_user_auth.sql` (also enables RLS on `public.users`, since the Supabase project is shared with the public site).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.ts`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/pages/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn-pages-router) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.
