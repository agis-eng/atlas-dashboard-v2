// Publishes all publishQueued=true listings to Facebook via the local Mac server
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: "https://correct-beagle-69309.upstash.io",
  token: "gQAAAAAAAQ69AAIncDJjMzczODA4MzhkOTU0M2MwODZjZjg0NWRmNGY3ZGU1NHAyNjkzMDk",
});

const SERVER = "http://127.0.0.1:18793";
const SECRET = "221ab502eb5364d2dd8f186c40483929af22d73486f048139474f9689e1922ed";

async function call(path, body) {
  const res = await fetch(`${SERVER}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mercari-Secret": SECRET },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: { raw: text.slice(0, 300) } }; }
}

async function updateListing(listings, id, patch) {
  const updated = listings.map(l => l.id === id ? { ...l, ...patch, updatedAt: new Date().toISOString() } : l);
  await redis.set("listings:all", JSON.stringify(updated));
  return updated;
}

async function publishListing(listing, listings) {
  console.log(`\n→ [${listing.title}] $${listing.price}`);

  // Start session
  const start = await call("/facebook/start", {});
  if (!start.ok) {
    console.log(`  ✗ Start failed: ${JSON.stringify(start.data)}`);
    listings = await updateListing(listings, listing.id, { facebookStatus: "error", facebookError: "Start failed" });
    return listings;
  }
  const sessionId = start.data.sessionId;
  console.log(`  ✓ Session started: ${sessionId}`);

  // Fill form
  await new Promise(r => setTimeout(r, 2000));
  const fill = await call("/facebook/fill", { sessionId, listing });
  if (!fill.ok) {
    console.log(`  ✗ Fill failed: ${JSON.stringify(fill.data)}`);
    listings = await updateListing(listings, listing.id, { facebookStatus: "error", facebookError: "Fill failed" });
    return listings;
  }
  console.log(`  ✓ Form filled`);

  // Submit
  await new Promise(r => setTimeout(r, 2000));
  const submit = await call("/facebook/submit", { sessionId });
  if (!submit.ok || !submit.data.success) {
    const err = submit.data?.error || JSON.stringify(submit.data).slice(0, 200);
    console.log(`  ✗ Submit failed: ${err}`);
    listings = await updateListing(listings, listing.id, { facebookStatus: "error", facebookError: err, status: "error" });
    return listings;
  }

  const url = submit.data.listingUrl || submit.data.finalUrl || "";
  console.log(`  ✓ Listed! ${url}`);
  listings = await updateListing(listings, listing.id, {
    facebookStatus: "listed",
    status: "listed",
    facebookListingUrl: url,
    publishQueued: false,
  });
  return listings;
}

async function main() {
  const raw = await redis.get("listings:all");
  let listings = Array.isArray(raw) ? raw : (typeof raw === "string" ? JSON.parse(raw) : []);
  const queued = listings.filter(l => l.publishQueued === true && l.title && l.price);

  console.log(`Publishing ${queued.length} listings to Facebook...\n`);

  for (let i = 0; i < queued.length; i++) {
    const listing = queued[i];
    console.log(`[${i + 1}/${queued.length}]`);
    listings = await publishListing(listing, listings);
    if (i < queued.length - 1) await new Promise(r => setTimeout(r, 3000));
  }

  const results = listings.filter(l => queued.some(q => q.id === l.id));
  const succeeded = results.filter(l => l.facebookStatus === "listed").length;
  const failed = results.filter(l => l.facebookStatus === "error").length;
  console.log(`\nDone: ${succeeded} listed, ${failed} failed`);
}

main().catch(console.error);
