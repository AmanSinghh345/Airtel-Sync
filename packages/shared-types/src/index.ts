export enum Segment {
  MICRO_RETAIL = 'MICRO_RETAIL',
  PROFESSIONAL_OFFICE = 'PROFESSIONAL_OFFICE',
  MULTI_SITE = 'MULTI_SITE',
  MANUFACTURING = 'MANUFACTURING'
}

export enum ProductCategory {
  CONNECTIVITY = 'CONNECTIVITY',
  COMMUNICATION = 'COMMUNICATION',
  CLOUD_PRODUCTIVITY = 'CLOUD_PRODUCTIVITY',
  SECURITY = 'SECURITY',
  IOT_PHYSICAL = 'IOT_PHYSICAL'
}

export enum QuoteStatus {
  DRAFT = 'DRAFT',
  PRESENTED = 'PRESENTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED'
}

export enum OrderStatus {
  ORDER_RECEIVED = 'ORDER_RECEIVED',
  KYC_VALIDATED = 'KYC_VALIDATED',
  FEASIBILITY_CLEARED = 'FEASIBILITY_CLEARED',
  TECHNICIAN_DISPATCHED = 'TECHNICIAN_DISPATCHED',
  INSTALLED_AND_ACTIVE = 'INSTALLED_AND_ACTIVE',
  CANCELLED = 'CANCELLED'
}

export enum KycDecisionStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  VERIFIED = 'VERIFIED',
  OVERRIDDEN_VERIFIED = 'OVERRIDDEN_VERIFIED',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
  REJECTED = 'REJECTED'
}

export enum DocumentType {
  GST_CERTIFICATE = 'GST_CERTIFICATE',
  UDYAM_CERTIFICATE = 'UDYAM_CERTIFICATE',
  SIGNATORY_ID = 'SIGNATORY_ID',
  ADDRESS_PROOF = 'ADDRESS_PROOF',
  OTHER = 'OTHER'
}

export enum TriggeredBy {
  SYSTEM = 'SYSTEM',
  CUSTOMER = 'CUSTOMER',
  PARTNER = 'PARTNER',
  TECHNICIAN = 'TECHNICIAN',
  ADMIN_OVERRIDE = 'ADMIN_OVERRIDE'
}

export enum StaffRole {
  COMPLIANCE_OFFICER = 'COMPLIANCE_OFFICER',
  ADMIN = 'ADMIN',
  OPERATIONS = 'OPERATIONS',
  TECHNICIAN = 'TECHNICIAN',
  PARTNER = 'PARTNER'
}

export interface StaffLoginRequestDto {
  email: string;
  password: string;
}

export interface StaffLoginResponseDto {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: StaffRole;
    partnerId?: string | null;
  };
}

export interface StaffJwtPayload {
  sub: string;
  email: string;
  fullName: string;
  role: StaffRole;
  partnerId?: string | null;
  iss: string;
  aud: string;
  iat?: number;
  exp?: number;
}

export interface HealthCheckResponse {
  status: 'UP' | 'DOWN';
  timestamp: string;
  database: {
    connected: boolean;
    error?: string;
  };
  version: string;
}

export interface ProductPrerequisiteDto {
  productId: string;
  prerequisiteProductId: string;
  prerequisiteProductName?: string;
}

export interface ProductDto {
  id: string;
  category: ProductCategory;
  productName: string;
  description: string;
  unit: string;
  priceMinInr: number;
  priceMaxInr: number;
  oneTimeSetupInr: number;
  minContractMonths: number;
  minEmployees: number;
  minSites: number;
  requiresGstin: boolean;
  typicalInstallDays: number;
  isActive: boolean;
  availableCityTiers: number[];
  targetSegments: Segment[];
  prerequisites: string[]; // List of IDs where at least one is required
}

export interface LeadProfileDto {
  businessId?: string;
  segment?: Segment;
  cityTier?: number;
  employeeCount?: number;
  numSites?: number;
  hasGstin?: boolean;
  existingProductIds?: string[];
}

export interface BundleItemDto {
  productId: string;
  quantity: number;
  configuredUnitPriceInr?: number; // Optional indicative override within [priceMin, priceMax]
}

