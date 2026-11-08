import { Injectable } from '@nestjs/common';
import {
  ExtractedBusinessIntent,
  Segment,
  ProductCategory
} from '@udyamone/shared-types';

export const TIER_1_CITIES = new Set([
  'delhi',
  'new delhi',
  'ncr',
  'gurgaon',
  'gurugram',
  'noida',
  'faridabad',
  'ghaziabad',
  'mumbai',
  'navi mumbai',
  'thane',
  'bangalore',
  'bengaluru',
  'chennai',
  'hyderabad',
  'secunderabad',
  'kolkata',
  'pune',
  'ahmedabad'
]);

export const TIER_2_CITIES = new Set([
  'jaipur',
  'lucknow',
  'chandigarh',
  'indore',
  'bhopal',
  'nagpur',
  'patna',
  'surat',
  'vadodara',
  'kochi',
  'ernakulam',
  'coimbatore',
  'visakhapatnam',
  'varanasi',
  'kanpur',
  'agra',
  'nashik',
  'rajkot',
  'ludhiana',
  'amritsar',
  'jalandhar',
  'meerut',
  'dehradun',
  'mysore',
  'hubli',
  'mangalore',
  'guwahati',
  'bhubaneswar',
  'ranchi',
  'jamshedpur',
  'raipur',
  'jabalpur',
  'gwalior',
  'madurai',
  'tiruchirappalli',
  'salem',
  'vijayawada',
  'guntur'
]);

export const HINDI_CITY_MAP: Record<string, string> = {
  'दिल्ली': 'Delhi',
  'नई दिल्ली': 'New Delhi',
  'मुंबई': 'Mumbai',
  'बेंगलुरु': 'Bengaluru',
  'बैंगलोर': 'Bengaluru',
  'चेन्नई': 'Chennai',
  'हैदराबाद': 'Hyderabad',
  'कोलकाता': 'Kolkata',
  'पुणे': 'Pune',
  'अहमदाबाद': 'Ahmedabad',
  'जयपुर': 'Jaipur',
  'लखनऊ': 'Lucknow',
  'इंदौर': 'Indore',
  'भोपाल': 'Bhopal',
  'नागपुर': 'Nagpur',
  'पटना': 'Patna',
  'सूरत': 'Surat',
  'कानपुर': 'Kanpur',
  'वाराणसी': 'Varanasi',
  'चंडीगढ़': 'Chandigarh'
};

@Injectable()
export class DeterministicExtractionService {
  /**
   * Detects whether language is Hindi (Devanagari), Hinglish, or English.
   */
  detectLanguage(text: string): 'Hindi' | 'Hinglish' | 'English' {
    if (/[\u0900-\u097F]/.test(text)) {
      return 'Hindi';
    }

    const hinglishMarkers = [
      /\bmera\b/i,
      /\bmeri\b/i,
      /\bhamara\b/i,
      /\bhamari\b/i,
      /\bhai\b/i,
      /\bhain\b/i,
      /\bchahiye\b/i,
      /\bdukan\b/i,
      /\bdukaan\b/i,
      /\bkarein\b/i,
      /\bkarna\b/i,
      /\blog\b/i,
      /\bshahar\b/i,
      /\bkya\b/i,
      /\bnahi\b/i,
      /\bkaam\b/i
    ];

    let matchCount = 0;
    for (const marker of hinglishMarkers) {
      if (marker.test(text)) matchCount++;
    }

    return matchCount >= 1 ? 'Hinglish' : 'English';
  }

