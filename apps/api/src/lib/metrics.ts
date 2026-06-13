import { Registry, Counter, Gauge, Histogram } from 'prom-client';

export const metricsRegistry = new Registry();

metricsRegistry.setDefaultLabels({
  app: 'nexus-support-api',
});

// ── Gauges (current state) ──
export const activeSessionsGauge = new Gauge({
  name: 'nexus_active_sessions_total',
  help: 'Number of currently active sessions',
  registers: [metricsRegistry],
});

export const connectedParticipantsGauge = new Gauge({
  name: 'nexus_connected_participants_total',
  help: 'Number of currently connected Socket.io participants',
  registers: [metricsRegistry],
});

export const mediasoupProducersGauge = new Gauge({
  name: 'nexus_mediasoup_producers_total',
  help: 'Number of active mediasoup producers',
  registers: [metricsRegistry],
});

export const mediasoupConsumersGauge = new Gauge({
  name: 'nexus_mediasoup_consumers_total',
  help: 'Number of active mediasoup consumers',
  registers: [metricsRegistry],
});

// ── Counters (cumulative) ──
export const messagesSentCounter = new Counter({
  name: 'nexus_messages_sent_total',
  help: 'Total chat messages sent',
  labelNames: ['type'] as const,
  registers: [metricsRegistry],
});

export const recordingsCounter = new Counter({
  name: 'nexus_recordings_total',
  help: 'Total recordings started',
  registers: [metricsRegistry],
});

export const errorsCounter = new Counter({
  name: 'nexus_errors_total',
  help: 'Total unhandled errors',
  labelNames: ['type'] as const,
  registers: [metricsRegistry],
});

// ── Histograms (distributions) ──
export const sessionDurationHistogram = new Histogram({
  name: 'nexus_session_duration_seconds',
  help: 'Distribution of session durations in seconds',
  buckets: [30, 60, 300, 600, 1800, 3600],
  registers: [metricsRegistry],
});

export const recordingProcessingHistogram = new Histogram({
  name: 'nexus_recording_processing_duration_seconds',
  help: 'FFmpeg recording processing time in seconds',
  buckets: [5, 10, 30, 60, 120, 300],
  registers: [metricsRegistry],
});

export const httpRequestDurationHistogram = new Histogram({
  name: 'nexus_http_request_duration_seconds',
  help: 'HTTP endpoint latency in seconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});
