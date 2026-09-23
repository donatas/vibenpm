import { Catalog } from "@/components/catalog";
import type { CatalogPackage } from "@/lib/types";
import catalogData from "@/generated/packages.json";

const packages = catalogData as CatalogPackage[];

export default function Home() {
  return (
    <>
      <section className="hero">
        <p className="eyebrow">Community code, clearly labeled</p>
        <h1>Find code that matches your <em>vibe.</em></h1>
        <p className="hero-copy">
          A small, inspectable catalog of JavaScript packages published through pull requests.
          Browse the source, meet the owner, and decide what belongs in your project.
        </p>
      </section>
      <Catalog packages={packages} />
    </>
  );
}
