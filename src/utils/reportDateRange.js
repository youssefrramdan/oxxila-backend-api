// src/utils/reportDateRange.js
const DEFAULT_PERIOD_DAYS = 30;
const MAX_RANGE_DAYS = 365;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const startOfUtcDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const endOfUtcDay = (date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  );

const shiftDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const periodBounds = (days) => {
  const end = new Date();
  const start = shiftDays(startOfUtcDay(end), -(days - 1));
  return { start, end };
};

const diffDaysInclusive = (start, end) => {
  const ms = endOfUtcDay(end).getTime() - startOfUtcDay(start).getTime();
  return Math.max(1, Math.floor(ms / (24 * 60 * 60 * 1000)) + 1);
};

const parseIsoDate = (value) => {
  if (!value || typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Resolve report window from `period` or explicit `startDate`/`endDate` query params.
 * @returns {{ start: Date, end: Date, periodDays: number }}
 */
export const resolveReportDateRange = (query = {}) => {
  const startDate = parseIsoDate(query.startDate);
  const endDate = parseIsoDate(query.endDate);

  if (startDate && endDate) {
    const start = startOfUtcDay(startDate);
    const end = endOfUtcDay(endDate);
    const periodDays = diffDaysInclusive(start, end);
    return { start, end, periodDays: Math.min(periodDays, MAX_RANGE_DAYS) };
  }

  const periodDays = Math.min(
    parsePositiveInt(query.period, DEFAULT_PERIOD_DAYS),
    MAX_RANGE_DAYS,
  );
  const { start, end } = periodBounds(periodDays);
  return { start, end, periodDays };
};

export const formatReportPeriodIso = (start, end) => ({
  start: startOfUtcDay(start).toISOString().slice(0, 10),
  end: startOfUtcDay(end).toISOString().slice(0, 10),
});