export interface BundleValidationError {
  productId: string;
  code:
    | 'PREREQUISITE_MISSING'
    | 'CITY_TIER_INCOMPATIBLE'
    | 'GSTIN_REQUIRED'
    | 'INSUFFICIENT_EMPLOYEES'
    | 'INSUFFICIENT_SITES'
    | 'PRODUCT_INACTIVE'
    | 'PRODUCT_NOT_FOUND'
    | 'INVALID_QUANTITY';
  message: string;
  details?: Record<string, any>;
}

export interface BundleValidationResult {
  valid: boolean;
  errors: BundleValidationError[];
  warnings: string[];
  eligibleProducts: string[];
  installationSlaDays: number;
}

export interface QuoteItemCalculation {
  productId: string;
  productName: string;
  category: ProductCategory;
  unit: string;
  quantity: number;
  unitPriceInr: number;
  unitSetupInr: number;
  totalMonthlyInr: number;
  totalSetupInr: number;
  rangeMinMonthlyInr: number;
  rangeMaxMonthlyInr: number;
}

export interface QuoteBreakdownDto {
  quoteNumber?: string;
  businessId?: string;
  contractMonths: number;
  items: QuoteItemCalculation[];
  subtotalMonthlyInr: number;
  discountPercent: number;
  discountAmountMonthlyInr: number;
  netMonthlyInr: number;
  taxPercent: number;
  taxAmountMonthlyInr: number;
  totalMonthlyRecurringInr: number;
  subtotalSetupInr: number;
  taxAmountSetupInr: number;
  totalOneTimeSetupInr: number;
  totalIndicativeFirstYearInr: number;
  isIndicative: boolean;
  validUntil: string;
  installationSlaDays: number;
  notes: string[];
}

export interface CalculateQuoteRequestDto {
  businessId?: string;
  businessProfile?: LeadProfileDto;
  items: BundleItemDto[];
  contractMonths?: number;
  discountPercent?: number; // Sourced or configurable, e.g. 0 or 10
  taxPercent?: number;      // Sourced or configurable, e.g. 0 or 18
  save?: boolean;           // Whether to persist as a formal Quote in DB
}

export interface ExtractedBusinessIntent {
  businessName?: string;
  segment?: Segment;
  city?: string;
  cityTier?: number; // 1 or 2
  state?: string;
  employeeCount?: number;
  numSites?: number;
  hasGstin?: boolean;
  gstin?: string;
  hasUdyam?: boolean;
  udyamNumber?: string;
  monthlyBudgetInr?: number;
  primaryNeed?: string;
  intendedCategories?: ProductCategory[];
  specificProductInterests?: string[];
  confidenceScore?: number;
}

export interface AdvisorTurnRequestDto {
  sessionToken?: string;
  message: string;
  preferredLanguage?: 'Hindi' | 'English' | 'Hinglish' | string;
  businessId?: string;
}

export interface ProductRecommendationDto {
  productId: string;
  productName: string;
  quantity: number;
  reason: string;
  indicativeMonthlyInr: number;
  oneTimeSetupInr: number;
}

export interface AdvisorRecommendationResult {
  summary: string;
  items: ProductRecommendationDto[];
  quote?: QuoteBreakdownDto;
  installationSlaDays: number;
}

export interface AdvisorTurnResponseDto {
  sessionToken: string;
  reply: string;
  preferredLanguage: string;
  extractedEntities: ExtractedBusinessIntent;
  missingFields: string[];
  isComplete: boolean;
  recommendation?: AdvisorRecommendationResult;
}

export interface ConversationSessionDto {
  sessionToken: string;
  preferredLanguage: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: string }>;
  extractedEntities?: ExtractedBusinessIntent;
  isCompleted: boolean;
  businessId?: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// KYC & DPDP CONSENT DTOs
// ==========================================

export interface RecordConsentRequestDto {
  businessId: string;
  consentType?: string;
  purposeText?: string;
  dataFieldsCovered?: string;
  retentionDays?: number;
}

export interface RecordConsentResponseDto {
  consentId: string;
  businessId: string;
  consentGiven: boolean;
  consentTimestamp: string;
  retentionDays: number;
  revokedAt?: string | null;
}

