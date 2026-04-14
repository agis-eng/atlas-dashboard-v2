#!/usr/bin/env node

import { prepareFathomSync, writePreparedFathomSync } from "../lib/fathom-sync.mjs";

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function main() {
  const days = Number(getArg("--days", process.env.FATHOM_SYNC_DAYS || "2"));
  const limit = Number(getArg("--limit", process.env.FATHOM_SYNC_LIMIT || "25"));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const options = {
    apiKey: process.env.FATHOM_API_KEY || "",
    baseUrl: process.env.FATHOM_API_BASE_URL || "https://api.fathom.video",
    meetingsPath: process.env.FATHOM_API_MEETINGS_PATH || "/v1/calls",
    since,
    limit,
    sourceFile: getArg("--source-file"),
  };

  const result = await prepareFathomSync(options);

  if (hasFlag("--write")) {
    await writePreparedFathomSync(result);
  }

  if (hasFlag("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(result.digest);
  console.log("");
  console.log(`Fetched ${result.meetingsFetched} meetings.`);
  console.log(`Prepared ${result.newCalls.length} new call note entries.`);
  if (!hasFlag("--write")) {
    console.log("Dry run only. Re-run with --write to update data/call-notes.yaml.");
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
