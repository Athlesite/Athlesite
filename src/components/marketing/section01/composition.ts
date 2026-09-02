/**
 * Fixed geometry for Section 01's layered showcase.
 *
 * Same approach as the hero: authored in design pixels at a 1536px-wide
 * viewport and scaled as one unit, so the photo plate, the device, and the
 * fragments layered around it hold their exact relationship at every
 * breakpoint instead of drifting apart.
 */

export const S01_STAGE = { width: 900, height: 700 } as const;

/** Cropped action photo. Bleeds off the right edge of the section. */
export const S01_PLATE = { left: 400, top: -30, width: 500, height: 736 } as const;

/** Highlight frame, tucked behind the device so it reads as depth, not a card grid. */
export const S01_FRAME = { left: 0, top: 130, width: 300, height: 169 } as const;

export const S01_PHONE = { left: 200, top: 30, width: 300, height: 648 } as const;

/** Typographic season fragment on the open ground to the left. */
export const S01_STAT = { left: 0, top: 400, width: 180 } as const;

/** Recruiting status, sitting directly on the photograph. */
export const S01_STATUS = { left: 540, top: 590 } as const;
