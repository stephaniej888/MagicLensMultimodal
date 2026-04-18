import { irToSeedancePrompt, seedanceCreateTask, seedancePollTask } from './adapters/seedanceAdapter'
import { videoConfig } from '../../config/videoConfig'
import { buildUniversalVideoIR } from './universalVideoIR'
import { emitPipelineEvent } from '../../config/pipelineEvents'
import { createIRJob } from '../../ir/irTypes'
import { initialJobState, jobReducer, selectLatestJob } from '../../state/jobReducer'
import {
  advanceJobStatus,
  assignTaskId,
  attachArtifact,
  attachError,
  createExecutionJob,
  jobSnapshot,
} from './jobRuntime'

// Module-level IR job store (reducer pattern — UI reads via selectors)
let _jobStore = initialJobState
let activeVideoJob = null

function simpleHash(input = '') {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i)
    hash |= 0
  }
  return `h_${Math.abs(hash)}`
}

function buildGenerationFingerprint(scriptBlocks = [], options = {}) {
  const promptBase = Array.isArray(scriptBlocks)
    ? scriptBlocks.map((s) => `${s?.visual || ''}|${s?.voiceover || ''}|${s?.overlay || ''}`).join('::')
    : ''

  return {
    timestamp: new Date().toISOString(),
    prompt_hash: simpleHash(promptBase),
    scene_count: Array.isArray(scriptBlocks) ? scriptBlocks.length : 0,
    source: options?.source || 'unknown',
    mode: options?.modeOverride || videoConfig.mode,
  }
}

function dispatch(action) {
  _jobStore = jobReducer(_jobStore, action)
  return _jobStore
}

/** Expose store for UI components that subscribe to job state */
export function getJobStore() {
  return _jobStore
}

export function getLatestIRJob() {
  return selectLatestJob(_jobStore)
}

const telemetryState = {
  compileCount: 0,
  liveAttemptCount: 0,
  fallbackCount: 0,
  apiCallCount: 0,
  totalApiLatencyMs: 0,
}

function getTelemetrySnapshot() {
  return {
    ...telemetryState,
    averageApiLatencyMs:
      telemetryState.apiCallCount > 0
        ? Math.round(telemetryState.totalApiLatencyMs / telemetryState.apiCallCount)
        : 0,
    fallbackFrequency:
      telemetryState.compileCount > 0
        ? Number((telemetryState.fallbackCount / telemetryState.compileCount).toFixed(3))
        : 0,
  }
}

function logSeedanceVerification(message, details) {
  console.log(`[Seedance] ${message}`, details)
}

function validateScenes(scenes) {
  const renderableTokens = ['camera', 'zoom', 'screen', 'dashboard', 'document', 'overlay', 'flashing', 'interface']
  return (
    Array.isArray(scenes) &&
    scenes.length > 0 &&
    scenes.every((scene) => {
      const text = String(
        `${scene?.visual_intent || ''} ${scene?.narration || ''} ${scene?.overlay || ''} ${scene?.subject || ''} ${scene?.action || ''} ${scene?.environment || ''} ${scene?.motion || ''}`
      ).trim().toLowerCase()
      const hasRenderableToken = renderableTokens.some((token) => text.includes(token))
      const hasCameraMotion = /(camera|zoom|pan|push|sweep|shake)/i.test(text)
      return text.length > 20 && hasRenderableToken && hasCameraMotion
    })
  )
}

function logVideoPipelineState({ job = null, mode = null, url = null, sceneCount = null }) {
  const inferredSceneCount = Array.isArray(job?.ir_snapshot?.timeline)
    ? job.ir_snapshot.timeline.length
    : 0

  console.log('VIDEO_PIPELINE_STATE', {
    job_id: job?.job_id || null,
    scenes: Number.isFinite(sceneCount) ? sceneCount : inferredSceneCount,
    url: url || null,
    mode,
  })
}

