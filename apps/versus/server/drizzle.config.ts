import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: '../../../packages/db/src/schema.ts',
  dialect: 'turso',
  dbCredentials: {
    url: process.env['TURSO_DB_URL'] ?? 'file:./dev.db',
    authToken: process.env['TURSO_AUTH_TOKEN'],
  },
})