  /**
   * Deterministically extracts business intent from text and merges with existing entities.
   */
  extract(
    currentText: string,
    existingEntities: ExtractedBusinessIntent = {}
  ): ExtractedBusinessIntent {
    const text = currentText.trim();
    const lower = text.toLowerCase();

    const merged: ExtractedBusinessIntent = { ...existingEntities };
    const categories: Set<ProductCategory> = new Set(merged.intendedCategories || []);
    const productInterests: Set<string> = new Set(merged.specificProductInterests || []);

    // 1. Business Name
    const nameMatch =
      text.match(/(?:business name is|company name is|company is|business is|named|trading as)\s+([A-Z0-9\s&'-]{3,40})/i) ||
      text.match(/(?:naam|name)\s+(?:hai\s+)?([A-Za-z0-9\s&'-]{3,35})(?:\s+hai|\s+located|\.|$)/i) ||
      text.match(/(?:mera business|meri company|meri dukan|meri dukaan)\s+([A-Za-z0-9\s&'-]{3,35})(?:\s+hai|\.|$)/i);

    if (nameMatch && nameMatch[1]) {
      const candidateName = nameMatch[1].trim().replace(/\s+(hai|located|in|mein|me)$/i, '');
      if (candidateName.length >= 3 && !/^(mera|meri|hamara|hum|we|our|the)$/i.test(candidateName)) {
        merged.businessName = candidateName;
      }
    }

    // 2. City and City Tier
    // Check Hindi Devanagari cities
    for (const [hindiName, engName] of Object.entries(HINDI_CITY_MAP)) {
      if (text.includes(hindiName)) {
        merged.city = engName;
        const norm = engName.toLowerCase();
        if (TIER_1_CITIES.has(norm)) {
          merged.cityTier = 1;
        } else if (TIER_2_CITIES.has(norm)) {
          merged.cityTier = 2;
        } else {
          merged.cityTier = undefined;
        }
        break;
      }
    }

    // Check English city names against controlled list
    if (!merged.city) {
      const allControlledCities = [...Array.from(TIER_1_CITIES), ...Array.from(TIER_2_CITIES)];
      for (const city of allControlledCities) {
        const regex = new RegExp(`\\b${city}\\b`, 'i');
        if (regex.test(lower)) {
          merged.city = city.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          merged.cityTier = TIER_1_CITIES.has(city) ? 1 : 2;
          break;
        }
      }

      // Check if user specified a city that is not in controlled list
      if (!merged.city) {
        const arbitraryCityMatch = text.match(/(?:located in|based in|in city|shahar|city is|office in)\s+([A-Za-z]{3,20})/i);
        if (arbitraryCityMatch && arbitraryCityMatch[1] && !/^(the|our|my|a|an|india)$/i.test(arbitraryCityMatch[1])) {
          const cand = arbitraryCityMatch[1].trim();
          const normCand = cand.toLowerCase();
          merged.city = cand.charAt(0).toUpperCase() + cand.slice(1);
          if (TIER_1_CITIES.has(normCand)) {
            merged.cityTier = 1;
          } else if (TIER_2_CITIES.has(normCand)) {
            merged.cityTier = 2;
          } else {
            // Unknown city: DO NOT silently default to Tier 1 or Tier 2!
            merged.cityTier = undefined;
          }
        }
      }
    }

    // 3. Segment Detection
    if (
      /manufacturing|karkhana|factory|plant|production|textile|plastics|industrial|automotive|fabrication|कारखाना|फैक्ट्री|मैन्युफैक्चरिंग/i.test(
        text
      )
    ) {
      merged.segment = Segment.MANUFACTURING;
    } else if (
      /retail|dukan|dukaan|shop|store|showroom|chemist|pharmacy|kirana|supermarket|grocery|boutique|दुकान|रिटेल/i.test(
        text
      )
    ) {
      merged.segment = Segment.MICRO_RETAIL;
    } else if (
      /multi[- ]?site|chain of|multiple stores|multiple branches|across cities|shakha|शाखा/i.test(
        text
      )
    ) {
      merged.segment = Segment.MULTI_SITE;
    } else if (
      /office|consulting|agency|ca firm|law firm|software|it company|clinic|hospital|diagnostic|consultancy|ऑफिस/i.test(
        text
      )
    ) {
      merged.segment = Segment.PROFESSIONAL_OFFICE;
    }

    // 4. Employee Count (Headcount)
    const empMatch =
      text.match(/(\d+)[\s-]*(?:employees?|staff|people|person|workers?|users?|seats?|log|aadmi|bande|members?|कर्मचारी|लोग)/i) ||
      text.match(/(?:team size|team of|headcount of|approx|around|users?|staff)\s*(?:is|of|hai)?\s*(\d+)/i) ||
      (merged.employeeCount === undefined && text.match(/^\s*(?:we have|approx|around|mere paas|hamare paas|total)?\s*(\d+)\s*(?:users?|people|person|staff|employees?)?\s*$/i));

    if (empMatch && empMatch[1]) {
      const parsedEmp = parseInt(empMatch[1], 10);
      if (!isNaN(parsedEmp) && parsedEmp > 0) {
        merged.employeeCount = parsedEmp;
      }
    }

    // 5. Number of Sites / Branches
    const sitesMatch =
      text.match(/(\d+)\s*(?:[\w\u0900-\u097F\s]{0,10})?(?:sites?|branches?|locations?|offices?|stores?|plants?|shakha|शाखाएं|शाखा|ऑफिस|दुकान|ब्रांच)/i) ||
      text.match(/(?:single office|1 office|single site|1 site|one site|single store|one office|single workshop|single clinic|1 ही मुख्य ऑफिस|एक ही मुख्य ऑफिस|1 मुख्य ऑफिस|एक ऑफिस|1 ऑफिस|एक ही ऑफिस)/i) ||
      text.match(/(?:head office and|ho and)\s*(\d+)\s*(?:branches?|sites?)/i);

    if (sitesMatch) {
      if (typeof sitesMatch[1] === 'string' && /^\d+$/.test(sitesMatch[1].trim())) {
        const parsedSites = parseInt(sitesMatch[1].trim(), 10);
        if (!isNaN(parsedSites) && parsedSites > 0) {
          if (/head office|ho/i.test(sitesMatch[0])) {
            merged.numSites = parsedSites + 1;
          } else {
            merged.numSites = parsedSites;
          }
        }
      } else {
        // Matches single office / 1 site / 1 ही मुख्य ऑफिस
        merged.numSites = 1;
      }
    }

    // If multi-site segment detected but numSites not set, default candidate to >= 2
    if (merged.segment === Segment.MULTI_SITE && (!merged.numSites || merged.numSites < 2)) {
      merged.numSites = 2;
    }

    // 6. GSTIN Extraction
    const gstinMatch = text.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/i);
    if (gstinMatch) {
      merged.hasGstin = true;
      merged.gstin = gstinMatch[1].toUpperCase();
    } else if (
      /gst hai|gst number hai|have gst|gst registered|gst available|registered under gst|yes gst|जीएसटी है|^\s*(?:yes|haan|ha|have it)\s*$/i.test(
        text
      )
    ) {
      merged.hasGstin = true;
    } else if (
      /no gst|gst nahi hai|without gst|unregistered|not registered for gst|nahi hai gst|जीएसटी नहीं है|^\s*(?:no|nahi|na|none|not yet|don't have)\s*$/i.test(
        text
      )
    ) {
      merged.hasGstin = false;
      merged.gstin = undefined;
    }

    // 7. Udyam Registration Extraction
    const udyamMatch = text.match(/\b(UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7})\b/i);
    if (udyamMatch) {
      merged.hasUdyam = true;
      merged.udyamNumber = udyamMatch[1].toUpperCase();
    } else if (/udyam hai|msme registered|udyam certificate|registered with udyam/i.test(text)) {
      merged.hasUdyam = true;
    }

    // 8. Monthly Budget
    const budgetMatch =
      text.match(/(?:budget|spend|kharche|around|max|under|tak)\s*(?:is|of|hai)?\s*(?:rs\.?|inr|₹)?\s*(\d{3,7})/i) ||
      text.match(/(?:rs\.?|inr|₹)\s*(\d{3,7})\s*(?:per month|\/mo|mahina|monthly|tak)/i);

    if (budgetMatch && budgetMatch[1]) {
      const parsedBudget = parseInt(budgetMatch[1], 10);
      if (!isNaN(parsedBudget) && parsedBudget >= 500) {
        merged.monthlyBudgetInr = parsedBudget;
      }
    }

    // 9. Primary Needs and Specific Product Interests
    // Connectivity
    if (/high speed|fast internet|fibre|fiber|broadband|leased line|heavy downloads|इंटरनेट|फाइबर/i.test(text)) {
      categories.add(ProductCategory.CONNECTIVITY);
      merged.primaryNeed = merged.primaryNeed || 'High-Speed Primary Connectivity';
    }

    // Multi-site SD-WAN
    if (/sd-?wan|connect branches|interconnect|branch network|office link/i.test(text)) {
      categories.add(ProductCategory.CONNECTIVITY);
      productInterests.add('P10');
      merged.primaryNeed = 'Multi-Site Interconnection';
    }

    // Backup & Redundancy
    if (/backup|failover|redundancy|no downtime|secondary line|fail-safe|बैकअप/i.test(text)) {
      categories.add(ProductCategory.CONNECTIVITY);
      productInterests.add('P09');
    }

    // Static IP / Server / ERP
    if (/static ip|fixed ip|public ip|tally|erp|server|remote access|स्टैटिक आईपी/i.test(text)) {
      categories.add(ProductCategory.SECURITY);
      productInterests.add('P11');
    }

    // Telephony / Calling
    if (/calling|telephony|sip trunk|call center|customer care|ivr|toll-?free|कॉलिंग/i.test(text)) {
      categories.add(ProductCategory.COMMUNICATION);
      productInterests.add('P12');
    }

    // Surveillance / CCTV
    if (/cctv|camera|surveillance|security cameras|कैमरा|सीसीटीवी/i.test(text)) {
      categories.add(ProductCategory.IOT_PHYSICAL);
      productInterests.add('P23');
    }

    // Retail POS / Billing
    if (/pos|billing software|billing machine|cash counter/i.test(text)) {
      categories.add(ProductCategory.CLOUD_PRODUCTIVITY);
      productInterests.add('P19');
    }

    // Email / Cloud Office
    if (/email|google workspace|m365|microsoft 365|office 365|domain email/i.test(text)) {
      categories.add(ProductCategory.CLOUD_PRODUCTIVITY);
      productInterests.add('P16');
    }

    merged.intendedCategories = Array.from(categories);
    merged.specificProductInterests = Array.from(productInterests);
    merged.confidenceScore = 0.95;

    return merged;
  }

  /**
   * Identifies which core fields are still required to generate a deterministic recommendation.
   */
  getMissingFields(intent: ExtractedBusinessIntent): string[] {
    const missing: string[] = [];

    if (!intent.city) {
      missing.push('city');
    } else if (intent.cityTier === undefined || intent.cityTier === null) {
      // City is known by name, but not verified in controlled city-tier registry
      missing.push('cityTier');
    }
    if (intent.employeeCount === undefined || intent.employeeCount === null) {
      missing.push('employeeCount');
    }
    if (intent.numSites === undefined || intent.numSites === null) {
      missing.push('numSites');
    }
    if (intent.hasGstin === undefined || intent.hasGstin === null) {
      missing.push('hasGstin');
    }

    return missing;
  }

  /**
   * Generates a natural, contextual follow-up question for the first missing required field.
   */
  generateFollowUpQuestion(
    missingField: string,
    language: 'Hindi' | 'English' | 'Hinglish'
  ): string {
    switch (missingField) {
      case 'city':
        if (language === 'Hindi') {
          return 'आपकी कंपनी या व्यवसाय किस शहर (City) में स्थित है? (उदा. दिल्ली, मुंबई, पुणे, बेंगलुरु)';
        }
        if (language === 'Hinglish') {
          return 'Aapka business kis city me located hai? (e.g. Pune, Delhi, Mumbai, Bengaluru)';
        }
        return 'In which city is your business located? (e.g., Delhi, Mumbai, Pune, Bengaluru)';

      case 'cityTier':
        if (language === 'Hindi') {
          return 'आपके शहर की दूरसंचार सर्कल श्रेणी (Telecom Circle Tier) की पुष्टि के लिए, क्या आप अपना निकटतम प्रमुख शहर बता सकते हैं?';
        }
        if (language === 'Hinglish') {
          return 'Aapke city ke telecom circle tier verification ke liye, kya aap apna nearest major city confirm kar sakte hai?';
        }
        return 'To verify the telecom circle tier for your location, could you please confirm your nearest major city or commercial district?';

      case 'employeeCount':
        if (language === 'Hindi') {
          return 'आपके कार्यालय या कारखाने में कुल कितने कर्मचारी (Employees / Staff) काम करते हैं?';
        }
        if (language === 'Hinglish') {
          return 'Aapki team me total kitne employees ya staff members kaam karte hai?';
        }
        return 'How many employees or staff members work at your business?';

      case 'numSites':
        if (language === 'Hindi') {
          return 'आपके पास कुल कितने कार्यालय, शाखाएं या दुकानें (Offices / Branches) हैं?';
        }
        if (language === 'Hinglish') {
          return 'Aapke total kitne offices, branches ya sites hai?';
        }
        return 'How many office locations, branches, or retail sites do you have?';

      case 'hasGstin':
        if (language === 'Hindi') {
          return 'क्या आपके व्यवसाय के पास पंजीकृत GSTIN (GST Number) उपलब्ध है?';
        }
        if (language === 'Hinglish') {
          return 'Kya aapke business ke paas registered GST number (GSTIN) available hai?';
        }
        return 'Do you have a registered GSTIN (GST number) for your enterprise?';

      case 'primaryNeed':
        if (language === 'Hindi') {
          return 'आपकी मुख्य दूरसंचार आवश्यकता क्या है (जैसे हाई-स्पीड इंटरनेट, सभी ब्रांचों को जोड़ना, कॉलिंग, बैकअप, या सीसीटीवी)?';
        }
        if (language === 'Hinglish') {
          return 'Aapki main telecom requirement kya hai (e.g. high-speed internet, branches connect karna, calling, backup, ya CCTV)?';
        }
        return 'What is your primary telecom need (e.g., high-speed internet, connecting branches, cloud calling, failover backup, or CCTV)?';

      default:
        return language === 'Hindi'
          ? 'कृपया अपनी आवश्यकता के बारे में कुछ और बताएं।'
          : 'Please tell me a bit more about your business telecom requirements.';
    }
  }
}
