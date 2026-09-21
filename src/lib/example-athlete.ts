import {
  toAthleteProfileView,
  type AthleteProfileData,
  type AthleteProfileView,
} from "@/lib/athlete-profile";
import type { RecruitingPosture } from "@/components/profile/profile-display";

// Kept as an alias so existing imports/typing elsewhere don't need to change.
export type ExampleAthlete = AthleteProfileView;

const jordanBellData: AthleteProfileData = {
  slug: "jordan-bell",
  firstName: "Jordan",
  lastName: "Bell",
  sport: "Football",
  position: "Wide Receiver",
  classYear: "2027",
  schoolOrTeam: "",
  city: "Round Rock",
  state: "TX",
  heightIn: 74,
  weightLb: 185,
  bio: "Wide receiver focused on route running, footwork, and film study. Balancing training with academics while preparing for the next level.",
  heroPhotoPositionX: 0.5,
  heroPhotoPositionY: 0,
  heroPhotoZoom: 1,
  highlightLinks: [
    { label: "Highlight Reel", url: "" },
    { label: "Game Film", url: "" },
    { label: "Training Clip", url: "" },
  ],
  recruitingStatus: "open",
  recruitingContact: "",
  recruitingNotes: "",
  social: {
    instagram: "",
    twitter: "",
    tiktok: "",
    hudl: "",
    youtube: "",
    website: "",
  },
  nilOpen: true,
  nilContact: "",
  nilInterests: "",
};

/**
 * Derived straight from the fixture, with no overrides.
 *
 * The previous `displayUrl: "athlesite.com/jordanbell"` override showed a URL
 * that matched neither this fixture's own slug (`jordan-bell`) nor any route
 * that existed — the same class of defect Checkpoint 5D.3 fixes for real
 * athletes. Now that profiles live at the root, the derived value and the
 * real route agree.
 */
export const exampleAthlete: ExampleAthlete = toAthleteProfileView(jordanBellData);

/**
 * The example's real recruiting/NIL posture, which the demo page may render
 * because these are fictional fixture values on a page banner-labelled as
 * sample data. No real public profile can supply this — see
 * profile-display.ts's RecruitingPosture.
 */
export const exampleAthletePosture: RecruitingPosture = {
  recruitingStatus: jordanBellData.recruitingStatus,
  nilOpen: jordanBellData.nilOpen,
};
