#!/usr/bin/env node
// Generate the Windows-only Tauri updater manifest published as a GitHub
// Release asset. GitHub serves it through the stable releases/latest URL.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , tag, artifactsDir] = process.argv;
const tagPattern = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (!tag || !artifactsDir || !tagPattern.test(tag)) {
  console.error("usage: gen-github-updater-manifest.mjs <vX.Y.Z> <artifacts-dir>");
  process.exit(2);
}

if (!existsSync(artifactsDir)) {
  console.error(`artifact directory does not exist: ${artifactsDir}`);
  process.exit(2);
}

const files = readdirSync(artifactsDir);
const signatures = files.filter((file) => /(?:x64|x86_64).*-setup\.exe\.sig$/i.test(file));
if (signatures.length !== 1) {
  console.error(`expected one x64 updater signature, found: ${signatures.join(", ") || "none"}`);
  process.exit(1);
}

const signatureFile = signatures[0];
const bundle = signatureFile.slice(0, -".sig".length);
if (!files.includes(bundle)) {
  console.error(`updater bundle is missing for signature: ${signatureFile}`);
  process.exit(1);
}

const repository = process.env.GITHUB_REPOSITORY || "shibaweidu/codex-desktop-manager";
const downloadUrl = `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(bundle)}`;
const manifest = {
  version: tag.slice(1),
  notes: `Codex App Manager ${tag}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(join(artifactsDir, signatureFile), "utf8").trim(),
      url: downloadUrl,
    },
  },
};

writeFileSync(join(artifactsDir, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${join(artifactsDir, "latest.json")}`);
