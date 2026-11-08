import { Injectable, BadRequestException } from '@nestjs/common';
import { PropensityFactorDto } from '@udyamone/shared-types';

export interface PropensityEvaluationResult {
  score: number;
  priorityRank: 'HIGH' | 'MEDIUM' | 'LOW';
  priorityReason: string;
  recommendedAction: string;
  recoveryPitch: string;
  scoringFactors: PropensityFactorDto[];
}

export interface IntakeLeadProfile {
  businessName?: string;
  hasGstin?: boolean;
  hasUdyam?: boolean;
  employeeCount?: number;
  numSites?: number;
  monthlyTelecomSpendInr?: number | any;
  cityTier?: number;
}

export interface DroppedLeadProfile {
  stageReached?: string | null;
  dropReason?: string | null;
  hasGstin?: boolean;
  hasUdyam?: boolean;
  employeeCount?: number;
  numSites?: number;
  monthlyTelecomSpendInr?: number | any;
  businessName?: string;
  preferredLanguage?: string;
}

@Injectable()
export class PropensityService {
  /**
   * MODEL A — DAY-0 INTAKE PRIORITIZATION ENGINE (FOR NEWLY CAPTURED LEADS)
   *
   * Grounded strictly in Day-0 firmographic and regulatory credentials known at
   * initial lead capture. Zero funnel stage or terminal drop leakage.
   * Total score: 0 to 100 points.
   */
  evaluateIntakeLead(lead: IntakeLeadProfile): PropensityEvaluationResult {
    const factors: PropensityFactorDto[] = [];
    let score = 0;

    // 1. Regulatory Formalization (0 - 40 points)
    if (lead.hasGstin) {
      score += 25;
      factors.push({
        category: 'Regulatory Formalization',
        factor: 'HAS_ACTIVE_GSTIN',
        points: 25,
        maxPoints: 25,
        description: 'Verified active GSTIN registration enables full commercial compliance and enterprise plan eligibility.'
      });
    }

    if (lead.hasUdyam) {
      score += 15;
      factors.push({
        category: 'Regulatory Formalization',
        factor: 'HAS_UDYAM_REGISTRATION',
        points: 15,
        maxPoints: 15,
        description: 'Formal MSME certification under Udyam qualifies for prioritized government MSME onboarding SLA.'
      });
    }

    // 2. Commercial Footprint & Scale (0 - 30 points)
    const emp = lead.employeeCount || 1;
    let empPoints = 5;
    if (emp >= 20) empPoints = 15;
    else if (emp >= 5) empPoints = 10;
    score += empPoints;
    factors.push({
      category: 'Commercial Footprint',
      factor: 'EMPLOYEE_SCALE',
      points: empPoints,
      maxPoints: 15,
      description: `Organization workforce of ${emp} employee(s) establishes operational scale.`
    });

    const sites = lead.numSites || 1;
    let sitePoints = 5;
    if (sites >= 3) sitePoints = 15;
    else if (sites >= 2) sitePoints = 10;
    score += sitePoints;
    factors.push({
      category: 'Commercial Footprint',
      factor: 'SITE_FOOTPRINT',
      points: sitePoints,
      maxPoints: 15,
      description: `Multi-site operational presence across ${sites} branch location(s).`
    });

    // 3. Telecom Spend Budget (0 - 20 points)
    const spend = Number(lead.monthlyTelecomSpendInr) || 0;
    let spendPoints = 5;
    if (spend >= 5000) spendPoints = 20;
    else if (spend >= 2500) spendPoints = 10;
    score += spendPoints;
    factors.push({
      category: 'Telecom Budget',
      factor: 'MONTHLY_SPEND_POTENTIAL',
      points: spendPoints,
      maxPoints: 20,
      description: `Current telecom monthly expenditure of ₹${spend.toLocaleString('en-IN')}/mo reflects commercial budget tier.`
    });

    // 4. Infrastructure Readiness / City Tier (0 - 10 points)
    const tier = lead.cityTier || 2;
    const tierPoints = tier === 1 ? 10 : 5;
    score += tierPoints;
    factors.push({
      category: 'Infrastructure Readiness',
      factor: 'CITY_TIER_INFRASTRUCTURE',
      points: tierPoints,
      maxPoints: 10,
      description: `Location in Tier ${tier} market with established telecom POP and last-mile fiber availability.`
    });

    const finalScore = Math.min(100, Math.max(0, score));

    let priorityRank: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (finalScore >= 70) priorityRank = 'HIGH';
    else if (finalScore >= 45) priorityRank = 'MEDIUM';

    let priorityReason = '';
    let recommendedAction = '';
    const biz = lead.businessName || 'MSME Enterprise';

    if (priorityRank === 'HIGH') {
      priorityReason = `Score ${finalScore} (≥70): Formalized multi-site enterprise with verified credentials and strong commercial telecom budget.`;
      recommendedAction = `Route to Dedicated Enterprise Key Account Manager for expedited discovery and VIP onboarding.`;
    } else if (priorityRank === 'MEDIUM') {
      priorityReason = `Score ${finalScore} (45–69): Established business with active commercial registration or growing site footprint.`;
      recommendedAction = `Initiate consultative digital onboarding journey with automated package recommendations.`;
    } else {
      priorityReason = `Score ${finalScore} (<45): Micro-enterprise profile with basic connectivity requirements.`;
      recommendedAction = `Direct to self-service digital catalogue with instant KYC verification.`;
    }

    return {
      score: finalScore,
      priorityRank,
      priorityReason,
      recommendedAction,
      recoveryPitch: `Intake Consultation: Prioritize ${biz} for ${recommendedAction.toLowerCase()}`,
      scoringFactors: factors
    };
  }

