"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CatalogPackage } from "@/lib/types";

export function Catalog({ packages }: { packages: CatalogPackage[] }) {
  const [query, setQuery] = useState("");
  const filteredPackages = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return packages;
    return packages.filter((item) => {
      const latest = item.versions[0];
      return [
        item.id,
        latest.description,
        ...latest.keywords,
      ].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [packages, query]);

  return (
    <section aria-labelledby="catalog-title">
      <label className="search-wrap">
        <span aria-hidden="true">⌕</span>
        <input
          className="search"
          type="search"
          placeholder="Search packages, owners, or a vibe…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="catalog-heading">
        <h2 id="catalog-title">Fresh packages</h2>
        <span className="result-count">{filteredPackages.length} found</span>
      </div>
      <div className="package-grid">
        {filteredPackages.map((item) => {
          const latest = item.versions[0];
          return (
            <Link className="package-card" href={`/packages/${item.owner}/${item.name}`} key={item.id}>
              <div className="package-meta">
                <span>@{item.owner}</span>
                <span className="version">v{item.latestVersion}</span>
              </div>
              <h3>{item.name}</h3>
              <p>{latest.description ?? "A community JavaScript package."}</p>
              <div className="tags">
                {latest.keywords.slice(0, 4).map((keyword) => <span className="tag" key={keyword}>{keyword}</span>)}
              </div>
            </Link>
          );
        })}
        {filteredPackages.length === 0 && (
          <div className="empty">
            No packages match “{query}”. Try another vibe.
          </div>
        )}
      </div>
    </section>
  );
}
