type NodeEnvironment = 'development' | 'production' | 'test';

function optional(value: string | undefined): string {
  return value?.trim() || '';
}

function booleanValue(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  throw new Error(`${name} must be true, false, 1, or 0`);
}

function positiveInteger(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function nodeEnvironment(value: string | undefined): NodeEnvironment {
  const resolved = value || 'development';
  if (resolved === 'development' || resolved === 'production' || resolved === 'test') {
    return resolved;
  }
  throw new Error('NODE_ENV must be development, production, or test');
}

function optionalUrl(name: string, value: string | undefined): string {
  const resolved = optional(value);
  if (!resolved) return '';
  try {
    return new URL(resolved).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

export const serverEnv = {
  get nodeEnv() { return nodeEnvironment(process.env.NODE_ENV); },
  get isProduction() { return this.nodeEnv === 'production'; },
  get port() { return positiveInteger('PORT', process.env.PORT, 3000); },
  get databaseUrl() { return optional(process.env.DATABASE_URL); },
  get databasePoolMax() { return positiveInteger('DATABASE_POOL_MAX', process.env.DATABASE_POOL_MAX, 1); },
  get demoMode() { return booleanValue('DEMO_MODE', process.env.DEMO_MODE, true); },
  get authMode() { return optional(process.env.AUTH_MODE) || 'demo'; },
  get enableDemoLogin() { return booleanValue('ENABLE_DEMO_LOGIN', process.env.ENABLE_DEMO_LOGIN, true); },
  get autoSeed() { return booleanValue('AUTO_SEED', process.env.AUTO_SEED, true); },
  get enableAllClaimTypes() { return booleanValue('ENABLE_ALL_CLAIM_TYPES', process.env.ENABLE_ALL_CLAIM_TYPES, false); },
  get uploadDir() { return optional(process.env.UPLOAD_DIR); },
  get azureOpenAIEndpoint() { return optionalUrl('AZURE_OPENAI_ENDPOINT', process.env.AZURE_OPENAI_ENDPOINT); },
  get azureOpenAIKey() { return optional(process.env.AZURE_OPENAI_API_KEY); },
  get azureOpenAIDeployment() { return optional(process.env.AZURE_OPENAI_DEPLOYMENT); },
  get cronSecret() { return optional(process.env.CRON_SECRET); },
  get upstashRedisUrl() { return optionalUrl('UPSTASH_REDIS_REST_URL', process.env.UPSTASH_REDIS_REST_URL); },
  get upstashRedisToken() { return optional(process.env.UPSTASH_REDIS_REST_TOKEN); },
  get supabaseUrl() { return optionalUrl('SUPABASE_URL', process.env.SUPABASE_URL); },
  get supabaseServiceRoleKey() { return optional(process.env.SUPABASE_SERVICE_ROLE_KEY); },
  get supabaseStorageBucket() { return optional(process.env.SUPABASE_STORAGE_BUCKET) || 'uploads'; },
  get microsoftTenantId() { return optional(process.env.MICROSOFT_TENANT_ID) || optional(process.env.TENANT_ID); },
  get microsoftClientId() { return optional(process.env.MICROSOFT_CLIENT_ID) || optional(process.env.CLIENT_ID); },
  get microsoftClientSecret() { return optional(process.env.MICROSOFT_CLIENT_SECRET) || optional(process.env.CLIENT_SECRET); },
  get microsoftRedirectUri() {
    return optionalUrl(
      'MICROSOFT_REDIRECT_URI',
      optional(process.env.MICROSOFT_REDIRECT_URI) || optional(process.env.OAUTH_REDIRECT_URI),
    );
  },
};

export function requireServerValue(name: string, value: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}
