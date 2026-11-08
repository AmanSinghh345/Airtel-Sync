-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('MICRO_RETAIL', 'PROFESSIONAL_OFFICE', 'MULTI_SITE', 'MANUFACTURING');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('CONNECTIVITY', 'COMMUNICATION', 'CLOUD_PRODUCTIVITY', 'SECURITY', 'IOT_PHYSICAL');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'PRESENTED', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('ORDER_RECEIVED', 'KYC_VALIDATED', 'FEASIBILITY_CLEARED', 'TECHNICIAN_DISPATCHED', 'INSTALLED_AND_ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KycDecisionStatus" AS ENUM ('PENDING', 'PROCESSING', 'VERIFIED', 'OVERRIDDEN_VERIFIED', 'MANUAL_REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('GST_CERTIFICATE', 'UDYAM_CERTIFICATE', 'SIGNATORY_ID', 'ADDRESS_PROOF', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentQualityStatus" AS ENUM ('ACCEPTABLE', 'FLAGGED_BLUR', 'FLAGGED_SKEW', 'FLAGGED_LOW_CONFIDENCE', 'UNREADABLE');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('DPDP_KYC_VERIFICATION', 'MARKETING_COMMUNICATION', 'CREDIT_ASSESSMENT');

-- CreateEnum
CREATE TYPE "TriggeredBy" AS ENUM ('SYSTEM', 'CUSTOMER', 'PARTNER', 'TECHNICIAN', 'ADMIN_OVERRIDE');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('UNASSIGNED', 'ASSIGNED', 'CONTACTED', 'RECOVERED', 'CLOSED_LOST');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('PHONE_CALL', 'IN_PERSON_VISIT', 'WHATSAPP_MESSAGE', 'NOTE', 'STATUS_CHANGE');

-- CreateTable
CREATE TABLE "GstinRegistry" (
    "gstin" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "constitution" TEXT NOT NULL,
    "principalPlaceOfBusiness" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "registrationDate" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GstinRegistry_pkey" PRIMARY KEY ("gstin")
);

-- CreateTable
CREATE TABLE "UdyamRegistry" (
    "udyamNumber" TEXT NOT NULL,
    "enterpriseName" TEXT NOT NULL,
    "enterpriseType" TEXT NOT NULL,
    "majorActivity" TEXT NOT NULL,
    "nicDescription" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "dateOfRegistration" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UdyamRegistry_pkey" PRIMARY KEY ("udyamNumber")
);

-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "constitution" TEXT NOT NULL,
    "segment" "Segment" NOT NULL,
    "city" TEXT NOT NULL,
    "cityTier" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT,
    "hasGstin" BOOLEAN NOT NULL DEFAULT false,
    "gstin" TEXT,
    "hasUdyam" BOOLEAN NOT NULL DEFAULT false,
    "udyamNumber" TEXT,
    "employeeCount" INTEGER NOT NULL DEFAULT 1,
    "numSites" INTEGER NOT NULL DEFAULT 1,
    "annualTurnoverBand" TEXT,
    "currentInternet" TEXT,
    "currentProvider" TEXT,
    "monthlySpendInr" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessRequirement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "rawPrompt" TEXT,
    "extractedJson" JSONB NOT NULL,
    "budgetMaxInr" DECIMAL(12,2),
    "connectivityType" TEXT,
    "criticalNeed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "sessionToken" TEXT NOT NULL,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'Hindi',
    "messages" JSONB NOT NULL,
    "extractedEntities" JSONB,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "productName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "priceMinInr" DECIMAL(10,2) NOT NULL,
    "priceMaxInr" DECIMAL(10,2) NOT NULL,
    "oneTimeSetupInr" DECIMAL(10,2) NOT NULL,
    "minContractMonths" INTEGER NOT NULL,
    "minEmployees" INTEGER NOT NULL DEFAULT 1,
    "minSites" INTEGER NOT NULL DEFAULT 1,
    "requiresGstin" BOOLEAN NOT NULL DEFAULT false,
    "typicalInstallDays" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCityTier" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "cityTier" INTEGER NOT NULL,

    CONSTRAINT "ProductCityTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTargetSegment" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "segment" "Segment" NOT NULL,

    CONSTRAINT "ProductTargetSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPrerequisite" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "prerequisiteProductId" TEXT NOT NULL,

    CONSTRAINT "ProductPrerequisite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "requirementId" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "contractMonths" INTEGER NOT NULL DEFAULT 12,
    "monthlyRecurringInr" DECIMAL(12,2) NOT NULL,
    "oneTimeSetupInr" DECIMAL(12,2) NOT NULL,
    "isIndicative" BOOLEAN NOT NULL DEFAULT true,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceInr" DECIMAL(10,2) NOT NULL,
    "unitSetupInr" DECIMAL(10,2) NOT NULL,
    "totalPriceInr" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kycVerificationId" TEXT,
    "consentType" "ConsentType" NOT NULL DEFAULT 'DPDP_KYC_VERIFICATION',
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "purposeText" TEXT NOT NULL,
    "dataFieldsCovered" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "consentTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycVerification" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT,
    "status" "KycDecisionStatus" NOT NULL DEFAULT 'PENDING',
    "gstinVerified" BOOLEAN NOT NULL DEFAULT false,
    "gstinStatus" TEXT,
    "udyamVerified" BOOLEAN NOT NULL DEFAULT false,
    "nameMatchScore" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "addressMatchScore" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "signatoryMatchScore" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "detectedDefects" JSONB NOT NULL DEFAULT '[]',
    "reviewerNotes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycDocument" (
    "id" TEXT NOT NULL,
    "kycVerificationId" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "storagePath" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "rotationAngle" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "isBlurred" BOOLEAN NOT NULL DEFAULT false,
    "blurVariance" DECIMAL(8,2),
    "qualityStatus" "DocumentQualityStatus" NOT NULL DEFAULT 'ACCEPTABLE',
    "ocrConfidence" DECIMAL(5,2),
    "rawOcrText" TEXT NOT NULL,
    "parsedData" JSONB NOT NULL,
    "defectCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycAuditLog" (
    "id" TEXT NOT NULL,
    "kycVerificationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousStatus" "KycDecisionStatus" NOT NULL,
    "newStatus" "KycDecisionStatus" NOT NULL,
    "authorizerUserId" TEXT NOT NULL,
    "authorizerRole" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonText" TEXT NOT NULL,
    "overridePayloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "trackingTokenHash" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "partnerId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'ORDER_RECEIVED',
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "installationAddress" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "calculatedSlaDays" INTEGER NOT NULL DEFAULT 5,
    "estimatedActiveDate" DATE NOT NULL,
    "actualActivatedDate" DATE,
    "assignedTechnician" TEXT,
    "technicianPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceInr" DECIMAL(10,2) NOT NULL,
    "unitSetupInr" DECIMAL(10,2) NOT NULL,
    "siteIndex" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "eventName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "triggeredBy" "TriggeredBy" NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "partnerCode" TEXT NOT NULL,
    "agencyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "territoryCity" TEXT NOT NULL,
    "commissionRate" DECIMAL(5,2) NOT NULL DEFAULT 10.0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DroppedLead" (
    "id" TEXT NOT NULL,
    "originalCreatedDate" DATE,
    "leadSource" TEXT,
    "businessName" TEXT NOT NULL,
    "businessType" TEXT,
    "segment" "Segment" NOT NULL,
    "city" TEXT NOT NULL,
    "cityTier" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "preferredLanguage" TEXT NOT NULL,
    "employeeCount" INTEGER NOT NULL DEFAULT 1,
    "numSites" INTEGER NOT NULL DEFAULT 1,
    "annualTurnoverBand" TEXT,
    "hasGstin" BOOLEAN NOT NULL DEFAULT false,
    "gstin" TEXT,
    "hasUdyam" BOOLEAN NOT NULL DEFAULT false,
    "udyamNumber" TEXT,
    "currentInternet" TEXT,
    "currentProvider" TEXT,
    "monthlyTelecomSpendInr" DECIMAL(12,2),
    "productsOfInterest" TEXT,
    "contactName" TEXT NOT NULL,
    "contactRole" TEXT,
    "stageReached" TEXT NOT NULL,
    "dropReason" TEXT NOT NULL,
    "propensityScore" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "propensityRank" TEXT NOT NULL DEFAULT 'LOW',
    "recoveryPitch" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "assignedPartnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DroppedLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "droppedLeadId" TEXT NOT NULL,
    "partnerId" TEXT,
    "activityType" "ActivityType" NOT NULL,
    "notes" TEXT NOT NULL,
    "outcome" TEXT,
    "followUpDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GstinRegistry_tradeName_idx" ON "GstinRegistry"("tradeName");

-- CreateIndex
CREATE INDEX "GstinRegistry_status_idx" ON "GstinRegistry"("status");

-- CreateIndex
CREATE INDEX "GstinRegistry_state_idx" ON "GstinRegistry"("state");

-- CreateIndex
CREATE INDEX "UdyamRegistry_enterpriseName_idx" ON "UdyamRegistry"("enterpriseName");

-- CreateIndex
CREATE INDEX "UdyamRegistry_city_idx" ON "UdyamRegistry"("city");

-- CreateIndex
CREATE INDEX "UdyamRegistry_state_idx" ON "UdyamRegistry"("state");

-- CreateIndex
CREATE INDEX "Business_gstin_idx" ON "Business"("gstin");

-- CreateIndex
CREATE INDEX "Business_udyamNumber_idx" ON "Business"("udyamNumber");

-- CreateIndex
CREATE INDEX "Business_segment_idx" ON "Business"("segment");

-- CreateIndex
CREATE INDEX "Business_city_idx" ON "Business"("city");

-- CreateIndex
CREATE INDEX "BusinessRequirement_businessId_idx" ON "BusinessRequirement"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_sessionToken_key" ON "Conversation"("sessionToken");

-- CreateIndex
CREATE INDEX "Conversation_sessionToken_idx" ON "Conversation"("sessionToken");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_requiresGstin_idx" ON "Product"("requiresGstin");

-- CreateIndex
CREATE INDEX "ProductCityTier_cityTier_idx" ON "ProductCityTier"("cityTier");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCityTier_productId_cityTier_key" ON "ProductCityTier"("productId", "cityTier");

-- CreateIndex
CREATE INDEX "ProductTargetSegment_segment_idx" ON "ProductTargetSegment"("segment");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTargetSegment_productId_segment_key" ON "ProductTargetSegment"("productId", "segment");

-- CreateIndex
CREATE INDEX "ProductPrerequisite_productId_idx" ON "ProductPrerequisite"("productId");

-- CreateIndex
CREATE INDEX "ProductPrerequisite_prerequisiteProductId_idx" ON "ProductPrerequisite"("prerequisiteProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPrerequisite_productId_prerequisiteProductId_key" ON "ProductPrerequisite"("productId", "prerequisiteProductId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_quoteNumber_key" ON "Quote"("quoteNumber");

-- CreateIndex
CREATE INDEX "Quote_quoteNumber_idx" ON "Quote"("quoteNumber");

-- CreateIndex
CREATE INDEX "Quote_businessId_idx" ON "Quote"("businessId");

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_idx" ON "QuoteItem"("quoteId");

-- CreateIndex
CREATE INDEX "QuoteItem_productId_idx" ON "QuoteItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteItem_quoteId_productId_key" ON "QuoteItem"("quoteId", "productId");

-- CreateIndex
CREATE INDEX "ConsentRecord_businessId_idx" ON "ConsentRecord"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "KycVerification_orderId_key" ON "KycVerification"("orderId");

-- CreateIndex
CREATE INDEX "KycVerification_businessId_idx" ON "KycVerification"("businessId");

-- CreateIndex
CREATE INDEX "KycVerification_status_idx" ON "KycVerification"("status");

-- CreateIndex
CREATE INDEX "KycDocument_kycVerificationId_idx" ON "KycDocument"("kycVerificationId");

-- CreateIndex
CREATE INDEX "KycDocument_documentType_idx" ON "KycDocument"("documentType");

-- CreateIndex
CREATE INDEX "KycAuditLog_kycVerificationId_idx" ON "KycAuditLog"("kycVerificationId");

-- CreateIndex
CREATE INDEX "KycAuditLog_authorizerUserId_idx" ON "KycAuditLog"("authorizerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingTokenHash_key" ON "Order"("trackingTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Order_quoteId_key" ON "Order"("quoteId");

-- CreateIndex
CREATE INDEX "Order_orderNumber_idx" ON "Order"("orderNumber");

-- CreateIndex
CREATE INDEX "Order_trackingTokenHash_idx" ON "Order"("trackingTokenHash");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_businessId_idx" ON "Order"("businessId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_idx" ON "OrderEvent"("orderId");

-- CreateIndex
CREATE INDEX "OrderEvent_createdAt_idx" ON "OrderEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_partnerCode_key" ON "Partner"("partnerCode");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_email_key" ON "Partner"("email");

-- CreateIndex
CREATE INDEX "Partner_partnerCode_idx" ON "Partner"("partnerCode");

-- CreateIndex
CREATE INDEX "Partner_territoryCity_idx" ON "Partner"("territoryCity");

-- CreateIndex
CREATE INDEX "DroppedLead_stageReached_idx" ON "DroppedLead"("stageReached");

-- CreateIndex
CREATE INDEX "DroppedLead_propensityScore_idx" ON "DroppedLead"("propensityScore");

-- CreateIndex
CREATE INDEX "DroppedLead_assignedPartnerId_idx" ON "DroppedLead"("assignedPartnerId");

-- CreateIndex
CREATE INDEX "DroppedLead_city_idx" ON "DroppedLead"("city");

-- CreateIndex
CREATE INDEX "LeadActivity_droppedLeadId_idx" ON "LeadActivity"("droppedLeadId");

-- AddForeignKey
ALTER TABLE "BusinessRequirement" ADD CONSTRAINT "BusinessRequirement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCityTier" ADD CONSTRAINT "ProductCityTier_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTargetSegment" ADD CONSTRAINT "ProductTargetSegment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrerequisite" ADD CONSTRAINT "ProductPrerequisite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrerequisite" ADD CONSTRAINT "ProductPrerequisite_prerequisiteProductId_fkey" FOREIGN KEY ("prerequisiteProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "BusinessRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_kycVerificationId_fkey" FOREIGN KEY ("kycVerificationId") REFERENCES "KycVerification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycVerification" ADD CONSTRAINT "KycVerification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycVerification" ADD CONSTRAINT "KycVerification_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_kycVerificationId_fkey" FOREIGN KEY ("kycVerificationId") REFERENCES "KycVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycAuditLog" ADD CONSTRAINT "KycAuditLog_kycVerificationId_fkey" FOREIGN KEY ("kycVerificationId") REFERENCES "KycVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DroppedLead" ADD CONSTRAINT "DroppedLead_assignedPartnerId_fkey" FOREIGN KEY ("assignedPartnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_droppedLeadId_fkey" FOREIGN KEY ("droppedLeadId") REFERENCES "DroppedLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
