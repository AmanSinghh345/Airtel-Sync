import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { DocumentType } from '@udyamone/shared-types';

const execFileAsync = promisify(execFile);

export interface OcrAnalysisResult {
  width: number;
  height: number;
  blurVariance: number;
  isBlurred: boolean;
  rotationAngle: number;
  ocrConfidence: number;
  rawOcrText: string;
  parsedData: Record<string, any>;
  qualityStatus: 'ACCEPTABLE' | 'FLAGGED_BLUR' | 'FLAGGED_SKEW' | 'FLAGGED_LOW_CONFIDENCE' | 'UNREADABLE';
  defectCode?: string;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  private getPythonScriptPath(): string {
    const candidate1 = path.resolve(__dirname, 'ocr_bridge.py');
    if (fs.existsSync(candidate1)) return candidate1;
    const candidate2 = path.resolve(process.cwd(), 'apps/api/src/modules/kyc/ocr_bridge.py');
    if (fs.existsSync(candidate2)) return candidate2;
    const candidate3 = path.resolve(process.cwd(), 'src/modules/kyc/ocr_bridge.py');
    if (fs.existsSync(candidate3)) return candidate3;
    return candidate1;
  }

  /**
   * Runs image quality assessment, OCR, and extracts structured key-value pairs
   * while strictly preserving raw, unmodified OCR text.
   */
  async analyzeDocument(filePath: string, docType: DocumentType): Promise<OcrAnalysisResult> {
    const absPath = path.resolve(filePath);
    const pythonScript = this.getPythonScriptPath();

    let rawOutput: any;
    const pythonCmd = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');
    try {
      const { stdout } = await execFileAsync(pythonCmd, [pythonScript, absPath], {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 20000
      });
      rawOutput = JSON.parse(stdout.trim());
    } catch (err: any) {
      // Try fallback to 'python' if 'python3' was not found
      if (pythonCmd === 'python3') {
        try {
          const { stdout } = await execFileAsync('python', [pythonScript, absPath], {
            maxBuffer: 10 * 1024 * 1024,
            timeout: 20000
          });
          rawOutput = JSON.parse(stdout.trim());
        } catch (fallbackErr: any) {
          this.logger.error(`OCR Bridge execution failed for ${absPath}: ${fallbackErr.message}`);
        }
      }
      if (!rawOutput) {
        this.logger.error(`OCR Bridge execution failed for ${absPath}: ${err.message}`);
        return {
          width: 0,
          height: 0,
          blurVariance: 0,
          isBlurred: true,
          rotationAngle: 0,
          ocrConfidence: 0,
          rawOcrText: '',
          parsedData: {},
          qualityStatus: 'UNREADABLE',
          defectCode: 'OCR_EXECUTION_FAILURE'
        };
      }
    }

    const isBlurred = rawOutput.isBlurred || rawOutput.blurVariance < 50;
    const rawOcrText = rawOutput.rawOcrText || '';
    const ocrConfidence = rawOutput.ocrConfidence || 0;
    const rotationAngle = rawOutput.rotationAngle || 0;

    let qualityStatus: 'ACCEPTABLE' | 'FLAGGED_BLUR' | 'FLAGGED_SKEW' | 'FLAGGED_LOW_CONFIDENCE' | 'UNREADABLE' =
      'ACCEPTABLE';
    let defectCode: string | undefined = undefined;

    if (isBlurred) {
      qualityStatus = 'FLAGGED_BLUR';
      defectCode = 'IMAGE_BLURRED';
    } else if (rotationAngle !== 0) {
      qualityStatus = 'FLAGGED_SKEW';
      defectCode = 'IMAGE_ROTATED';
    } else if (ocrConfidence < 60) {
      qualityStatus = 'FLAGGED_LOW_CONFIDENCE';
      defectCode = 'LOW_OCR_CONFIDENCE';
    }

    // Parse structured data based on document type
    const parsedData = this.parseDocumentData(rawOcrText, docType);

    // Check for incomplete document / missing primary page (e.g. K02 GST certificate)
    if (docType === DocumentType.GST_CERTIFICATE && !isBlurred) {
      if (!parsedData.gstin && !parsedData.legalName) {
        qualityStatus = 'UNREADABLE';
        defectCode = 'MISSING_PRIMARY_PAGE';
      }
    }

    return {
      width: rawOutput.width || 0,
      height: rawOutput.height || 0,
      blurVariance: rawOutput.blurVariance || 0,
      isBlurred,
      rotationAngle,
      ocrConfidence,
      rawOcrText,
      parsedData,
      qualityStatus,
      defectCode
    };
  }

