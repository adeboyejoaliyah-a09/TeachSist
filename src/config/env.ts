import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3001")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  SYNC_CURSOR_SECRET: z.string().min(32),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

export function supabaseIssuer(config: AppConfig): string {
  return `${config.SUPABASE_URL.replace(/\/+$/, "")}/auth/v1`;
}

export function supabaseJwksUrl(config: AppConfig): URL {
  return new URL(`${supabaseIssuer(config)}/.well-known/jwks.json`);
}
