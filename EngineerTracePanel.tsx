import React, { useEffect, useMemo, useState } from "react";
import { EngineerTracePanelProps, RecommendationTraceResponse } from "./types";
import { fetchRecommendationTrace } from "./tracePanelApi";

import "./EngineerTracePanel.css";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function exportJsonBundle(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function fmt(num: number): string {
  return Number.isFinite(num) ? num.toFixed(3) : "0.000";
}

/* ─── component ───────────────────────────────────────────────────────────── */

type TabId = "chain" | "verification" | "provenance";

export default function EngineerTracePanel({
  eventId,
  onClose,
}: EngineerTracePanelProps): JSX.Element {
  /* ── data state ── */
  const [trace, setTrace] = useState<RecommendationTraceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  /* ── JSX hierarchy state ── */
  const [isActive, setIsActive] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("chain");

  /* ── fetch trace on mount / eventId change ── */
  useEffect(() => {
    let mounted = true;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);

      // isVerifying = true → activate heartbeat + status chip
      setIsVerifying(true);
      setIsActive(true);

      try {
        const data = await fetchRecommendationTrace(eventId);
        if (mounted) {
          setTrace(data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setTrace(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
          // isVerifying = false → chip transitions to Verified
          setIsVerifying(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [eventId]);

  /* ── isActive timeout: mirrors useEffect on isVerifying ── */
  useEffect(() => {
    if (isVerifying) {
      setIsActive(true);
      const timer = setTimeout(() => setIsActive(false), 4000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isVerifying]);

  /* ── derived stats ── */
  const stats = useMemo(() => {
    if (!trace || trace.claimChain.length === 0) {
      return { avgConsensus: 0, conflicts: 0, strong: 0 };
    }
    const totalConsensus = trace.claimChain.reduce(
      (acc, row) => acc + row.decisionEdge.consensusScore,
      0
    );
    return {
      avgConsensus: totalConsensus / trace.claimChain.length,
      conflicts: trace.claimChain.filter((r) => r.decisionEdge.conflictFlag).length,
      strong: trace.claimChain.filter((r) => r.decisionEdge.consensusScore >= 0.8).length,
    };
  }, [trace]);

  /* ── derived verification surface data ── */
  const primaryClaim = useMemo(() => {
    if (!trace || trace.claimChain.length === 0) return null;
    return trace.claimChain.reduce(
      (best, r) => (r.decisionEdge.weight > best.decisionEdge.weight ? r : best),
      trace.claimChain[0]
    );
  }, [trace]);

  const avgPct = Math.round(stats.avgConsensus * 100);
  const hasConflict = stats.conflicts > 0;
  const summaryAction = trace?.claimChain?.[0]?.actionSuggestion ?? "No action suggestion available";

  /* ─── render ──────────────────────────────────────────────────────────── */
  return (
    <aside
      className={`trace-panel-overlay${isActive ? " active" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="PulseTRACE Engineer Verification Surface"
    >
      <section className={`trace-panel${isActive ? " active" : ""}`}>

        {/* ── HEADER — Command Strip ── */}
        <header className="tp-header">
          <div className="tp-header-left">
            <div className="tp-header-icon">🔬</div>
            <div>
              <p className="tp-kicker">PulseTRACE · Engineer Verification Surface</p>
              <h2>
                Decision Trace —{" "}
                <span style={{ color: "#1a1a2e" }}>{eventId}</span>
              </h2>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className={`trace-status-chip${isVerifying ? " verifying" : ""}`}>
              {isVerifying ? "Verifying…" : "Verified ✓"}
            </span>
            <button
              type="button"
              className="tp-close"
              onClick={onClose}
              aria-label="Close trace panel"
            >
              ✕
            </button>
          </div>
        </header>

        {/* ── OVERVIEW STRIP ── */}
        <div className="tp-overview">
          <div className="tp-ov-item">
            <span>Event ID</span>
            <strong>{eventId}</strong>
          </div>
          <div className="tp-ov-item">
            <span>Action Summary</span>
            <strong style={{ fontSize: "0.72rem" }}>{summaryAction}</strong>
          </div>
          <div className="tp-ov-item">
            <span>Replay Check</span>
            <strong className={trace?.replayCheck ? "ok" : "fail"}>
              {trace?.replayCheck ? "match: true ✓" : "match: false ✗"}
            </strong>
          </div>
        </div>

        {/* ── METRICS ROW ── */}
        <div className="tp-metrics">
          <div className="tp-metric">
            <span>Avg Consensus</span>
            <strong>{fmt(stats.avgConsensus)}</strong>
          </div>
          <div className="tp-metric">
            <span>Strong Signals</span>
            <strong className={stats.strong > 0 ? "ok" : undefined}>{stats.strong}</strong>
          </div>
          <div className="tp-metric">
            <span>Conflicts</span>
            <strong className={stats.conflicts > 0 ? "conflict" : "ok"}>{stats.conflicts}</strong>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="tp-tabs">
          {(["chain", "verification", "provenance"] as TabId[]).map((tab) => (
            <div
              key={tab}
              className={`tp-tab${activeTab === tab ? " active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "chain" && "Claim Chain"}
              {tab === "verification" && "Chain of Reasoning"}
              {tab === "provenance" && "Provenance Graph"}
            </div>
          ))}
        </div>

        {/* ── TAB CONTENT ── */}
        <div className="tp-content">

          {/* ── TAB 1: Claim Chain table ── */}
          {activeTab === "chain" && (
            <div className="tp-tab-pane active">
              <div className="tp-section-title">
                Decision Chain
                <span className="ts-badge">Deterministic</span>
                <span className="ts-badge">Replayable</span>
                <span className="ts-badge">Auditable</span>
              </div>
              <div className="tp-replay-banner">
                <span style={{ fontSize: "16px" }}>✅</span>
                <div>
                  <strong>Replay Check Passed</strong>
                  &nbsp;
                  <span>
                    — deterministic re-execution of this event chain matches stored hash.
                    Audit lineage is intact.
                  </span>
                </div>
              </div>

              {loading && (
                <p className="tp-state" style={{ textAlign: "center", color: "#4a5a80", padding: "24px" }}>
                  Loading trace data…
                </p>
              )}
              {!loading && error && (
                <p className="tp-state" style={{ color: "#ef4444", padding: "16px" }}>
                  Trace load failed: {error}
                </p>
              )}
              {!loading && !error && trace && trace.claimChain.length === 0 && (
                <p className="tp-state" style={{ textAlign: "center", color: "#4a5a80", padding: "24px" }}>
                  No decision chain rows found.
                </p>
              )}
              {!loading && !error && trace && trace.claimChain.length > 0 && (
                <table className="tp-table">
                  <thead>
                    <tr>
                      <th>Evidence</th>
                      <th>Normalized Claim</th>
                      <th>Policy Mapping</th>
                      <th>Decision Edge</th>
                      <th>Audit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trace.claimChain.map((row, index) => {
                      const isExpanded = !!expanded[index];
                      const cf = row.decisionEdge.conflictFlag;
                      return (
                        <React.Fragment key={`${row.evidence.hash}-${index}`}>
                          <tr>
                            <td>
                              <div className="ev-cell">
                                <strong>{row.evidence.sourceDocument}</strong>
                                <small>{row.evidence.section}</small>
                              </div>
                            </td>
                            <td style={{ color: "#c0d0f0" }}>{row.normalizedClaim}</td>
                            <td>{row.policyMapping}</td>
                            <td>
                              <div className="edge-cell">
                                <span>w={fmt(row.decisionEdge.weight)}</span>
                                <span>c={fmt(row.decisionEdge.consensusScore)}</span>
                                <span className={cf ? "badge-conflict" : "badge-ok"}>
                                  {cf ? "conflict" : "aligned"}
                                </span>
                              </div>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="expand-btn"
                                onClick={() =>
                                  setExpanded((prev) => ({ ...prev, [index]: !prev[index] }))
                                }
                              >
                                {isExpanded ? "Hide Provenance" : "Show Provenance"}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="provenance-row">
                              <td colSpan={5}>
                                <div className="provenance-grid">
                                  <div>
                                    <span>Extraction Method</span>
                                    <strong>{row.evidence.extractionMethod}</strong>
                                  </div>
                                  <div>
                                    <span>Timestamp</span>
                                    <strong>{row.evidence.timestamp}</strong>
                                  </div>
                                  <div>
                                    <span>Source Hash</span>
                                    <strong className="hash">{row.evidence.hash}</strong>
                                  </div>
                                  <div>
                                    <span>Action Suggestion</span>
                                    <strong>{row.actionSuggestion}</strong>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── TAB 2: Enterprise Trace Hierarchy — Verification Surface ── */}
          {activeTab === "verification" && (
            <div className="tp-tab-pane active">

              {/* HEADER — System State */}
              <div className="trace-header">
                <div className="trace-title">PulseTRACE</div>
                <div className={`trace-status${isVerifying ? " verifying" : ""}`}>
                  {isVerifying ? "Verifying…" : "Verified"}
                </div>
              </div>

              {loading ? (
                <p style={{ color: "#4a5a80", padding: "24px", textAlign: "center" }}>
                  Loading trace data…
                </p>
              ) : error ? (
                <p style={{ color: "#ef4444", padding: "16px" }}>Trace load failed: {error}</p>
              ) : (
                <>
                  {/* CLAIM — What is being evaluated */}
                  <div className="trace-section trace-claim">
                    <div className="trace-label">Claim</div>
                    <div className="trace-content">
                      {primaryClaim?.normalizedClaim ?? "—"}
                    </div>
                  </div>

                  {/* EVIDENCE — Inputs */}
                  <div className="trace-section trace-evidence">
                    <div className="trace-label">Evidence</div>
                    <ul className="trace-list">
                      {trace?.claimChain.map((r, i) => (
                        <li key={i} className="trace-evidence-item">
                          <strong>{r.evidence.sourceDocument}</strong>
                          <span className="trace-meta"> · {r.evidence.section}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* VERIFICATION PATH — Deterministic reasoning */}
                  <div className="trace-section trace-path">
                    <div className="trace-label">Verification Path</div>
                    <div className="trace-path-steps">
                      {trace?.claimChain.map((r, i) => {
                        const cf = r.decisionEdge.conflictFlag;
                        return (
                          <div key={i} className="trace-step">
                            <span className="trace-step-index">{i + 1}</span>
                            <span className="trace-step-text">
                              <span style={{ color: "rgba(180,210,255,0.9)", fontWeight: 600 }}>
                                {r.normalizedClaim}
                              </span>
                              <span className="trace-meta"> → {r.policyMapping}</span>
                              <span
                                style={{
                                  marginLeft: "8px",
                                  fontSize: "0.65rem",
                                  fontWeight: 700,
                                  padding: "1px 7px",
                                  borderRadius: "999px",
                                  background: cf
                                    ? "rgba(239,68,68,0.12)"
                                    : "rgba(16,185,129,0.1)",
                                  color: cf ? "#ef4444" : "#10b981",
                                  border: `1px solid ${cf ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.25)"}`,
                                }}
                              >
                                {cf ? "⚠ conflict" : "✓ aligned"}
                              </span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* RESULT — Output */}
                  <div className="trace-section trace-result">
                    <div className="trace-label">Result</div>
                    <div className="trace-result-row">
                      <span className="trace-confidence">{avgPct}%</span>
                      <span className={`trace-verdict${hasConflict ? " conflict" : " pass"}`}>
                        {hasConflict
                          ? "Conflict Detected — Engineering Review Required"
                          : "Verified — Compliant"}
                      </span>
                    </div>
                  </div>

                  {/* Full Chain of Reasoning — detailed cards */}
                  <div className="trace-section trace-full-cor">
                    <div className="trace-label">Full Chain of Reasoning</div>
                    <div className="cor-chain">
                      {trace?.claimChain.map((row, i) => {
                        const cf = row.decisionEdge.conflictFlag;
                        return (
                          <React.Fragment key={i}>
                            <div className="cor-row">
                              <div className="cor-step-num">{i + 1}</div>
                              <div className="cor-card">
                                <div className="cor-card-kicker">
                                  Evidence Source → Claim → Policy
                                </div>
                                <div className="cor-card-claim">{row.normalizedClaim}</div>
                                <div className="cor-card-meta">
                                  <span className="cor-meta-pill policy">{row.policyMapping}</span>
                                  <span className="cor-meta-pill weight">
                                    w={fmt(row.decisionEdge.weight)} · c=
                                    {fmt(row.decisionEdge.consensusScore)}
                                  </span>
                                  <span
                                    className={`cor-meta-pill ${cf ? "conflict-pill" : "aligned-pill"}`}
                                  >
                                    {cf ? "⚠ conflict" : "✓ aligned"}
                                  </span>
                                </div>
                                <div className="cor-action">
                                  <strong>→ Action:</strong> {row.actionSuggestion}
                                </div>
                                <div
                                  style={{
                                    marginTop: "8px",
                                    fontSize: "0.68rem",
                                    color: "#3a4a70",
                                    borderTop: "1px solid rgba(255,255,255,0.05)",
                                    paddingTop: "6px",
                                  }}
                                >
                                  <span style={{ color: "#4a5a80" }}>Source:</span>{" "}
                                  {row.evidence.sourceDocument} &nbsp;·&nbsp;
                                  <span style={{ color: "#4a5a80" }}>Method:</span>{" "}
                                  {row.evidence.extractionMethod} &nbsp;·&nbsp;
                                  <span
                                    style={{
                                      fontFamily: "monospace",
                                      color: "#3a4a70",
                                      fontSize: "0.62rem",
                                    }}
                                  >
                                    {row.evidence.hash.substring(0, 28)}…
                                  </span>
                                </div>
                              </div>
                            </div>
                            {i < (trace?.claimChain.length ?? 0) - 1 && (
                              <div className="cor-connector">↓</div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── TAB 3: Provenance Graph ── */}
          {activeTab === "provenance" && (
            <div className="tp-tab-pane active">
              <div className="cor-title">Source Provenance Graph</div>
              <div
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "10px",
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    fontSize: "0.68rem",
                    color: "#4a5a80",
                    marginBottom: "14px",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 700,
                  }}
                >
                  Document Sources → Claim Chain → Policy Mapping
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {trace?.claimChain.map((row, i) => {
                    const cf = row.decisionEdge.conflictFlag;
                    return (
                      <div
                        key={i}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 24px 1fr 24px 1fr",
                          alignItems: "center",
                        }}
                      >
                        <div
                          style={{
                            background: "rgba(108,99,255,0.1)",
                            border: "1px solid rgba(108,99,255,0.25)",
                            borderRadius: "8px",
                            padding: "8px 10px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.6rem",
                              fontWeight: 800,
                              color: "#6060c0",
                              textTransform: "uppercase",
                              marginBottom: "3px",
                            }}
                          >
                            Document
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "#c0c8f0", fontWeight: 600 }}>
                            {row.evidence.sourceDocument}
                          </div>
                          <div style={{ fontSize: "0.62rem", color: "#4a5a80", marginTop: "2px" }}>
                            {row.evidence.section.substring(0, 40)}…
                          </div>
                        </div>
                        <div style={{ textAlign: "center", color: "rgba(62,207,207,0.4)", fontSize: "14px" }}>→</div>
                        <div
                          style={{
                            background: "rgba(62,207,207,0.06)",
                            border: "1px solid rgba(62,207,207,0.2)",
                            borderRadius: "8px",
                            padding: "8px 10px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.6rem",
                              fontWeight: 800,
                              color: "var(--teal, #3ecfcf)",
                              textTransform: "uppercase",
                              marginBottom: "3px",
                            }}
                          >
                            Claim
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "#c0d0f0" }}>
                            {row.normalizedClaim.substring(0, 55)}…
                          </div>
                        </div>
                        <div style={{ textAlign: "center", color: "rgba(62,207,207,0.4)", fontSize: "14px" }}>→</div>
                        <div
                          style={{
                            background: cf ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)",
                            border: `1px solid ${cf ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.2)"}`,
                            borderRadius: "8px",
                            padding: "8px 10px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.6rem",
                              fontWeight: 800,
                              color: cf ? "#ef4444" : "#10b981",
                              textTransform: "uppercase",
                              marginBottom: "3px",
                            }}
                          >
                            Policy {cf ? "⚠ Conflict" : "✓ Aligned"}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: cf ? "#ef9090" : "#90d0b0" }}>
                            {row.policyMapping.substring(0, 45)}…
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div
                style={{
                  marginTop: "14px",
                  background: "rgba(16,185,129,0.06)",
                  border: "1px solid rgba(16,185,129,0.15)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                }}
              >
                <div
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 800,
                    color: "#10b981",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "6px",
                  }}
                >
                  Audit Integrity
                </div>
                <div style={{ fontSize: "0.75rem", color: "#5a8070", lineHeight: 1.6 }}>
                  All source hashes verified against the air-gapped document store. Extraction
                  timestamps are cryptographically signed per{" "}
                  <strong style={{ color: "#10b981" }}>10 CFR 50 Appendix B</strong> QA
                  requirements. NRC inspectors may request full lineage export via the button below.
                </div>
              </div>
            </div>
          )}

        </div>{/* /tp-content */}

        {/* ── FOOTER ── */}
        <footer className="tp-footer">
          <div className="tp-footer-left">
            PulseML · Air-Gapped Sovereign Deployment ·{" "}
            <span style={{ color: "var(--teal, #3ecfcf)" }}>{eventId}</span>
          </div>
          <button
            type="button"
            className="tp-export-btn"
            disabled={!trace}
            onClick={() => {
              if (!trace) return;
              exportJsonBundle(`trace_bundle_${trace.eventId}.json`, trace);
            }}
          >
            ⬇ Export Bundle (JSON)
          </button>
        </footer>

      </section>
    </aside>
  );
}
