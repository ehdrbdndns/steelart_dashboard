import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DASHBOARD_ROOT = path.resolve(__dirname, "..");
const MIGRATION_ROOT = path.join(DASHBOARD_ROOT, ".migration", "steelart");

const DEFAULT_DELAY_MS = 300;
const USER_AGENT = "steelart-migration/1.0";

function parseArgs(argv) {
  const options = {
    runId: null,
    delayMs: DEFAULT_DELAY_MS,
    limit: null,
    provider: "photon",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--run-id") {
      options.runId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--delay-ms") {
      options.delayMs = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      options.limit = Number.parseInt(argv[index + 1], 10);
      index += 1;
      continue;
    }

    if (arg === "--provider") {
      options.provider = cleanText(argv[index + 1])?.toLowerCase() ?? options.provider;
      index += 1;
    }
  }

  if (!options.runId) {
    throw new Error("Missing required argument: --run-id");
  }

  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
    throw new Error("Invalid --delay-ms value");
  }

  if (options.limit !== null && (!Number.isFinite(options.limit) || options.limit <= 0)) {
    throw new Error("Invalid --limit value");
  }

  if (!["photon", "nominatim"].includes(options.provider)) {
    throw new Error("Invalid --provider value");
  }

  return options;
}

function cleanText(value) {
  if (value === null || value === undefined) return null;

  const text = String(value)
    .normalize("NFKC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();

  return text || null;
}

function normalizeLoose(value) {
  const text = cleanText(value);
  if (!text) return "";

  return text
    .toLowerCase()
    .replace(/[_·•∙ㆍ]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRoadAddress(address) {
  const text = cleanText(address);
  if (!text) return null;

  const match = text.match(/도로명:\s*([^\n]+)/u);
  return cleanText(match?.[1] ?? null);
}

function isWeakAddress(address) {
  const text = cleanText(address);
  if (!text) return true;

  const normalized = normalizeLoose(text);
  if (["미술관", "재단", "공원", "해수욕장"].includes(text)) {
    return true;
  }

  return normalized.length < 8;
}

function buildQueries(row) {
  const queries = [];
  const placeName = cleanText(row.place_name_ko);
  const address = cleanText(row.address);
  const roadAddress = extractRoadAddress(address);

  if (placeName && roadAddress) {
    queries.push({
      strategy: "place_plus_road",
      query: `${placeName}, ${roadAddress}, 포항시, 대한민국`,
    });
  }

  if (placeName && address && !isWeakAddress(address)) {
    queries.push({
      strategy: "place_plus_address",
      query: `${placeName}, ${address.replace(/\n+/g, " ")}, 대한민국`,
    });
  }

  if (roadAddress) {
    queries.push({
      strategy: "road_only",
      query: `${roadAddress}, 포항시, 대한민국`,
    });
  }

  if (address && !isWeakAddress(address)) {
    queries.push({
      strategy: "address_only",
      query: `${address.replace(/\n+/g, " ")}, 대한민국`,
    });
  }

  if (placeName) {
    queries.push({
      strategy: "place_only",
      query: `${placeName}, 포항시, 대한민국`,
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const item of queries) {
    const key = normalizeLoose(item.query);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

async function searchProvider(provider, query) {
  if (provider === "nominatim") {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "3");
    url.searchParams.set("countrycodes", "kr");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim search failed: ${response.status}`);
    }

    const data = await response.json();
    return data.map((item) => ({
      lat: item.lat,
      lon: item.lon,
      display_name: item.display_name,
      type: item.type ?? null,
      class: item.class ?? null,
    }));
  }

  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "3");

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Photon search failed: ${response.status}`);
  }

  const data = await response.json();
  return (data.features ?? []).map((feature) => ({
    lat: feature.geometry?.coordinates?.[1] ?? null,
    lon: feature.geometry?.coordinates?.[0] ?? null,
    display_name: [
      feature.properties?.name,
      feature.properties?.street,
      feature.properties?.district,
      feature.properties?.city,
      feature.properties?.state,
      feature.properties?.country,
    ]
      .filter(Boolean)
      .join(", "),
    type: feature.properties?.type ?? null,
    class: feature.properties?.osm_key ?? null,
  }));
}

function scoreCandidate(row, strategy, candidate) {
  const displayName = cleanText(candidate.display_name) ?? "";
  const normalizedDisplay = normalizeLoose(displayName);
  const normalizedPlace = normalizeLoose(row.place_name_ko);
  const normalizedAddress = normalizeLoose(row.address);

  let score = 0;
  if (normalizedPlace && normalizedDisplay.includes(normalizedPlace)) {
    score += 3;
  }
  if (normalizedAddress && normalizedDisplay.includes(normalizedAddress.slice(0, 10))) {
    score += 2;
  }
  if (normalizedDisplay.includes(normalizeLoose("포항"))) {
    score += 1;
  }
  if (strategy === "place_plus_road" || strategy === "place_plus_address") {
    score += 1;
  }
  if (candidate.type === "park" || candidate.class === "tourism" || candidate.class === "leisure") {
    score += 1;
  }

  let confidence = "low";
  if (score >= 5) {
    confidence = "high";
  } else if (score >= 3) {
    confidence = "medium";
  }

  return {
    score,
    confidence,
  };
}

function selectBestCandidate(row, strategy, results) {
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const scored = results.map((candidate) => ({
    candidate,
    ...scoreCandidate(row, strategy, candidate),
  }));

  scored.sort((left, right) => right.score - left.score);
  return scored[0];
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const reportsRoot = path.join(MIGRATION_ROOT, options.runId, "reports");
  const inputPath = path.join(reportsRoot, "report.manual-geocode-required.json");
  const rows = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const targetRows = options.limit ? rows.slice(0, options.limit) : rows;

  const candidates = [];
  const summary = {
    run_id: options.runId,
    source_file: inputPath,
    processed_count: targetRows.length,
    found_count: 0,
    high_confidence_count: 0,
    medium_confidence_count: 0,
    low_confidence_count: 0,
    no_match_count: 0,
    error_count: 0,
    delay_ms: options.delayMs,
    provider: options.provider,
  };

  for (let index = 0; index < targetRows.length; index += 1) {
    const row = targetRows[index];
    const queries = buildQueries(row);
    let selected = null;
    let lastError = null;

    for (let queryIndex = 0; queryIndex < queries.length; queryIndex += 1) {
      const query = queries[queryIndex];
      try {
        const results = await searchProvider(options.provider, query.query);
        const best = selectBestCandidate(row, query.strategy, results);
        if (best) {
          selected = {
            source_key: row.source_key,
            artwork_key: row.artwork_key,
            sheet_row_number: row.sheet_row_number,
            place_name_ko: row.place_name_ko,
            address: row.address,
            query_strategy: query.strategy,
            query_text: query.query,
            lat: Number.parseFloat(best.candidate.lat),
            lng: Number.parseFloat(best.candidate.lon),
            confidence: best.confidence,
            score: best.score,
            display_name: best.candidate.display_name,
            osm_type: best.candidate.type ?? null,
            osm_class: best.candidate.class ?? null,
          };

          if (best.confidence !== "low" || query.strategy === "place_only" || queryIndex === queries.length - 1) {
            break;
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }

      if (queryIndex < queries.length - 1 && options.delayMs > 0) {
        await sleep(options.delayMs);
      }
    }

    if (!selected) {
      candidates.push({
        source_key: row.source_key,
        artwork_key: row.artwork_key,
        sheet_row_number: row.sheet_row_number,
        place_name_ko: row.place_name_ko,
        address: row.address,
        confidence: "none",
        error: lastError,
        query_count: queries.length,
      });
      summary.no_match_count += 1;
      if (lastError) {
        summary.error_count += 1;
      }
    } else {
      candidates.push(selected);
      summary.found_count += 1;
      summary[`${selected.confidence}_confidence_count`] += 1;
    }

    console.log(`processed=${index + 1}/${targetRows.length} found=${summary.found_count} no_match=${summary.no_match_count}`);

    if (index < targetRows.length - 1 && options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  const outputPath = path.join(reportsRoot, "report.alt-geocode-candidates.json");
  const summaryPath = path.join(reportsRoot, "report.alt-geocode-summary.json");

  await writeJson(outputPath, candidates);
  await writeJson(summaryPath, summary);

  console.log("Alternative geocode candidate generation completed.");
  console.log(`output=${outputPath}`);
  console.log(`summary=${summaryPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
