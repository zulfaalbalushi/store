import { createServer } from 'node:http';

import { createApiRouter } from './api/router.js';
import { createRequestHandler } from './app.js';
import { ConfigurationError, loadConfig } from './config.js';
import { openDatabase } from './database/connection.js';

async function startServer() {
  let config;

  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  let database;

  try {
    database = await openDatabase(config.databasePath);
  } catch (error) {
    console.error('Unable to initialize the Baytna database', error);
    process.exitCode = 1;
    return;
  }

  const server = createServer(
    createRequestHandler({
      apiRouter: createApiRouter({ config, database }),
      healthCheck: () => database.checkHealth(),
    }),
  );

  server.on('error', (error) => {
    console.error('Unable to start Baytna', error);
    database.close();
    process.exitCode = 1;
  });

  server.listen(config.port, config.host, () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : config.port;

    console.log(`Baytna is running at http://${config.host}:${port}`);
  });

  function shutDown(signal) {
    console.log(`${signal} received; shutting down Baytna.`);
    server.close(() => {
      database.close();
    });
  }

  process.once('SIGINT', () => shutDown('SIGINT'));
  process.once('SIGTERM', () => shutDown('SIGTERM'));
}

await startServer();
