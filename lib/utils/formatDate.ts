/**
 * Standardized timestamp formatting and comparison utilities.
 * Displays formatted timestamps in the user's local timezone.
 * Prefers 'Last Updated' when the record has been modified (updatedAt > createdAt);
 * otherwise displays 'Added On'.
 */

export interface FormatTimestampOptions {
  compact?: boolean;
}

export function formatDateTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "Date unavailable";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatDateTimeCompact(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "Date unavailable";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "Date unavailable";

  const datePart = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);

  const timePart = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return `${datePart} · ${timePart}`;
}

export interface RecordTimestampResult {
  type: "updated" | "created" | "unknown";
  label: string;
  formatted: string;
  display: string;
  rawDate: Date | null;
}

export function getRecordTimestamp(
  createdAt: string | Date | null | undefined,
  updatedAt?: string | Date | null | undefined,
  options: FormatTimestampOptions = {}
): RecordTimestampResult {
  const created = createdAt ? new Date(createdAt) : null;
  const updated = updatedAt ? new Date(updatedAt) : null;

  const validCreated = created && !isNaN(created.getTime()) ? created : null;
  const validUpdated = updated && !isNaN(updated.getTime()) ? updated : null;

  // Prefer "Last Updated" when the record has been modified (modified > 2 seconds after creation)
  const isUpdated =
    validUpdated &&
    validCreated &&
    validUpdated.getTime() - validCreated.getTime() > 2000;

  if (isUpdated && validUpdated) {
    const formatted = options.compact ? formatDateTimeCompact(validUpdated) : formatDateTime(validUpdated);
    return {
      type: "updated",
      label: "Last Updated",
      formatted,
      display: options.compact ? `Updated · ${formatted}` : `Last Updated: ${formatted}`,
      rawDate: validUpdated,
    };
  }

  const effective = validCreated || validUpdated;
  if (effective) {
    const formatted = options.compact ? formatDateTimeCompact(effective) : formatDateTime(effective);
    return {
      type: "created",
      label: "Added On",
      formatted,
      display: options.compact ? `Added · ${formatted}` : `Added On: ${formatted}`,
      rawDate: effective,
    };
  }

  return {
    type: "unknown",
    label: "Date",
    formatted: "Date unavailable",
    display: "Date unavailable",
    rawDate: null,
  };
}

/**
 * Returns epoch milliseconds for sorting records by most recent relevant timestamp (Recent First)
 */
export function getEffectiveTimestampTime(
  createdAt: string | Date | null | undefined,
  updatedAt?: string | Date | null | undefined
): number {
  const { rawDate } = getRecordTimestamp(createdAt, updatedAt);
  return rawDate ? rawDate.getTime() : 0;
}
