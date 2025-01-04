import { handleUpgrade } from './connectionManager';
import http from 'http';
import { getPort } from '../config';
import logger from '../utils/logger';

export const initServer = (
  server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>,
) => {
  const port = getPort();

  server.on('upgrade', handleUpgrade);

  logger.info(`WebSocket server started on port ${port}`);
};
