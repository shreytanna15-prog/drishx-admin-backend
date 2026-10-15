export type ReportCategory =
  | "financial"
  | "orders"
  | "sales"
  | "inventory"
  | "power";

export type ReportFilterKind =
  | "fy"
  | "dateRange"
  | "dateRangeFast"
  | "dateRangeSlow"
  | "none";

export type ReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
};

export type ReportDefinition = {
  key: string;
  title: string;
  description: string;
  category: ReportCategory;
  phase: 1 | 2 | 3 | 4;
  /** Which filter controls are shown in the hub for this report. */
  filters: ReportFilterKind;
  columns: ReportColumn[];
  /** Short note shown in UI (assumptions / blockers). */
  notes?: string;
};

export type ReportRunParams = {
  fy?: string;
  from?: string;
  to?: string;
  /** Fast Moving: minimum sold units in the period (required; no system default). */
  minUnits?: string;
  /** Slow Moving: maximum sold units in the period (required; no system default). */
  maxUnits?: string;
  /**
   * When true, use elevated row limits so CSV/XLSX exports can be complete.
   * Callers must refuse the export if the payload is still truncated.
   */
  forExport?: boolean;
};

export type ReportTablePayload = {
  kind: "table";
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  summary?: Record<string, string | number | null>;
  meta?: Record<string, string | number | boolean | null>;
};

export type ReportCardsPayload = {
  kind: "cards";
  cards: { label: string; value: string | number }[];
  columns?: ReportColumn[];
  rows?: Record<string, string | number | null>[];
  summary?: Record<string, string | number | null>;
  meta?: Record<string, string | number | boolean | null>;
};

export type ReportPayload = ReportTablePayload | ReportCardsPayload;

export type ReportSuccessResponse = {
  report: string;
  title: string;
  category: ReportCategory;
  notes?: string;
  params: {
    fy: string | null;
    from: string | null;
    to: string | null;
  };
  data: ReportPayload;
};
