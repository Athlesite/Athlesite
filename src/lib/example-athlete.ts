export type ExampleAthlete = {
  name: string;
  sport: string;
  position: string;
  positionAbbr: string;
  classYear: string;
  location: string;
  heightWeight: string;
  bio: string;
  highlights: string[];
  displayUrl: string;
  routePath: string;
};

export const exampleAthlete: ExampleAthlete = {
  name: "Jordan Bell",
  sport: "Football",
  position: "Wide Receiver",
  positionAbbr: "WR",
  classYear: "2027",
  location: "Round Rock, TX",
  heightWeight: `6'2" · 185 lbs`,
  bio: "Wide receiver focused on route running, footwork, and film study. Balancing training with academics while preparing for the next level.",
  highlights: ["Highlight Reel", "Game Film", "Training Clip"],
  displayUrl: "athlesite.com/jordanbell",
  routePath: "/athletes/jordan-bell",
};
