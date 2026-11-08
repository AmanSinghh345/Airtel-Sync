import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Production reverse-proxy trust (Render / Cloudflare / Vercel edge)
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api');

  // Production CORS: allow configured FRONTEND_URL or wildcard
  const frontendUrl = process.env.FRONTEND_URL;
  app.enableCors({
    origin: frontendUrl ? [frontendUrl, 'http://localhost:3000', /\.vercel\.app$/] : '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const port = process.env.PORT || 4000;
  await app.listen(port, '0.0.0.0');
  console.log(`UdyamOne Backend running on http://0.0.0.0:${port}/api`);
}

bootstrap();
