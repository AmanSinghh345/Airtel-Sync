import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

async function verifyHttpServer() {
  console.log('[Check 1] Starting live NestJS HTTP server...');
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  
  const PORT = 4001; // Isolated test port
  await app.listen(PORT);
  console.log(`Server actively listening on http://localhost:${PORT}/api`);

  try {
    const url = `http://127.0.0.1:${PORT}/api/health`;
    console.log(`Sending real HTTP GET request to: ${url}`);
    
    const response = await fetch(url);
    const body = await response.json();

    console.log(`HTTP Status: ${response.status} ${response.statusText}`);
    console.log('HTTP Response Body:', JSON.stringify(body, null, 2));

    if (response.status !== 200 || body.status !== 'UP' || !body.database?.connected) {
      throw new Error(`HTTP verification failed! Response: ${JSON.stringify(body)}`);
    }

    console.log('SUCCESS: Real HTTP GET /api/health returned 200 OK and status UP!');
  } finally {
    await app.close();
    console.log('HTTP server cleanly shut down.');
  }
}

verifyHttpServer().catch((e) => {
  console.error('HTTP Verification Error:', e);
  process.exit(1);
});
