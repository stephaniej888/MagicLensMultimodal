import { RecommendationTraceResponse } from "./types";

const MOCK_TRACES: Record<string, RecommendationTraceResponse> = {
  evt_001: {
    eventId: "evt_001",
    replayCheck: true,
    claimChain: [
      {
        evidence: {
          sourceDocument: "NRC_ADAMS_ML23295A201",
          section: "10 CFR 50.46 - Acceptance Criteria, p.14",
          extractionMethod: "rule+nlp_hybrid",
          timestamp: "2026-03-26T18:40:00Z",
          hash: "sha256:835e2e2dbf4a1de7bc2f6d6ecf53ac6d818cd6851bb335f55a7c2e3ebf2f9f10",
        },
        normalizedClaim: "ECCS LOCA analysis remains below peak cladding temperature threshold",
        policyMapping: "10 CFR 50.46(b)(1) - Peak cladding temperature limit",
        decisionEdge: {
          weight: 0.859,
          consensusScore: 0.81,
          conflictFlag: false,
        },
        actionSuggestion: "Maintain current compliance state; continue periodic surveillance audit",
      },
      {
        evidence: {
          sourceDocument: "IEEE_497_2022",
          section: "Sensor qualification and reliability controls, sec.7.2",
          extractionMethod: "nlp_transformer",
          timestamp: "2026-03-26T18:41:20Z",
          hash: "sha256:2be99f7cb2934f4ec6a838d4b7bf7b6fb667db0e97cc1af76e8e27ecfbc4ce7a",
        },
        normalizedClaim: "Instrumentation reliability supports confidence in measured ECCS parameters",
        policyMapping: "NRC Reg. Guide 1.157 - instrumentation and system response quality",
        decisionEdge: {
          weight: 0.834,
          consensusScore: 0.79,
          conflictFlag: false,
        },
        actionSuggestion: "Flag for normal verification in next QA review window",
      },
      {
        evidence: {
          sourceDocument: "ORNL_NUREG_CR_XXXX",
          section: "Containment thermal-hydraulic assumptions, Appendix B",
          extractionMethod: "manual_annotation",
          timestamp: "2026-03-26T18:43:05Z",
          hash: "sha256:b6f2f88173f7be6e59f4b6bbf62d3f8df37e9f1656f265be8d2a3906e8d84594",
        },
        normalizedClaim: "Conservative assumptions increase margin confidence for modeled transient",
        policyMapping: "NRC safety margin interpretation guidance",
        decisionEdge: {
          weight: 0.801,
          consensusScore: 0.67,
          conflictFlag: true,
        },
        actionSuggestion: "Escalate to engineering review for conflict verification",
      },
    ],
  },
};

export async function getRecommendationTrace(eventId: string): Promise<RecommendationTraceResponse> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const trace = MOCK_TRACES[eventId];
  if (!trace) {
    return {
      eventId,
      replayCheck: false,
      claimChain: [],
    };
  }

  return trace;
}

// Optional helper: install a browser fetch mock for /api/recommendation/{eventId}/trace
export function installTraceFetchMock(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const match = url.match(/\/api\/recommendation\/([^/]+)\/trace$/);
    if (!match) {
      return originalFetch(input, init);
    }

    const eventId = decodeURIComponent(match[1]);
    const trace = await getRecommendationTrace(eventId);
    return new Response(JSON.stringify(trace), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}
