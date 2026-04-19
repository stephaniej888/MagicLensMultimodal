# VideoGenerateModal — Tooltip & Ideation Spec
## For React Environment Integration (Late-stage tooltip layer)

This document captures the full modal UI content from the Magic Lens Multimodal demo
as a specification for the React tooltip/ideation layer.

---

## Modal Title
**Generate Compliance Video Brief**

## Pipeline Header
`Evidence Graph → Scene Compiler → Seedance 2.0 → VideoTRACE`

## Expandable Panel: "📖 How Video Works"
(Collapsible — closed by default, opens on click)

---

## Section: SEEDANCE API KEY
- Password input field (masked)
- "Save" button
- Status indicator: `✓ Key loaded` (green) / `⚠ No key` (amber)

---

## Section: WHY THIS VIDEO

> Rule **10 CFR 50 App. B** shows a **VIOLATION** condition. This brief compiles **3 evidence sources** into a **4-scene executive summary** — traceable back through the Evidence Lens via VideoTRACE.

**Summary:**
ECCS passive cooling capacity shows deviation from 10 CFR 50 Appendix B design basis. Three evidence sources confirm the finding requires engineering review.

---

## Section: NARRATIVE PLAN (4 SCENES)

| # | Rule ID | Status | Scene Description |
|---|---------|--------|-------------------|
| 1 | 10 CFR 50 App. B | VIOLATION | Camera zoom into nuclear control room dashboard showing ECCS compliance status overlay |
| 2 | NRC-2024-INSP | REVIEW | Screen pan across inspection report document interface with camera push motion |
| 3 | SAFETY-ANALYSIS | VIOLATION | Zoom into safety analysis dashboard with document overlay and camera sweep |
| 4 | ACTION-REQUIRED | REVIEW | Camera push into action item screen interface with compliance overlay |

---

## Section: EVIDENCE SOURCES
- ECCS Design Basis Report
- NRC Inspection Report 2024
- ABC Energy Safety Analysis

---

## React Integration Notes

### Component: `<VideoGenerateModal />`
- Triggered by "Generate Compliance Video Brief" button in the Evidence Lens panel
- Should receive `violation`, `evidence[]`, and `narrative` as props from the compliance context
- API key stored in `localStorage` under key `seedance_api_key`
- Pipeline stages to surface in the UI:
  1. `pipeline_start` — show spinner
  2. `ir_compiled` — "Compiling scenes from evidence graph..."
  3. `payload_built` — "Building video prompt..."
  4. `adapter_selected` — "Connecting to Seedance..."
  5. `api_request` — "Submitting to BytePlus ModelArk..."
  6. `task_assigned` — "Task queued: {task_id}"
  7. `poll_tick` — "Generating... ({elapsed}s)"
  8. `job_completed` — "Video ready"
  9. `pipeline_complete` — Show video player

### Tooltip Layer (React tooltip on hover over "Generate Compliance Video Brief" button)
```jsx
<Tooltip content={
  <div className="vgm-tooltip">
    <p><strong>Magic Mesh Video Compiler</strong></p>
    <p>Converts your Evidence Graph into a traceable compliance video brief.</p>
    <ul>
      <li>Evidence Lens → Scene IR</li>
      <li>Scene IR → Seedance 2.0 prompt</li>
      <li>Video output → VideoTRACE provenance</li>
    </ul>
    <p className="vgm-tooltip-note">Requires a BytePlus ModelArk API key (seedance-1-0-lite-t2v)</p>
  </div>
}>
  <button onClick={openModal}>Generate Compliance Video Brief</button>
</Tooltip>
```

### VideoTRACE Integration
After video generation completes, the `job.task_id` and `videoUrl` should be passed to the
VideoTRACE provenance layer so the generated video is traceable back to:
- The specific rule violation that triggered it (`ruleId`)
- The evidence sources used (`evidence[]`)
- The scene compiler IR (`ir.timeline`)
- The BytePlus task ID (`cgt-...`)

---

## API Reference (BytePlus ModelArk)

**Base URL:** `https://ark.ap-southeast.bytepluses.com/api/v3`

**Create Task:**
```
POST /contents/generations/tasks
Authorization: Bearer {ARK_API_KEY}
{
  "model": "seedance-1-0-lite-t2v-250428",
  "content": [{ "type": "text", "text": "{prompt}" }]
}
```

**Poll Task:**
```
GET /contents/generations/tasks/{task_id}
Authorization: Bearer {ARK_API_KEY}
```

**Success Response:**
```json
{
  "id": "cgt-2026xxxx",
  "status": "succeeded",
  "content": {
    "video_url": "https://..."
  }
}
```

---

## Local Proxy (for demo/development)

Run `node seedance-proxy.js` before opening the demo. It listens on `localhost:3001`
and routes `/seedance/*` to the BytePlus API with full CORS headers.

The demo HTML calls `http://localhost:3001/seedance/video/generate` — no browser CORS issues.
