#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
const SUPPORTED_ARCHITECTURES = ["amd64", "arm64"]
const REVISION_LABEL = "org.opencontainers.image.revision"
const VERSION_LABEL = "org.opencontainers.image.version"

function fail(message) {
  throw new Error(`Operator image identity verification failed: ${message}`)
}

export function verifyOperatorImageIdentity(
  manifest,
  expectedRevision,
  expectedVersion,
  loadImageConfig,
) {
  if (!Array.isArray(manifest?.manifests)) {
    fail("the canonical reference is not an OCI image index")
  }

  for (const descriptor of manifest.manifests) {
    const platform = descriptor?.platform
    const isSupportedImage =
      platform?.os === "linux" && SUPPORTED_ARCHITECTURES.includes(platform?.architecture)
    const isAttestation =
      platform?.os === "unknown" &&
      platform?.architecture === "unknown" &&
      descriptor?.annotations?.["vnd.docker.reference.type"] === "attestation-manifest"

    if (!isSupportedImage && !isAttestation) {
      fail(
        `unexpected runnable or non-attestation platform descriptor ${platform?.os ?? "missing"}/${platform?.architecture ?? "missing"}`,
      )
    }
  }

  for (const architecture of SUPPORTED_ARCHITECTURES) {
    const descriptors = manifest.manifests.filter(
      (descriptor) =>
        descriptor?.platform?.os === "linux" && descriptor?.platform?.architecture === architecture,
    )
    if (descriptors.length !== 1) {
      fail(`expected exactly one linux/${architecture} image, found ${descriptors.length}`)
    }

    const digest = descriptors[0].digest
    if (!DIGEST_PATTERN.test(digest)) {
      fail(`linux/${architecture} has an invalid digest: ${digest ?? "missing"}`)
    }

    const image = loadImageConfig(digest)
    const labels = image?.config?.Labels
    if (labels?.[REVISION_LABEL] !== expectedRevision) {
      fail(
        `linux/${architecture} revision is ${JSON.stringify(labels?.[REVISION_LABEL])}, expected ${JSON.stringify(expectedRevision)}`,
      )
    }
    if (labels?.[VERSION_LABEL] !== expectedVersion) {
      fail(
        `linux/${architecture} version is ${JSON.stringify(labels?.[VERSION_LABEL])}, expected ${JSON.stringify(expectedVersion)}`,
      )
    }
  }
}

function inspectJson(reference, ...args) {
  const output = execFileSync("docker", ["buildx", "imagetools", "inspect", reference, ...args], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
  return JSON.parse(output)
}

function main() {
  const [imageName, canonicalReference, expectedRevision, expectedVersion] = process.argv.slice(2)
  if (!imageName || !canonicalReference || !expectedRevision || !expectedVersion) {
    console.error(
      "Usage: verify-operator-image-identity.mjs <image-name> <canonical-reference> <revision> <version>",
    )
    process.exit(2)
  }

  try {
    const manifest = inspectJson(canonicalReference, "--raw")
    verifyOperatorImageIdentity(manifest, expectedRevision, expectedVersion, (digest) =>
      inspectJson(`${imageName}@${digest}`, "--format", "{{json .Image}}"),
    )
    console.log(
      `Verified ${canonicalReference}: linux/amd64 and linux/arm64 match revision ${expectedRevision} and version ${expectedVersion}.`,
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
