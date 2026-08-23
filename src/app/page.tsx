import { Hero } from "@/components/marketing/Hero";
import { ProductPreview } from "@/components/marketing/ProductPreview";
import { IdentityExtensions } from "@/components/marketing/IdentityExtensions";
import { ClosingCta } from "@/components/marketing/ClosingCta";

export default function Home() {
  return (
    <>
      <Hero />
      <ProductPreview />
      <IdentityExtensions />
      <ClosingCta />
    </>
  );
}
