import {
  toAthleteProfileView,
  type AthleteProfileData,
  type AthleteProfileView,
} from "@/lib/athlete-profile";

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

export const exampleAthlete: ExampleAthlete = {
  ...toAthleteProfileView(jordanBellData),
  // Preserve the original aspirational short link shown on the homepage teaser
  // rather than the hyphenated slug used for the actual route.
  displayUrl: "athlesite.com/jordanbell",
};
