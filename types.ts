export interface EvidenceProvenance {
  sourceDocument: string;
  section: string;
  extractionMethod: string;
  timestamp: string;
  hash: string;
}

export interface DecisionEdge {
  weight: number;
  consensusScore: number;
  conflictFlag: boolean;
}

export interface ClaimChainRow {
  evidence: EvidenceProvenance;
  normalizedClaim: string;
  policyMapping: string;
  decisionEdge: DecisionEdge;
  actionSuggestion: string;
}

export interface RecommendationTraceResponse {
  eventId: string;
  claimChain: ClaimChainRow[];
  replayCheck: boolean;
}

export interface EngineerTracePanelProps {
  eventId: string;
  onClose: () => void;
}