  /**
   * MODEL B — OPERATIONAL RECOVERY TRIAGE ENGINE (FOR ABANDONED LEADS)
   *
   * Evaluates operational recovery feasibility and partner queue priority (0 to 100 points)
   * based on pre-drop funnel stage, addressable drop reason, regulatory readiness, and scale.
   *
   * NOTE: Activated leads are strictly excluded from the recovery queue.
   */
  evaluateRecoveryLead(lead: DroppedLeadProfile): PropensityEvaluationResult {
    const stage = (lead.stageReached || '').toLowerCase().trim();
    if (stage.includes('activated')) {
      throw new BadRequestException(
        `Invalid evaluation: Customer has already achieved 'Activated' status and cannot be processed in the abandoned lead recovery queue.`
      );
    }

    const factors: PropensityFactorDto[] = [];
    let score = 0;

    // 1. Pre-Drop Funnel Progress Factor (0 - 40 points)
    // Measures sunk intent and operational closeness to completion prior to drop
    if (stage.includes('kyc complete')) {
      score += 40;
      factors.push({
        category: 'Funnel Progress',
        factor: 'STAGE_KYC_COMPLETE',
        points: 40,
        maxPoints: 40,
        description: 'Deepest pre-drop funnel penetration with verified identity documents; ready for immediate link activation upon win-back.'
      });
    } else if (stage.includes('quote accepted')) {
      score += 30;
      factors.push({
        category: 'Funnel Progress',
        factor: 'STAGE_QUOTE_ACCEPTED',
        points: 30,
        maxPoints: 40,
        description: 'Commercial alignment established; customer approved pricing bundle prior to drop.'
      });
    } else if (stage.includes('needs assessed')) {
      score += 20;
      factors.push({
        category: 'Funnel Progress',
        factor: 'STAGE_NEEDS_ASSESSED',
        points: 20,
        maxPoints: 40,
        description: 'Requirements discovery completed; suitable enterprise bundle identified before drop.'
      });
    } else if (stage.includes('contacted')) {
      score += 10;
      factors.push({
        category: 'Funnel Progress',
        factor: 'STAGE_CONTACTED',
        points: 10,
        maxPoints: 40,
        description: 'Initial contact established with business authorized signatory.'
      });
    } else {
      score += 5;
      factors.push({
        category: 'Funnel Progress',
        factor: 'STAGE_TOP_OF_FUNNEL',
        points: 5,
        maxPoints: 40,
        description: 'Early top-of-funnel inquiry prior to abandonment.'
      });
    }

    // 2. Government Registry Readiness (0 - 25 points)
    if (lead.hasGstin) {
      score += 15;
      factors.push({
        category: 'Regulatory Compliance',
        factor: 'HAS_ACTIVE_GSTIN',
        points: 15,
        maxPoints: 15,
        description: 'Active GSTIN registered; eligible for all wireline, SD-WAN, and leased line enterprise packages.'
      });
    }

    if (lead.hasUdyam) {
      score += 10;
      factors.push({
        category: 'Regulatory Compliance',
        factor: 'HAS_UDYAM_REGISTRATION',
        points: 10,
        maxPoints: 10,
        description: 'Formal MSME certification under Udyam; eligible for MSME priority onboarding SLA.'
      });
    }

    // 3. Scale & Spend Potential (0 - 20 points)
    const employees = lead.employeeCount || 1;
    const sites = lead.numSites || 1;
    if (sites >= 3 || employees >= 10) {
      score += 10;
      factors.push({
        category: 'Scale & Revenue Potential',
        factor: 'ENTERPRISE_SCALE',
        points: 10,
        maxPoints: 10,
        description: `Substantial commercial footprint (${employees} employees, ${sites} sites).`
      });
    }

    const spend = Number(lead.monthlyTelecomSpendInr) || 0;
    if (spend >= 2000) {
      score += 10;
      factors.push({
        category: 'Scale & Revenue Potential',
        factor: 'HIGH_ARPU_SPEND',
        points: 10,
        maxPoints: 10,
        description: `Existing monthly spend ₹${spend.toLocaleString('en-IN')}/mo indicates high-value commercial budget.`
      });
    }

    // 4. Drop Reason Recoverability (0 - 15 points)
    const reason = (lead.dropReason || '').toLowerCase();
    let recoverabilityPoints = 0;
    let recoverabilityCategory = '';
    let recoverabilityDesc = '';

    if (
      reason.includes('installation delay') ||
      reason.includes('delayed') ||
      reason.includes('document collection') ||
      reason.includes('wait') ||
      reason.includes('timing') ||
      reason.includes('follow up')
    ) {
      recoverabilityPoints = 15;
      recoverabilityCategory = 'HIGH_OPERATIONAL_RECOVERABILITY';
      recoverabilityDesc = `Addressable friction (${lead.dropReason}). Fast-track technician dispatch or doorstep KYC will recover this account.`;
    } else if (
      reason.includes('price') ||
      reason.includes('competitor') ||
      reason.includes('budget') ||
      reason.includes('discount')
    ) {
      recoverabilityPoints = 10;
      recoverabilityCategory = 'COMMERCIAL_NEGOTIATION_RECOVERABLE';
      recoverabilityDesc = `Commercial negotiation opportunity (${lead.dropReason}). Accel Partner discount or bundled value add-on can win account.`;
    } else if (reason.includes('not interested') || reason.includes('closed') || reason.includes('unreachable')) {
      recoverabilityPoints = 0;
      recoverabilityCategory = 'LOW_RECOVERABILITY';
      recoverabilityDesc = `Challenging drop reason (${lead.dropReason}). Requires re-qualification of business need.`;
    } else {
      recoverabilityPoints = 5;
      recoverabilityCategory = 'MODERATE_RECOVERABILITY';
      recoverabilityDesc = `General drop reason (${lead.dropReason || 'Unspecified'}). Targeted partner callback recommended.`;
    }

    score += recoverabilityPoints;
    factors.push({
      category: 'Recoverability Assessment',
      factor: recoverabilityCategory,
      points: recoverabilityPoints,
      maxPoints: 15,
      description: recoverabilityDesc
    });

    const finalScore = Math.min(100, Math.max(0, score));

    let priorityRank: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (finalScore >= 70) priorityRank = 'HIGH';
    else if (finalScore >= 45) priorityRank = 'MEDIUM';

    let priorityReason = '';
    let recommendedAction = '';

    if (priorityRank === 'HIGH') {
      priorityReason = `Score ${finalScore} (≥70): Deep pre-drop funnel progress and addressable operational friction qualify this lead as High Priority Win-Back.`;
      recommendedAction = `Immediate on-site partner visit or senior relationship callback offering 48-hr expedited installation and doorstep verification.`;
    } else if (priorityRank === 'MEDIUM') {
      priorityReason = `Score ${finalScore} (45–69): Moderate engagement depth or commercial price sensitivity; recoverable through commercial negotiation.`;
      recommendedAction = `Issue tailored commercial re-quote addressing competitor pricing with waived setup fee on annual commitment.`;
    } else {
      priorityReason = `Score ${finalScore} (<45): Early-stage drop-off or low commercial qualification requiring re-discovery of connectivity needs.`;
      recommendedAction = `Engage via automated WhatsApp/SMS check-in before committing field partner resources.`;
    }

    const pitch = this.generateRecoveryPitch(lead, finalScore, priorityRank);

    return {
      score: finalScore,
      priorityRank,
      priorityReason,
      recommendedAction,
      recoveryPitch: pitch,
      scoringFactors: factors
    };
  }

