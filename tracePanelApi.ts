import { RecommendationTraceResponse } from "./types";

export async function fetchRecommendationTrace(eventId: string): Promise<RecommendationTraceResponse> {
  const response = await fetch(`/api/recommendation/${encodeURIComponent(eventId)}/trace`, {
    method: "GET",
    headers: {
      "content-type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Trace API failed (${response.status})`);
  }

  return response.json() as Promise<RecommendationTraceResponse>;
}
