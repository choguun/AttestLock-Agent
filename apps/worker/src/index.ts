import { AttestcoinChainAdapter } from './chain-adapter.js';
import { loadConfig } from './env.js';
import { JobProcessor } from './processor.js';
import { buildServer, InMemoryJobEvents } from './server.js';
import { PostgresJobStore } from './store.js';

const config = loadConfig();
const store = new PostgresJobStore(config.DATABASE_URL);
await store.init();
const recovered = await store.recoverInterrupted();

const events = new InMemoryJobEvents();
const adapter = new AttestcoinChainAdapter(config, store);
const processor = new JobProcessor(store, adapter, (job) => events.publish(job));
const app = await buildServer(
  store,
  config,
  events,
  () => adapter.readiness(),
  () => adapter.publicStats()
);
if (recovered > 0) app.log.warn({ recovered }, 'Recovered interrupted proof jobs');

const timer = setInterval(() => {
  void processor
    .runNext()
    .catch(() => app.log.error('Job processor operation failed; no provider details are published.'));
}, 2_000);
// Observe advancement independently of external health traffic.
void adapter.readiness();
const readinessTimer = setInterval(() => {
  void adapter.readiness().catch(() => undefined);
}, 15_000);
const cleanupTimer = setInterval(
  () => {
    void store.cleanupExpiredChallenges().catch((error) => app.log.error(error));
  },
  60 * 60 * 1_000
);

const shutdown = async () => {
  clearInterval(timer);
  clearInterval(readinessTimer);
  clearInterval(cleanupTimer);
  await app.close();
  await processor.stop();
  await store.close();
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ port: config.PORT, host: '0.0.0.0' });
