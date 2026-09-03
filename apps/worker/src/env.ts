import { getAddress } from 'ethers';
import { z } from 'zod';

const address = z.string().transform((value, ctx) => {
  try {
    return getAddress(value);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Invalid EVM address' });
    return z.NEVER;
  }
});

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  SOURCE_CHAIN_RPC_URL: z.string().url(),
  CREDITCOIN_RPC_URL: z.string().url(),
  PROOF_BUILDER_URL: z.string().url(),
  CREDITCOIN_RELAYER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  SOURCE_VAULT_ADDRESS: address,
  SOURCE_TOKEN_ADDRESS: address,
  ATTESTLOCK_ASC_ADDRESS: address,
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  PUBLIC_API_ORIGIN: z.string().url().default('http://localhost:3001'),
  MAX_JOBS_PER_WALLET_PER_DAY: z.coerce.number().int().positive().default(5),
  MAX_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(60),
  CREDITCOIN_DEPLOYMENT_BLOCK: z.coerce.number().int().positive(),
});

export type WorkerConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return schema.parse(env);
}
