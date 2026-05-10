// Cross-cutting public types for the core lib/ layer.

import type { Paragraph, Table } from 'docx';

/** The union of everything docx accepts as a section child, including nested arrays. */
export type BodyEntry = Paragraph | Table | BodyEntry[];
