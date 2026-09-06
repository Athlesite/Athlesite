import { Hero } from "@/components/marketing/Hero";
import { ProductPreview } from "@/components/marketing/ProductPreview";
import { IdentityExtensions } from "@/components/marketing/IdentityExtensions";
import { Personalization } from "@/components/marketing/Personalization";
import { GrowthPath } from "@/components/marketing/GrowthPath";
import { TrustSection } from "@/components/marketing/TrustSection";
import { ClosingCta } from "@/components/marketing/ClosingCta";

export default function Home() {
  return (
    <>
      <Hero />
      <ProductPreview />
      <IdentityExtensions />
      <Personalization />
      <GrowthPath />
      <TrustSection />
      <ClosingCta />
    </>
  );
}
