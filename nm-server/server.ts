import { createGameServer } from './gameServer';
const server = createGameServer();
const port = Number(process.env.PORT ?? 3000);
server.httpServer.listen(port, () => console.log(`Serwer gry nasłuchuje na porcie ${port}.`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void server.close(); });
}