function createInvalidPayloadFallback({ ir, irJob, requestedMode, compileStartedAt }) {
  const syntheticJob = createExecutionJob({
    provider: 'seedance-invalid-payload',
    requestedMode,
    ir,
  })

  assignTaskId(syntheticJob, `fallback_${syntheticJob.job_id}`)
  attachError(syntheticJob, 'INVALID_SCENES_BLOCKED')
  advanceJobStatus(syntheticJob, 'failed', { source: 'validation_failure' })
  dispatch({ type: 'JOB_FALLBACK', id: irJob.id, reason: 'INVALID_SCENES_BLOCKED' })

  emitPipelineEvent({ stage: 'payload_validation_failed', status: 'warn' })
  emitPipelineEvent({ stage: 'job_failed', status: 'warn' })
  emitPipelineEvent({
    stage: 'job_failed',
    status: 'warn',
    meta: {
      job_id: syntheticJob.job_id,
      task_id: syntheticJob.task_id,
      source: 'validation_failure',
    },
  })
  emitPipelineEvent({ stage: 'pipeline_complete', status: 'warn' })

  logVideoPipelineState({
    job: syntheticJob,
    mode: requestedMode,
    url: null,
    sceneCount: Array.isArray(ir?.timeline) ? ir.timeline.length : 0,
  })

  return {
    status: 'failed',
    provider: 'seedance',
    ir,
    irJob,
    video: null,
    error: 'INVALID_SCENES_BLOCKED',
    reason: 'NO_VALID_VIDEO',
    job: jobSnapshot(syntheticJob),
    irJobSnapshot: { ...irJob },
    execution: {
      requestedMode,
      compileMs: Math.round(performance.now() - compileStartedAt),
      apiLatencyMs: 0,
      telemetry: getTelemetrySnapshot(),
    },
  }
}

export function getActiveVideoJob() {
  return activeVideoJob
}

export function generateVideoOnce(scriptBlocks, options = {}) {
  const fingerprint = buildGenerationFingerprint(scriptBlocks, options)

  if (activeVideoJob) {
    console.warn('BLOCKED_DUPLICATE_VIDEO_JOB', {
      job_id: activeVideoJob.job_id,
      requestedMode: activeVideoJob.requestedMode,
      active_source: activeVideoJob.source,
      active_fingerprint: activeVideoJob.generation_fingerprint,
      incoming_fingerprint: fingerprint,
    })
    return activeVideoJob.promise
  }

  const runningJob = {
    job_id: `run_${Date.now()}`,
    requestedMode: options.modeOverride || videoConfig.mode,
    scenes: Array.isArray(scriptBlocks) ? scriptBlocks.length : 0,
    source: options.source || 'unknown',
    generation_fingerprint: fingerprint,
    promise: null,
  }

  console.log('VIDEO_GENERATION_FINGERPRINT', {
    job_id: runningJob.job_id,
    ...fingerprint,
  })

  runningJob.promise = compileVideo(scriptBlocks, options)
    .finally(() => {
      activeVideoJob = null
    })

  activeVideoJob = runningJob
  return runningJob.promise
}