export interface KycDocumentItemDto {
  id?: string;
  documentType: DocumentType;
  originalFilename: string;
  qualityStatus: string;
  isBlurred: boolean;
  blurVariance?: number;
  rawOcrText: string;
  parsedData: Record<string, any>;
  defectCode?: string | null;
}

export interface KycVerificationResultDto {
  verificationId: string;
  businessId: string;
  status: KycDecisionStatus;
  gstinVerified: boolean;
  gstinStatus?: string;
  udyamVerified: boolean;
  nameMatchScore: number;
  addressMatchScore: number;
  signatoryMatchScore: number;
  detectedDefects: string[];
  reviewerNotes?: string;
  canProceedToCheckout: boolean;
  documents: KycDocumentItemDto[];
  verifiedAt?: string | null;
}

export interface KycOverrideRequestDto {
  verificationId: string;
  authorizerUserId: string;
  authorizerRole: 'COMPLIANCE_OFFICER' | 'ADMIN';
  reasonCode: string;
  reasonText: string;
}

export interface CheckoutEligibilityDto {
  businessId: string;
  eligible: boolean;
  kycStatus: KycDecisionStatus;
  reason?: string;
}

// ==========================================
// CHECKOUT, ORDER & TRACKING DTOs (PHASE 5)
// ==========================================

export interface CheckoutRequestDto {
  quoteId: string;
  businessId: string;
  contactName: string;
  contactPhone: string;
  installationAddress: string;
  city: string;
  state: string;
  pincode: string;
  idempotencyKey?: string;
}

export interface CheckoutResponseDto {
  orderId: string;
  orderNumber: string; // ORD-2026-XXXXX
  trackingToken: string; // High-entropy secret token (returned only once!)
  status: OrderStatus;
  calculatedSlaDays: number;
  estimatedActiveDate: string; // YYYY-MM-DD
  isGuaranteedSla: boolean;
  totalMonthlyRecurringInr: number;
  totalOneTimeSetupInr: number;
  totalIndicativeFirstYearInr: number;
  createdAt: string;
  itemCount: number;
  trackingUrl: string;
}

export interface OrderTransitionRequestDto {
  toStatus: OrderStatus;
  reason?: string;
  notes?: string;
  assignedTechnician?: string;
  technicianPhone?: string;
}

export interface OrderTimelineStepDto {
  stepStatus: OrderStatus;
  title: string;
  description: string;
  state: 'COMPLETED' | 'CURRENT' | 'PENDING' | 'CANCELLED';
  completedAt?: string | null;
}

export interface PublicTrackingResponseDto {
  orderNumber: string;
  currentStatus: OrderStatus;
  statusDescription: string;
  progressPercentage: number;
  steps: OrderTimelineStepDto[];
  installationSla: {
    calculatedSlaDays: number;
    estimatedActiveDate: string;
    isGuaranteed: boolean;
    slaStartTimestamp: string;
    remainingDays: number;
    disclaimer: string;
  };
  maskedCustomer: {
    companyTradeName: string;
    contactName: string;
    contactPhone: string;
    city: string;
    state: string;
    installationAddress: string;
  };
  items: Array<{
    productName: string;
    category: ProductCategory;
    quantity: number;
  }>;
  recentEvents: Array<{
    eventName: string;
    description: string;
    timestamp: string;
  }>;
}

export interface OrderDetailDto {
  id: string;
  orderNumber: string;
  businessId: string;
  businessName: string;
  quoteId: string;
  quoteNumber: string;
  status: OrderStatus;
  contactName: string;
  contactPhone: string;
  installationAddress: string;
  city: string;
  state: string;
  pincode: string;
  calculatedSlaDays: number;
  estimatedActiveDate: string;
  actualActivatedDate?: string | null;
  assignedTechnician?: string | null;
  technicianPhone?: string | null;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPriceInr: number;
    unitSetupInr: number;
    siteIndex: number;
  }>;
  events: Array<{
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    eventName: string;
    description: string;
    triggeredBy: TriggeredBy;
    createdAt: string;
    metadata?: any;
  }>;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// PHASE 6: PARTNER PORTAL & LEAD RECOVERY
// ==========================================

