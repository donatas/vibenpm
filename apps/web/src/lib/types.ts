export type PackageOwner = {
  name: string;
  email: string;
  url?: string;
};

export type AgentPackageManifest = {
  $schema?: string;
  name: string;
  version: string;
  owner: PackageOwner;
  description?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  entrypoints?: string[];
};

export type CatalogPackageVersion = {
  version: string;
  description?: string;
  owner: Omit<PackageOwner, "email">;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords: string[];
  entrypoints: string[];
  files: string[];
  readme?: string;
  packagePath: string;
};

export type CatalogPackage = {
  id: string;
  owner: string;
  name: string;
  latestVersion: string;
  versions: CatalogPackageVersion[];
};
