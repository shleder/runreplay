import { GithubArtifact } from "./types.js";

export type ArtifactAvailability = "available" | "expired";

export function artifactAvailability(artifact: Pick<GithubArtifact, "expired">): ArtifactAvailability {
  return artifact.expired ? "expired" : "available";
}
