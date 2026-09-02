import type {
  TelegraphCveEvidence,
} from "../../core/src/domain/types";

export type { TelegraphCveEvidence } from "../../core/src/domain/types";

export interface CveLookupInput {
  cveId: string;
  packageName?: string;
  installedVersion?: string;
  repository?: string;
}

export interface TelegraphConfig {
  engineUrl: string;
  privateKey: string;
  expectedNetwork: string;
  timeoutMs: number;
}

export interface PaymentPreparationInput {
  response: Response;
  body: unknown;
  expectedNetwork: string;
}

export interface PreparedPayment {
  headers: Record<string, string>;
  network: string;
  scheme: string;
  amount: string;
  asset: string;
  costUsd: number | null;
}

export interface TelegraphPaymentAdapter {
  preparePayment(input: PaymentPreparationInput): Promise<PreparedPayment>;
}

export interface TelegraphClient {
  lookupCve(input: CveLookupInput): Promise<TelegraphCveEvidence>;
}