export enum LeadStatus {
  UNASSIGNED = 'UNASSIGNED',
  ASSIGNED = 'ASSIGNED',
  CONTACTED = 'CONTACTED',
  RECOVERED = 'RECOVERED',
  CLOSED_LOST = 'CLOSED_LOST'
}

export enum ActivityType {
  PHONE_CALL = 'PHONE_CALL',
  IN_PERSON_VISIT = 'IN_PERSON_VISIT',
  WHATSAPP_MESSAGE = 'WHATSAPP_MESSAGE',
  NOTE = 'NOTE',
  STATUS_CHANGE = 'STATUS_CHANGE'
}

export interface DroppedLeadListItemDto {
  id: string;
  businessName: string;
  businessType?: string | null;
  segment: Segment;
  city: string;
  cityTier: number;
  state: string;
  contactName: string;
  contactRole?: string | null;
  stageReached: string;
  dropReason: string;
  propensityScore: number;
  propensityRank: 'HIGH' | 'MEDIUM' | 'LOW';
  status: LeadStatus;
  assignedPartnerId?: string | null;
  assignedPartnerName?: string | null;
  monthlySpendInr?: number | null;
  hasGstin: boolean;
  hasUdyam: boolean;
  createdAt: string;
}

export interface PropensityFactorDto {
  category: string;
  factor: string;
  points: number;
  maxPoints?: number;
  description: string;
}

export interface DroppedLeadDetailDto extends DroppedLeadListItemDto {
  employeeCount: number;
  numSites: number;
  annualTurnoverBand?: string | null;
  gstin?: string | null;
  udyamNumber?: string | null;
  currentInternet?: string | null;
  currentProvider?: string | null;
  productsOfInterest?: string | null;
  preferredLanguage: string;
  recoveryPitch: string;
  priorityReason?: string;
  recommendedAction?: string;
  scoringFactors: PropensityFactorDto[];
  activities: LeadActivityDto[];
}

export interface LeadActivityDto {
  id: string;
  droppedLeadId: string;
  partnerId?: string | null;
  partnerName?: string | null;
  activityType: ActivityType;
  notes: string;
  outcome?: string | null;
  followUpDate?: string | null;
  createdAt: string;
}

export interface RecordLeadActivityDto {
  activityType: ActivityType;
  notes: string;
  outcome?: string;
  followUpDate?: string;
  nextStatus?: LeadStatus;
}

export interface UpdateLeadStatusDto {
  status: LeadStatus;
  notes?: string;
  outcome?: string;
}

export interface AssignLeadDto {
  leadId: string;
  partnerId: string;
  notes?: string;
}

export interface PartnerDashboardMetricsDto {
  partnerId: string;
  partnerCode: string;
  agencyName: string;
  territoryCity: string;
  totalAssignedLeads: number;
  contactedLeads: number;
  recoveredLeads: number;
  closedLostLeads: number;
  recoveryRatePercent: number;
  estimatedCommissionInr: number;
  highPriorityCount: number;
}

export interface FunnelStageMetricDto {
  stage: string;
  leadCount: number;
  conversionPercentFromTotal: number;
  dropCount: number;
  dropRatePercent: number;
}

export interface FunnelAnalyticsDto {
  totalLeads: number;
  totalActivated: number;
  totalDropped: number;
  overallActivationRatePercent: number;
  overallDropRatePercent: number;
  funnelStages: FunnelStageMetricDto[];
}

export interface DropReasonAnalyticsDto {
  reason: string;
  count: number;
  percentage: number;
  recoverableCategory: 'HIGH_RECOVERABILITY' | 'COMMERCIAL_NEGOTIATION' | 'UNRECOVERABLE';
}

export interface SegmentAnalyticsDto {
  segment: Segment;
  totalLeads: number;
  activatedLeads: number;
  droppedLeads: number;
  conversionRatePercent: number;
}

export interface PartnerPerformanceDto {
  partnerId: string;
  partnerCode: string;
  agencyName: string;
  territoryCity: string;
  assignedLeads: number;
  activitiesLogged: number;
  recoveredLeads: number;
  recoveryRatePercent: number;
  estimatedRevenueInr: number;
  commissionEarnedInr: number;
}
