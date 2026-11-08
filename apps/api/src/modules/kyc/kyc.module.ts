import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycVerificationService } from './kyc-verification.service';
import { ConsentService } from './consent.service';
import { OcrService } from './ocr.service';

@Module({
  controllers: [KycController],
  providers: [
    KycVerificationService,
    ConsentService,
    OcrService
  ],
  exports: [
    KycVerificationService,
    ConsentService,
    OcrService
  ]
})
export class KycModule {}
