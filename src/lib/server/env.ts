import { z } from "zod";

const coreEnvSchema = z.object({
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url().optional(),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(1),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  MOCK_MEDIA_BASE_URL: z
    .string()
    .url()
    .default("https://example.com/steelart/mock"),
  ALLOW_MOCK_SEED: z
    .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
    .default("false"),
});

const awsEnvSchema = z.object({
  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_S3_BUCKET: z.string().min(1),
});

let cachedCoreEnv: z.infer<typeof coreEnvSchema> | null = null;
let cachedAwsEnv: z.infer<typeof awsEnvSchema> | null = null;

function formatError(error: z.ZodError, prefix: string) {
  const details = error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  return `Invalid ${prefix} configuration: ${details}`;
}

export function getCoreEnv() {
  if (cachedCoreEnv) {
    return cachedCoreEnv;
  }

  const parsed = coreEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(formatError(parsed.error, "core environment"));
  }

  cachedCoreEnv = parsed.data;
  return cachedCoreEnv;
}

export function getAwsEnv() {
  if (cachedAwsEnv) {
    return cachedAwsEnv;
  }

  const parsed = awsEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(formatError(parsed.error, "aws environment"));
  }

  cachedAwsEnv = parsed.data;
  return cachedAwsEnv;
}

export function canRunMockSeed() {
  const env = getCoreEnv();
  return env.ALLOW_MOCK_SEED === "true" || env.ALLOW_MOCK_SEED === "1";
}
