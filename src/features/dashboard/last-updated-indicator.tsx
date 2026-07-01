import { Clock } from "lucide-react";

import { formatRelativeTime } from "@/lib/dashboard/format-last-updated";
import { getDashboardLabels } from "@/lib/i18n/dashboard";
import { cn } from "@/lib/utils";

const labels = getDashboardLabels();

export type LastUpdatedIndicatorProps = {
  createdAt: string | null;
  /**
   * Optional "now" reference. Defaults to `new Date()` server-side at render
   * time. Tests can pass a fixed date to make assertions deterministic.
   */
  now?: Date;
};

/**
 * Pill-shaped badge shown next to the dashboard title. Renders the
 * "Última actualización: …" template with a relative-time string, or the
 * empty-state copy when the portfolio has no trades yet.
 *
 * Server Component — receives the latest trade date as a prop so it can be
 * fully presentational and trivially testable.
 */
export function LastUpdatedIndicator({
  createdAt,
  now,
}: LastUpdatedIndicatorProps) {
  const text =
    createdAt === null
      ? labels.noTradesYet
      : labels.lastUpdated.replace(
          "{date}",
          formatRelativeTime(createdAt, { relativeTimeFallback: labels.relativeTimeFallback }, now),
        );

  return (
    <span
      role="status"
      aria-live="polite"
      data-testid="last-updated-indicator"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1",
        "text-xs font-medium text-text-secondary ring-1 ring-border-subtle",
        "sm:self-auto",
      )}
    >
      <Clock className="h-3 w-3" aria-hidden="true" />
      {text}
    </span>
  );
}