  /**
   * Backward-compatible alias for evaluateRecoveryLead (Model B)
   */
  evaluateLead(lead: DroppedLeadProfile): PropensityEvaluationResult {
    return this.evaluateRecoveryLead(lead);
  }

  private generateRecoveryPitch(
    lead: {
      businessName?: string;
      stageReached?: string | null;
      dropReason?: string | null;
      preferredLanguage?: string;
      hasGstin?: boolean;
    },
    score: number,
    rank: string
  ): string {
    const biz = lead.businessName || 'Business Owner';
    const reason = lead.dropReason || 'onboarding delay';
    const stage = lead.stageReached || 'Needs assessed';

    if (rank === 'HIGH') {
      return `Priority Win-Back Opportunity: ${biz} reached '${stage}' before dropping due to '${reason}'. Recommend immediate on-site partner visit or dedicated relationship call offering expedited installation within 48 hours and complimentary static IP setup.`;
    } else if (rank === 'MEDIUM') {
      return `Commercial Recovery Call: ${biz} expressed interest at '${stage}'. Drop reason cited: '${reason}'. Partner action: Share custom bundle quote addressing competitor pricing with zero one-time setup fee on 12-month commitment.`;
    } else {
      return `Standard Follow-up: Re-engage ${biz} via WhatsApp/phone in ${lead.preferredLanguage || 'preferred language'} to re-validate telecom connectivity requirements for their current office setup.`;
    }
  }
}
