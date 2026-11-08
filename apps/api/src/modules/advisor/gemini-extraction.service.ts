import { Injectable, Logger } from '@nestjs/common';
import {
  ExtractedBusinessIntent,
  Segment,
  ProductCategory
} from '@udyamone/shared-types';

@Injectable()
export class GeminiExtractionService {
  private readonly logger = new Logger(GeminiExtractionService.name);

  /**
   * Calls Gemini API to extract structured business requirements from conversation history.
   * Returns null if API key is absent, rate-limited, times out, or returns invalid/malformed JSON,
   * triggering clean deterministic fallback.
   */
  async extractIntent(
    transcript: Array<{ role: string; content: string }>,
    existingEntities: ExtractedBusinessIntent = {}
  ): Promise<ExtractedBusinessIntent | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      return null;
    }

    const systemPrompt = `You are an expert MSME Telecom Requirement Extraction AI for Accel Telecom (India).
Extract all structured business attributes from the provided customer conversation.
Return ONLY a valid, raw JSON object (no markdown, no backticks, no explanations) matching this schema:
{
  "businessName": string | null,
  "segment": "MICRO_RETAIL" | "PROFESSIONAL_OFFICE" | "MULTI_SITE" | "MANUFACTURING" | null,
  "city": string | null,
  "cityTier": 1 | 2 | null,
  "state": string | null,
  "employeeCount": number | null,
  "numSites": number | null,
  "hasGstin": boolean | null,
  "gstin": string | null,
  "hasUdyam": boolean | null,
  "udyamNumber": string | null,
  "monthlyBudgetInr": number | null,
  "primaryNeed": string | null,
  "intendedCategories": ["CONNECTIVITY" | "COMMUNICATION" | "CLOUD_PRODUCTIVITY" | "SECURITY" | "IOT_PHYSICAL"],
  "specificProductInterests": string[]
}

Rules:
1. Do not invent or fabricate unknown details. Use null if not mentioned.
2. Cities in Delhi NCR, Mumbai, Pune, Bangalore, Bengaluru, Chennai, Hyderabad, Kolkata, Ahmedabad are cityTier: 1. All others are cityTier: 2.
3. If user mentions Hindi or regional words, interpret them accurately into the schema.`;

    const userContent = `Existing Extracted State:
${JSON.stringify(existingEntities, null, 2)}

Full Conversation History:
${transcript.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join('\n')}`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: systemPrompt },
                  { text: userContent }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json'
            }
          }),
          signal: AbortSignal.timeout(6000)
        }
      );

      if (!response.ok) {
        this.logger.warn(`Gemini API returned HTTP ${response.status}. Triggering deterministic fallback.`);
        return null;
      }

      const json = await response.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        this.logger.warn('Gemini API returned empty text part. Triggering deterministic fallback.');
        return null;
      }

      // Sanitize JSON text
      const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleanJson);

      return this.validateAndSanitize(parsed, existingEntities);
    } catch (err: any) {
      this.logger.warn(`Gemini API extraction failed: ${err.message || 'Unknown error'}. Triggering deterministic fallback.`);
      return null;
    }
  }

  /**
   * Strictly validates and sanitizes arbitrary AI JSON output.
   */
  private validateAndSanitize(
    data: any,
    fallback: ExtractedBusinessIntent
  ): ExtractedBusinessIntent {
    if (!data || typeof data !== 'object') {
      return fallback;
    }

    const sanitized: ExtractedBusinessIntent = { ...fallback };

    // Business Name
    if (typeof data.businessName === 'string' && data.businessName.trim().length >= 2) {
      sanitized.businessName = data.businessName.trim();
    }

    // Segment validation
    const validSegments = ['MICRO_RETAIL', 'PROFESSIONAL_OFFICE', 'MULTI_SITE', 'MANUFACTURING'];
    if (typeof data.segment === 'string' && validSegments.includes(data.segment.toUpperCase())) {
      sanitized.segment = data.segment.toUpperCase() as Segment;
    }

    // City & City Tier
    if (typeof data.city === 'string' && data.city.trim().length >= 2) {
      sanitized.city = data.city.trim();
    }
    if (data.cityTier === 1 || data.cityTier === 2) {
      sanitized.cityTier = data.cityTier;
    }

    // State
    if (typeof data.state === 'string') {
      sanitized.state = data.state.trim();
    }

    // Headcount
    if (typeof data.employeeCount === 'number' && !isNaN(data.employeeCount) && data.employeeCount > 0) {
      sanitized.employeeCount = Math.floor(data.employeeCount);
    }

    // Number of Sites
    if (typeof data.numSites === 'number' && !isNaN(data.numSites) && data.numSites > 0) {
      sanitized.numSites = Math.floor(data.numSites);
    }

    // GSTIN
    if (typeof data.hasGstin === 'boolean') {
      sanitized.hasGstin = data.hasGstin;
    }
    if (typeof data.gstin === 'string' && /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i.test(data.gstin.trim())) {
      sanitized.hasGstin = true;
      sanitized.gstin = data.gstin.trim().toUpperCase();
    }

    // Udyam
    if (typeof data.hasUdyam === 'boolean') {
      sanitized.hasUdyam = data.hasUdyam;
    }
    if (typeof data.udyamNumber === 'string' && /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/i.test(data.udyamNumber.trim())) {
      sanitized.hasUdyam = true;
      sanitized.udyamNumber = data.udyamNumber.trim().toUpperCase();
    }

    // Budget
    if (typeof data.monthlyBudgetInr === 'number' && !isNaN(data.monthlyBudgetInr) && data.monthlyBudgetInr > 0) {
      sanitized.monthlyBudgetInr = Math.floor(data.monthlyBudgetInr);
    }

    // Primary Need
    if (typeof data.primaryNeed === 'string' && data.primaryNeed.trim().length > 0) {
      sanitized.primaryNeed = data.primaryNeed.trim();
    }

    // Categories
    const validCategories = ['CONNECTIVITY', 'COMMUNICATION', 'CLOUD_PRODUCTIVITY', 'SECURITY', 'IOT_PHYSICAL'];
    if (Array.isArray(data.intendedCategories)) {
      const filtered = data.intendedCategories
        .map((c: any) => String(c).toUpperCase())
        .filter((c: string) => validCategories.includes(c));
      if (filtered.length > 0) {
        sanitized.intendedCategories = Array.from(new Set([...(sanitized.intendedCategories || []), ...filtered])) as ProductCategory[];
      }
    }

    // Specific Product Interests
    if (Array.isArray(data.specificProductInterests)) {
      const filtered = data.specificProductInterests
        .map((p: any) => String(p).toUpperCase().trim())
        .filter((p: string) => /^P\d{2}$/.test(p));
      if (filtered.length > 0) {
        sanitized.specificProductInterests = Array.from(new Set([...(sanitized.specificProductInterests || []), ...filtered]));
      }
    }

    sanitized.confidenceScore = 0.98;
    return sanitized;
  }
}