export async function compileVideo(scriptBlocks, options = {}) {
  const compileStartedAt = performance.now()
  telemetryState.compileCount += 1
  emitPipelineEvent({ stage: 'pipeline_start', status: 'ok' })

  const ir = buildUniversalVideoIR(scriptBlocks)
  emitPipelineEvent({ stage: 'ir_compiled', status: 'ok' })

  const requestedMode = options.modeOverride || videoConfig.mode
  const job = createExecutionJob({
    provider: 'seedance',
    requestedMode,
    ir,
  })

  emitPipelineEvent({
    stage: 'job_created',
    status: 'ok',
    meta: { job_id: job.job_id },
  })
  emitPipelineEvent({
    stage: 'ir_snapshot_created',
    status: 'ok',
    meta: { job_id: job.job_id },
  })

  // Build IRJob — the stable intent contract passed to the adapter
  const prompt = irToSeedancePrompt(ir)
  const totalDuration = (ir.timeline || []).reduce((s, c) => s + (c.duration || 5), 0)
  const irJob = createIRJob({
    prompt,
    duration: totalDuration,
    scenes: Array.isArray(ir.timeline) ? ir.timeline : [],
    narrativeSummary: ir.metadata?.title || 'Compliance evidence video brief',
    provider: requestedMode === 'live' ? 'seedance' : 'mock',
  })
  dispatch({ type: 'JOB_CREATE', job: irJob })
  emitPipelineEvent({ stage: 'payload_built', status: 'ok', meta: { ir_job_id: irJob.id } })

  if (!validateScenes(ir.timeline || [])) {
    console.error('INVALID_SCENES_BLOCKED', {
      ir_job_id: irJob.id,
      scenes: ir.timeline || [],
    })
    return createInvalidPayloadFallback({
      ir,
      irJob,
      requestedMode,
      compileStartedAt,
    })
  }

  const isLive =
    requestedMode === 'live' &&
    videoConfig.seedance.apiKey &&
    videoConfig.seedance.endpoint

  logSeedanceVerification('Execution mode check', {
    requested_mode: requestedMode,
    is_live: isLive,
    has_api_key: Boolean(videoConfig.seedance.apiKey),
    has_endpoint: Boolean(videoConfig.seedance.endpoint),
    fallback_will_trigger: !isLive,
  })

  emitPipelineEvent({
    stage: 'adapter_selected',
    status: 'ok',
    meta: { provider: isLive ? 'seedance' : 'mock' },
  })

  if (!isLive) {
    logSeedanceVerification('Provider output unavailable, failing without mock artifact', {
      status: 'failed',
      task_id: null,
      output_url: null,
      fallback_triggered: false,
      reason:
        requestedMode !== 'live'
          ? 'mode_not_live'
          : 'missing_seedance_api_key_or_endpoint',
    })
    attachError(job, 'NO_PROVIDER_OUTPUT')
    advanceJobStatus(job, 'failed', { source: 'provider_precheck' })
    dispatch({ type: 'JOB_FALLBACK', id: irJob.id, reason: 'NO_PROVIDER_OUTPUT' })

    emitPipelineEvent({ stage: 'api_request', status: 'warn' })
    emitPipelineEvent({
      stage: 'job_failed',
      status: 'warn',
      meta: { job_id: job.job_id, reason: 'NO_PROVIDER_OUTPUT' },
    })
    emitPipelineEvent({ stage: 'pipeline_complete', status: 'warn' })

    logVideoPipelineState({ job, mode: requestedMode, url: null })

    return {
      status: 'failed',
      provider: 'seedance',
      ir,
      irJob,
      video: null,
      reason: 'NO_PROVIDER_OUTPUT',
      job: jobSnapshot(job),
      irJobSnapshot: { ...irJob },
      execution: {
        requestedMode,
        compileMs: Math.round(performance.now() - compileStartedAt),
        apiLatencyMs: 0,
        telemetry: getTelemetrySnapshot(),
      },
    }
  }

  try {
    logSeedanceVerification('Live mode enabled, calling Seedance API', {
      status: 'created',
      task_id: null,
      output_url: null,
      fallback_triggered: false,
    })
    telemetryState.liveAttemptCount += 1
    const apiStartedAt = performance.now()
    advanceJobStatus(job, 'running', { source: 'provider' })
    emitPipelineEvent({
      stage: 'job_running',
      status: 'ok',
      meta: { job_id: job.job_id },
    })
    emitPipelineEvent({ stage: 'api_request', status: 'ok' })

    // ── Step 1: IR → Adapter → task_id ────────────────────────────────────
    dispatch({ type: 'JOB_UPDATE_STATE', id: irJob.id, state: 'running' })

    const { taskId: providerTaskId, raw: creationResponse } = await seedanceCreateTask(
      irJob,
      videoConfig.seedance.apiKey
    )
    assignTaskId(job, providerTaskId)
    dispatch({ type: 'JOB_SET_TASK_ID', id: irJob.id, taskId: providerTaskId })
    logSeedanceVerification('Job created', {
      task_id: providerTaskId,
      status: creationResponse?.status || 'created',
      output_url:
        creationResponse?.content?.video_url ||
        creationResponse?.video_url ||
        creationResponse?.asset_url ||
        creationResponse?.output?.video_url ||
        creationResponse?.output?.url ||
        null,
      raw: creationResponse,
    })
    emitPipelineEvent({
      stage: 'task_assigned',
      status: 'ok',
      meta: { job_id: job.job_id, task_id: providerTaskId, source: 'provider' },
    })

    // ── Step 2: Polling loop ───────────────────────────────────────────────
    const POLL_INTERVAL_MS = 4000
    const POLL_TIMEOUT_MS = 240_000 // 4 min cap to allow long provider renders
    const URL_GRACE_MS = 30_000
    const pollStart = Date.now()
    let pollData = null
    let terminalNoUrlSince = null

    dispatch({ type: 'JOB_POLLING', id: irJob.id })
    emitPipelineEvent({
      stage: 'polling_start',
      status: 'ok',
      meta: { job_id: job.job_id, task_id: providerTaskId },
    })

    while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))

      pollData = await seedancePollTask(providerTaskId, videoConfig.seedance.apiKey)
      const jobStatus = pollData?.status
      const outputUrl =
        pollData?.content?.video_url ||
        pollData?.video_url ||
        pollData?.asset_url ||
        pollData?.output?.video_url ||
        pollData?.output?.url ||
        null

      logSeedanceVerification('Polling update', {
        task_id: providerTaskId,
        status: jobStatus || 'unknown',
        output_url: outputUrl,
        raw: outputUrl ? undefined : pollData,
      })

      emitPipelineEvent({
        stage: 'poll_tick',
        status: 'ok',
        meta: { job_id: job.job_id, task_id: providerTaskId, provider_status: jobStatus },
      })

      const isTerminalSuccess = jobStatus === 'succeeded' || jobStatus === 'completed'
      const isTerminalFailure = jobStatus === 'failed' || jobStatus === 'expired'

      if (isTerminalSuccess && outputUrl) {
        break
      }

      if (isTerminalSuccess && !outputUrl) {
        if (!terminalNoUrlSince) terminalNoUrlSince = Date.now()
        const waitingMs = Date.now() - terminalNoUrlSince
        logSeedanceVerification('Terminal status without artifact URL, continuing reconciliation polling', {
          task_id: providerTaskId,
          status: jobStatus,
          waiting_ms: waitingMs,
        })

        if (waitingMs > URL_GRACE_MS) {
          throw new Error('NO_PROVIDER_OUTPUT')
        }
        continue
      }

      if (isTerminalFailure) {
        throw new Error(`Seedance task ${jobStatus}: ${pollData?.error?.message || jobStatus}`)
      }

      if (jobStatus === 'running' || jobStatus === 'queued' || !jobStatus) {
        continue
      }

      if (jobStatus === 'failed' || jobStatus === 'expired') {
        throw new Error(`Seedance task ${jobStatus}: ${pollData?.error?.message || jobStatus}`)
      }
    }

    if (!pollData || !['succeeded', 'completed'].includes(pollData.status)) {
      throw new Error('Seedance polling timed out or ended in unknown state')
    }

    const videoUrl =
      pollData?.content?.video_url ||
      pollData?.output?.video_url ||
      pollData?.output?.url ||
      pollData?.asset_url ||
      pollData?.video_url ||
      null

    if (!videoUrl) {
      throw new Error('NO_PROVIDER_OUTPUT')
    }

    logSeedanceVerification('Job completed', {
      task_id: providerTaskId,
      status: pollData?.status || 'completed',
      output_url: videoUrl,
      raw: videoUrl ? undefined : pollData,
    })

    const apiLatencyMs = Math.round(performance.now() - apiStartedAt)
    telemetryState.apiCallCount += 1
    telemetryState.totalApiLatencyMs += apiLatencyMs

    dispatch({ type: 'JOB_COMPLETE', id: irJob.id, videoUrl })
    attachArtifact(job, {
      type: 'video_url',
      provider: 'seedance',
      videoUrl,
      task_id: providerTaskId,
      raw: pollData,
    })
    advanceJobStatus(job, 'completed', { source: 'provider' })
    emitPipelineEvent({
      stage: 'job_completed',
      status: 'ok',
      meta: { job_id: job.job_id, task_id: job.task_id },
    })
    emitPipelineEvent({ stage: 'pipeline_complete', status: 'ok' })

    logVideoPipelineState({ job, mode: requestedMode, url: videoUrl })

    return {
      status: 'live',
      provider: 'seedance',
      ir,
      irJob,
      videoUrl,
      video: {
        url: videoUrl,
      },
      result: pollData,
      job: jobSnapshot(job),
      irJobSnapshot: { ...irJob },
      execution: {
        requestedMode,
        compileMs: Math.round(performance.now() - compileStartedAt),
        apiLatencyMs,
        telemetry: getTelemetrySnapshot(),
      },
    }
  } catch (err) {
    console.warn('Seedance failed without valid provider artifact:', err.message)
    logSeedanceVerification('Failure detected, no fallback artifact returned', {
      task_id: job.task_id || null,
      status: 'failed',
      output_url: null,
      fallback_triggered: false,
      error: err.message,
    })
    telemetryState.fallbackCount += 1
    attachError(job, err.message)
    advanceJobStatus(job, 'failed', { source: 'provider' })
    dispatch({ type: 'JOB_FALLBACK', id: irJob.id, reason: err.message })
    emitPipelineEvent({
      stage: 'job_failed',
      status: 'warn',
      meta: { job_id: job.job_id, reason: err.message },
    })

    emitPipelineEvent({ stage: 'pipeline_complete', status: 'warn' })

    logVideoPipelineState({ job, mode: requestedMode, url: null })

    return {
      status: 'failed',
      provider: 'seedance',
      ir,
      irJob,
      video: null,
      reason: err.message === 'NO_PROVIDER_OUTPUT' ? 'NO_PROVIDER_OUTPUT' : 'NO_VALID_VIDEO',
      error: err.message,
      job: jobSnapshot(job),
      irJobSnapshot: { ...irJob },
      execution: {
        requestedMode,
        compileMs: Math.round(performance.now() - compileStartedAt),
        apiLatencyMs: 0,
        telemetry: getTelemetrySnapshot(),
      },
    }
  }
}
