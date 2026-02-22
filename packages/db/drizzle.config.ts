import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'turso',
  dbCredentials: {
    url: process.env['TURSO_DB_URL'] ?? 'file:./dev.db',
    authToken: process.env['TURSO_AUTH_TOKEN'],
  },
})
