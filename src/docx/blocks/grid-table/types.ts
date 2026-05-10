/** Column definition for a grid table. `key === '#'` renders 1-indexed row numbers. */
export interface GridColumn {
  label: string;
  key: string;
  /** Relative width unit — columns are scaled to TABLE_WIDTH at render time. */
  width: number;
}

/** A single data row; keyed by column key. */
export type GridRow = Record<string, string | number | null | undefined>;
