import type { Metadata } from "next";
import { AthleteProfileClient } from "./AthleteProfileClient";

export const metadata: Metadata = {
  title: "Athlete Profile — Athlesite",
  description: "A preview Athlesite athlete profile.",
};

export default async function AthleteProfilePage({ params }: PageProps<"/athletes/[slug]">) {
  const { slug } = await params;
  return <AthleteProfileClient slug={slug} />;
}