  /**
   * Deterministically parses structured attributes according to document type.
   */
  private parseDocumentData(rawText: string, docType: DocumentType): Record<string, any> {
    const data: Record<string, any> = {};

    switch (docType) {
      case DocumentType.GST_CERTIFICATE: {
        // Standard 15-char GSTIN pattern
        const gstinMatch = rawText.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/);
        // Ambiguous O/0 pattern (e.g. K03, K06, K07, K08)
        const ambiguousMatch = rawText.match(/GSTIN\s+([0-9A-Z]{15})/i);

        if (gstinMatch) {
          data.gstin = gstinMatch[1].toUpperCase();
          data.rawGstin = gstinMatch[1];
        } else if (ambiguousMatch) {
          data.rawGstin = ambiguousMatch[1].toUpperCase();
          data.hasOcrAmbiguity = true;
        }

        const legalMatch = rawText.match(/Legal\s+name\s+([^\n]+)/i);
        if (legalMatch) data.legalName = legalMatch[1].trim();

        const tradeMatch = rawText.match(/Trade\s+name\s+([^\n]+)/i);
        if (tradeMatch) data.tradeName = tradeMatch[1].trim();

        const constMatch = rawText.match(/Constitution\s+([^\n]+)/i);
        if (constMatch) data.constitution = constMatch[1].trim();

        const addrMatch = rawText.match(/Address of principal\s+([^\n]+(?:\n[^\n]+)?)/i);
        if (addrMatch) data.address = addrMatch[1].replace(/\n/g, ' ').trim();

        const dateMatch = rawText.match(/Date of liability\s+(\d{4}-\d{2}-\d{2})/i);
        if (dateMatch) data.dateOfLiability = dateMatch[1];
        break;
      }

      case DocumentType.UDYAM_CERTIFICATE: {
        const udyamMatch = rawText.match(/UDYAM\s*-\s*([A-Z]{2})\s*-\s*([0-9]{2})\s*-\s*([0-9]{7})/i);
        if (udyamMatch) {
          // Normalize whitespace within standard statutory structure
          data.udyamNumber = `UDYAM-${udyamMatch[1].toUpperCase()}-${udyamMatch[2]}-${udyamMatch[3]}`;
          data.rawUdyamNumber = udyamMatch[0];
        }

        const entMatch = rawText.match(/Enterprise\s+name\s+([^\n]+)/i);
        if (entMatch) data.enterpriseName = entMatch[1].trim();

        const actMatch = rawText.match(/Major\s+activity\s+([^\n]+)/i);
        if (actMatch) data.majorActivity = actMatch[1].trim();

        const cityMatch = rawText.match(/City\s+([^\n]+)/i);
        if (cityMatch) data.city = cityMatch[1].trim();

        const stateMatch = rawText.match(/State\s+([^\n]+)/i);
        if (stateMatch) data.state = stateMatch[1].trim();

        const regDateMatch = rawText.match(/Date of registration\s+(\d{4}-\d{2}-\d{2})/i);
        if (regDateMatch) data.dateOfRegistration = regDateMatch[1];
        break;
      }

      case DocumentType.SIGNATORY_ID: {
        const lines = rawText.split('\n').map((l) => l.trim()).filter((l) => l);
        const nameIdx = lines.findIndex((l) => /Name/i.test(l));
        if (nameIdx !== -1 && lines[nameIdx + 1]) {
          data.signatoryName = lines[nameIdx + 1];
        }

        const desIdx = lines.findIndex((l) => /Designation/i.test(l));
        if (desIdx !== -1 && lines[desIdx + 1]) {
          data.designation = lines[desIdx + 1];
        }

        const busIdx = lines.findIndex((l) => /For business/i.test(l));
        if (busIdx !== -1 && lines[busIdx + 1]) {
          data.businessName = lines[busIdx + 1];
        }

        const idMatch = rawText.match(/SYN-ID-\d+/i);
        if (idMatch) data.idNumber = idMatch[0];
        break;
      }

      case DocumentType.ADDRESS_PROOF: {
        const consMatch = rawText.match(/Consumer\s+no\.?\s+(\d+)/i);
        if (consMatch) data.consumerNumber = consMatch[1];

        const billedMatch = rawText.match(/Billed\s+to\s+([^\n]+)/i);
        if (billedMatch) data.billedTo = billedMatch[1].trim();

        const supplyMatch = rawText.match(/Supply\s+address\s+([^\n]+(?:\n[^\n]+)?)/i);
        if (supplyMatch) data.supplyAddress = supplyMatch[1].replace(/\n/g, ' ').trim();

        const billDateMatch = rawText.match(/Bill\s+date\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i);
        if (billDateMatch) data.billDate = billDateMatch[1];

        const amtMatch = rawText.match(/Amount\s+due[^\d]*([\d,]+)/i);
        if (amtMatch) data.amountDue = amtMatch[1];
        break;
      }
    }

    return data;
  }
}
