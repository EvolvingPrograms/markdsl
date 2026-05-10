// House style defaults. Edit here if a project genuinely needs a different look.

import { BorderStyle, ShadingType } from 'docx';

export const FONT = 'Times New Roman';
export const BODY_SIZE = 24;          // half-points: 24 = 12pt
export const H1_SIZE = 28;
export const H2_SIZE = 24;

export const PAGE = { width: 12240, height: 15840 };                          // US Letter, DXA
export const MARGIN = { top: 1440, right: 1440, bottom: 1440, left: 1440 };   // 1"
export const TABLE_WIDTH = 9360;                                              // page - margins

export const PARA_SPACING = { before: 120, after: 120, line: 360 };           // 1.5
export const LIST_SPACING = { before: 60,  after: 60,  line: 360 };
export const SIG_TALL = 1200;                                                 // signature row height (DXA)
export const SUBLIST_REF = 'sublist';      // (a) (b) (c) — nested under a top-level item
export const TOPLIST_REF = 'toplist';      // 1. 2. 3.   — top-level numbered sections

export const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
export const FULL_BORDERS = {
  top: CELL_BORDER, bottom: CELL_BORDER,
  left: CELL_BORDER, right: CELL_BORDER,
};
export const TABLE_BORDERS = {
  ...FULL_BORDERS,
  insideHorizontal: CELL_BORDER, insideVertical: CELL_BORDER,
};
export const CELL_MARGINS = { top: 100, bottom: 100, left: 140, right: 140 };
export const HEADER_SHADING = { fill: 'EEEEEE', type: ShadingType.CLEAR };
