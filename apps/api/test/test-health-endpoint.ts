import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { HealthController } from '../src/modules/health/health.controller';

async function testHealth() {
  console.log('Testing NestJS AppModule & HealthController instantiation...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const healthController = app.get(HealthController);
  const health = await healthController.getHealth();
  console.log('Health Endpoint Live Result:', JSON.stringify(health, null, 2));
  if (health.status !== 'UP' || !health.database.connected) {
    throw new Error('Health check failed!');
  }
  await app.close();
  console.log('NestJS HealthController verified successfully!');
}

testHealth().catch((e) => {
  console.error(e);
  process.exit(1);
});
