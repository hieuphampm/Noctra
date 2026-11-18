import noctraAiProduct from "@/data/products/noctra-ai.json";
import noctraStudioProduct from "@/data/products/noctra-studio.json";
import noctraAiReleases from "@/data/releases/noctra-ai.json";
import noctraStudioReleases from "@/data/releases/noctra-studio.json";

export interface ReleaseChannel {
  id: string;
  platform: string;
  format: string;
  label: string;
  published: boolean;
  status: "published" | "coming_soon" | "unavailable";
  statusLabel: string;
  version: string | null;
  architecture: string | null;
  fileSize: string | null;
  releaseDate: string | null;
  minRequirements: string;
  changelogHref: string;
  sha256: string | null;
  signatureInfo: string | null;
  downloadUrl: string | null;
}

export interface ProductReleaseManifest {
  productId: string;
  productName: string;
  distributionNote: string;
  channels: ReleaseChannel[];
}

export function getProductsData() {
  return {
    noctraAi: noctraAiProduct,
    noctraStudio: noctraStudioProduct,
  };
}

export function getReleaseManifests(): {
  noctraAi: ProductReleaseManifest;
  noctraStudio: ProductReleaseManifest;
} {
  return {
    noctraAi: noctraAiReleases as ProductReleaseManifest,
    noctraStudio: noctraStudioReleases as ProductReleaseManifest,
  };
}

export function getPublishedChannels(manifest: ProductReleaseManifest): ReleaseChannel[] {
  return manifest.channels.filter((channel) => channel.published && Boolean(channel.downloadUrl));
}
