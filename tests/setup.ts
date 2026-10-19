import { createServer } from 'vite';
// Run Vite in the test runner so Windows teardown closes it without taskkill.
export default async function setup() {
  const server = await createServer({ server: { host: '127.0.0.1', port: 5187, strictPort: true } });
  await server.listen();
  return async () => { await server.close(); };
}
