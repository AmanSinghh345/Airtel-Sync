import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeterministicExtractionService } from './deterministic-extraction.service';
import { GeminiExtractionService } from './gemini-extraction.service';
import { ProductRecommendationEngine } from './product-recommendation.engine';
import {
  AdvisorTurnRequestDto,
  AdvisorTurnResponseDto,
  ExtractedBusinessIntent,
  ConversationSessionDto
} from '@udyamone/shared-types';
import * as crypto from 'crypto';

@Injectable()
export class AdvisorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deterministicExtractor: DeterministicExtractionService,
    private readonly geminiExtractor: GeminiExtractionService,
    private readonly recommendationEngine: ProductRecommendationEngine
  ) {}

  /**
   * Handles a conversational turn: extracts intent via Gemini (with deterministic fallback),
   * identifies missing fields, asks follow-up questions, or delivers bundle recommendations & quotes.
   */
  async handleTurn(dto: AdvisorTurnRequestDto): Promise<AdvisorTurnResponseDto> {
    const sessionToken = dto.sessionToken || this.generateSessionToken();

    // 1. Fetch or initialize conversation record from PostgreSQL
    let conversation = await this.prisma.conversation.findUnique({
      where: { sessionToken }
    });

    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: string }> =
      conversation && Array.isArray(conversation.messages as any)
        ? (conversation.messages as any)
        : [];

    let currentEntities: ExtractedBusinessIntent =
      conversation && conversation.extractedEntities
        ? (conversation.extractedEntities as any)
        : {};

    // 2. Language Detection & Preference
    const detectedLang = this.deterministicExtractor.detectLanguage(dto.message);
    const preferredLanguage = dto.preferredLanguage || (conversation?.preferredLanguage as any) || detectedLang;

    // 3. Append user message to transcript
    const userMsg = {
      role: 'user' as const,
      content: dto.message,
      timestamp: new Date().toISOString()
    };
    messages.push(userMsg);

    // 4. Intent Extraction (Gemini with clean deterministic fallback)
    let extracted: ExtractedBusinessIntent | null = null;
    try {
      extracted = await this.geminiExtractor.extractIntent(messages, currentEntities);
    } catch {
      extracted = null;
    }

    if (!extracted) {
      // Deterministic fallback (zero external dependencies)
      extracted = this.deterministicExtractor.extract(dto.message, currentEntities);
    }

    currentEntities = extracted;

    // 4.1 Perform Real GSTIN Registry Lookup (Never automatically trust unverified input)
    if (currentEntities.gstin) {
      const gstinClean = currentEntities.gstin.trim().toUpperCase();
      const validFormat = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstinClean);
      if (validFormat) {
        const registryRecord = await this.prisma.gstinRegistry.findUnique({
          where: { gstin: gstinClean }
        });

        if (registryRecord && registryRecord.status.toLowerCase() === 'active') {
          currentEntities.hasGstin = true;
          if (!currentEntities.businessName) {
            currentEntities.businessName = registryRecord.tradeName || registryRecord.legalName;
          }
        } else {
          // If cancelled, suspended, or not in registry, do not mark as verified GSTIN!
          currentEntities.hasGstin = false;
        }
      } else {
        currentEntities.hasGstin = false;
      }
    }

    // 5. Missing Field Detection
    const missingFields = this.deterministicExtractor.getMissingFields(currentEntities);
    const isComplete = missingFields.length === 0;

    let reply = '';
    let recommendationResult = undefined;

    // 6. Contextual Response Generation
    if (!isComplete) {
      const nextMissingField = missingFields[0];
      const followUp = this.deterministicExtractor.generateFollowUpQuestion(
        nextMissingField,
        preferredLanguage === 'Hindi' ? 'Hindi' : preferredLanguage === 'Hinglish' ? 'Hinglish' : 'English'
      );

      if (preferredLanguage === 'Hindi') {
        reply = `धन्यवाद। हमने आपके व्यवसाय की जानकारी दर्ज कर ली है।\n\n${followUp}`;
      } else if (preferredLanguage === 'Hinglish') {
        reply = `Thank you! Humne aapke details note kar liye hai.\n\n${followUp}`;
      } else {
        reply = `Thank you for sharing your details.\n\n${followUp}`;
      }
    } else {
      // All core fields present: Generate deterministic bundle recommendation & quote
      recommendationResult = await this.recommendationEngine.generateRecommendation(
        currentEntities,
        dto.businessId || conversation?.businessId || undefined
      );

      const itemsSummary = recommendationResult.items
        .map((i) => `• ${i.productName}: ₹${i.indicativeMonthlyInr.toLocaleString('en-IN')}/mo (₹${i.oneTimeSetupInr.toLocaleString('en-IN')} setup)\n  ${i.reason}`)
        .join('\n\n');

      const monthlyTotal = recommendationResult.quote?.totalMonthlyRecurringInr || 0;
      const setupTotal = recommendationResult.quote?.totalOneTimeSetupInr || 0;
      const slaDays = recommendationResult.installationSlaDays;

      if (preferredLanguage === 'Hindi') {
        reply = `बहुत बढ़िया! आपके ${currentEntities.businessName || 'व्यवसाय'} के लिए हमने एक आदर्श दूरसंचार पैकेज तैयार किया है:\n\n${itemsSummary}\n\n📊 कुल अनुमानित मासिक शुल्क: ₹${monthlyTotal.toLocaleString('en-IN')}/माह\n🔧 एकमुश्त सेटअप शुल्क: ₹${setupTotal.toLocaleString('en-IN')}\n⏱️ स्थापना समय (SLA): ${slaDays} कार्यदिवस\n\nक्या आप इस पैकेज के साथ डिजिटल KYC सत्यापन के लिए आगे बढ़ना चाहते हैं?`;
      } else if (preferredLanguage === 'Hinglish') {
        reply = `Great! Aapke ${currentEntities.businessName || 'business'} ke liye humne optimized telecom package prepare kiya hai:\n\n${itemsSummary}\n\n📊 Total Indicative Monthly: ₹${monthlyTotal.toLocaleString('en-IN')}/mo\n🔧 One-Time Setup: ₹${setupTotal.toLocaleString('en-IN')}\n⏱️ Installation SLA: ${slaDays} working days\n\nKya aap digital KYC verification ke liye aage proceed karna chahte hain?`;
      } else {
        reply = `Excellent! Based on your requirements for ${currentEntities.businessName || 'your business'}, here is your recommended Accel Telecom solution:\n\n${itemsSummary}\n\n📊 Total Indicative Monthly: ₹${monthlyTotal.toLocaleString('en-IN')}/mo\n🔧 One-Time Setup: ₹${setupTotal.toLocaleString('en-IN')}\n⏱️ Installation SLA: ${slaDays} business days\n\nWould you like to proceed with digital KYC verification for this solution?`;
      }
    }

    // 7. Append assistant response
    const assistantMsg = {
      role: 'assistant' as const,
      content: reply,
      timestamp: new Date().toISOString()
    };
    messages.push(assistantMsg);

    // 8. Persist conversation state in PostgreSQL
    const businessIdToLink = dto.businessId || conversation?.businessId || null;

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          sessionToken,
          businessId: businessIdToLink,
          preferredLanguage,
          messages: messages as any,
          extractedEntities: currentEntities as any,
          isCompleted: isComplete
        }
      });
    } else {
      conversation = await this.prisma.conversation.update({
        where: { sessionToken },
        data: {
          businessId: businessIdToLink || conversation.businessId,
          preferredLanguage,
          messages: messages as any,
          extractedEntities: currentEntities as any,
          isCompleted: isComplete
        }
      });
    }

    // If completed and businessId exists, save to BusinessRequirement
    if (isComplete && businessIdToLink && recommendationResult?.quote) {
      await this.prisma.businessRequirement.create({
        data: {
          businessId: businessIdToLink,
          rawPrompt: dto.message,
          extractedJson: currentEntities as any,
          budgetMaxInr: currentEntities.monthlyBudgetInr ? currentEntities.monthlyBudgetInr : null,
          connectivityType: currentEntities.primaryNeed || 'Broadband Fibre',
          criticalNeed: currentEntities.intendedCategories?.join(', ') || null
        }
      });
    }

    return {
      sessionToken,
      reply,
      preferredLanguage,
      extractedEntities: currentEntities,
      missingFields,
      isComplete,
      recommendation: recommendationResult
    };
  }

  /**
   * Retrieves an existing conversation session by its session token.
   */
  async getSession(sessionToken: string): Promise<ConversationSessionDto> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { sessionToken }
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation with session token '${sessionToken}' was not found.`);
    }

    return {
      sessionToken: conversation.sessionToken,
      preferredLanguage: conversation.preferredLanguage,
      messages: (conversation.messages as any) || [],
      extractedEntities: (conversation.extractedEntities as any) || undefined,
      isCompleted: conversation.isCompleted,
      businessId: conversation.businessId || undefined,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString()
    };
  }

  /**
   * Generates a cryptographically secure 128-bit random session token (e.g. SES-2026-F9A83...).
   */
  private generateSessionToken(): string {
    const hex = crypto.randomBytes(16).toString('hex').toUpperCase();
    return `SES-2026-${hex}`;
  }

  /**
   * Masks sensitive GSTIN for privacy preservation in logs and user transcripts.
   */
  public maskGstin(gstin?: string): string {
    if (!gstin || gstin.length < 8) return '***';
    return `${gstin.slice(0, 2)}*****${gstin.slice(-3)}`;
  }
}
