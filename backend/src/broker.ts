import { createServer } from 'node:net';
import { Aedes } from 'aedes';

export interface EmbeddedBroker {
  close(): Promise<void>;
}

/** In-process MQTT broker for local development; production uses Mosquitto (see docker-compose.yml). */
export async function startEmbeddedBroker(port: number): Promise<EmbeddedBroker> {
  const aedes = await Aedes.createBroker();
  const server = createServer(aedes.handle);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve());
  });
  console.info(`[broker] embedded MQTT broker listening on port ${port}`);

  return {
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => aedes.close(() => resolve()));
      }),
  };
}
