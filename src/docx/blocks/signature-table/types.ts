/** A single row in a signature block: [label, data key, options]. */
export type SigRow = [
  label: string,
  key: string | null,
  opts?: { tall?: boolean },
];

/** One side (left or right) of a signature table. */
export interface SigSide {
  header: string;
  rows: SigRow[];
}
