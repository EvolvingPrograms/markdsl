// Public types for the two-column field table.

export type FieldRowTuple = [
  label: string,
  key: string | null,
  opts?: { prefix?: string; subLabel?: string },
];

export interface FieldRowObject {
  label: string;
  key: string | null;
  prefix?: string;
  subLabel?: string;
}

export type FieldRow = FieldRowTuple | FieldRowObject;
