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
const adapter = new AttestcoinChainAdapter(config);
const processor = new JobProcessor(store, adapter, (job) => events.publish(job));
const app = await buildServer(store, config, events);
if (recovered > 0) app.log.warn({ recovered }, 'Recovered interrupted proof jobs');

const timer = setInterval(() => {
  void processor.runNext().catch((error) => app.log.error(error));
}, 2_000);

const shutdown = async () => {
  clearInterval(timer);
  await app.close();
  await store.close();
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ port: config.PORT, host: '0.0.0.0' });
