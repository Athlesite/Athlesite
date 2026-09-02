/**
 * Fixed geometry for the homepage hero's cinematic composition.
 *
 * Every number is in design pixels measured off
 * design-reference/homepage-approved.png at a 1536px-wide viewport. The stage
 * is rendered at these exact sizes and scaled as one unit (see `.hero-stage`
 * in globals.css), which is what lets the athlete standing behind the laptop
 * and the copy of him rendered *inside* the laptop screen line up seamlessly.
 */

export const STAGE = { width: 1010, height: 811 } as const;

/** Source plate is 1200x2260 with the helmet crown at ~21.5% of the height. */
export const ATHLETE = { left: 246, top: -219, width: 600, height: 1130 } as const;

/** The laptop's screen area (the shell is drawn just outside it). */
export const LAPTOP_SCREEN = { left: 135, top: 308, width: 744, height: 418 } as const;

export const PHONE = { left: 720, top: 358, width: 196, height: 424 } as const;

/**
 * Where the athlete plate has to sit *within* the laptop screen for the body
 * to continue unbroken from the figure standing behind it.
 */
export const ATHLETE_IN_SCREEN = {
  left: ATHLETE.left - LAPTOP_SCREEN.left,
  top: ATHLETE.top - LAPTOP_SCREEN.top,
  width: ATHLETE.width,
  height: ATHLETE.height,
} as const;

export const ATHLETE_PLATE = "/marketing/hero-athlete.webp";

/** Demo season line for the example athlete shown on the hero devices. */
export const JORDAN_SEASON_STATS = [
  { value: "24", label: "Games" },
  { value: "58", label: "Receptions" },
  { value: "842", label: "Yards" },
  { value: "12", label: "Touchdowns" },
  { value: "7–3", label: "Record" },
] as const;

export const JORDAN_JERSEY = "11";
