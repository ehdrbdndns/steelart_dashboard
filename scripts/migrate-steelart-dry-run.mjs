import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDbConnection } from "./lib/db-connection.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DASHBOARD_ROOT = path.resolve(__dirname, "..");
const MIGRATION_ROOT = path.join(DASHBOARD_ROOT, ".migration", "steelart");

function parseArgs(argv) {
  const options = {
    runId: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--run-id") {
      options.runId = argv[index + 1];
      index += 1;
    }
  }

  if (!options.runId) {
    throw new Error("Missing required argument: --run-id");
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

async function loadJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function loadJsonl(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function stableValue(value) {
  return value ?? null;
}

function payloadChanged(left, right, fields) {
  return fields.some((field) => stableValue(left[field]) !== stableValue(right[field]));
}

function tokenizeForMatch(value) {
  const text = cleanText(value);
  if (!text) return [];
  return text
    .split(/[\s/(),\-]+/)
    .map((token) => normalizeLoose(token))
    .filter((token) => token && token.length >= 2);
}

function placeNameScore(left, right) {
  const normalizedLeft = normalizeLoose(left);
  const normalizedRight = normalizeLoose(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 20;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return 12;

  const leftTokens = tokenizeForMatch(left);
  const rightTokens = tokenizeForMatch(right);
  let best = 0;
  for (const leftToken of leftTokens) {
    for (const rightToken of rightTokens) {
      if (leftToken === rightToken) {
        best = Math.max(best, 10);
      } else if (leftToken.includes(rightToken) || rightToken.includes(leftToken)) {
        best = Math.max(best, 8);
      }
    }
  }

  return best;
}

function artworkCandidateScore(artwork, extractPlace, existingArtwork, existingPlace) {
  let score = 0;
  score += placeNameScore(extractPlace?.name_ko, existingPlace?.name_ko);

  if (
    normalizeLoose(artwork.material) &&
    normalizeLoose(artwork.material) === normalizeLoose(existingArtwork.material)
  ) {
    score += 2;
  }

  if (
    normalizeLoose(artwork.size_text_ko) &&
    normalizeLoose(artwork.size_text_ko) === normalizeLoose(existingArtwork.size_text_ko)
  ) {
    score += 1;
  }

  if (
    normalizeLoose(artwork.description_ko) &&
    normalizeLoose(artwork.description_ko) === normalizeLoose(existingArtwork.description_ko)
  ) {
    score += 2;
  }

  return score;
}

function resolveAmbiguousArtworkMatch(matches, artwork, extractPlace, existingPlaceById, assignedArtworkIds) {
  const availableMatches = matches.filter((candidate) => !assignedArtworkIds.has(candidate.id));
  const targetMatches = availableMatches.length > 0 ? availableMatches : matches;
  const scored = targetMatches
    .map((candidate) => ({
      candidate,
      score: artworkCandidateScore(
        artwork,
        extractPlace,
        candidate,
        existingPlaceById.get(candidate.place_id),
      ),
    }))
    .sort((left, right) => right.score - left.score || left.candidate.id - right.candidate.id);

  if (scored.length === 0) return null;
  if (scored.length === 1) {
    return scored[0].score > 0 ? scored[0].candidate : null;
  }

  return scored[0].score > scored[1].score && scored[0].score > 0 ? scored[0].candidate : null;
}

function createCounter() {
  return {
    insert: 0,
    update: 0,
    skip: 0,
    conflict: 0,
  };
}

function createDbPlan() {
  return {
    zones: createCounter(),
    artists: createCounter(),
    places: createCounter(),
    artworks: createCounter(),
    artwork_festivals: {
      add: 0,
      remove: 0,
      keep: 0,
    },
    artwork_images: {
      add: 0,
      remove: 0,
      keep: 0,
      reordered: 0,
    },
  };
}

function addConflict(conflicts, type, message, details = {}) {
  conflicts.push({
    type,
    message,
    ...details,
  });
}

function listToMap(items, keyField = "key") {
  const map = new Map();

  for (const item of items) {
    if (!map.has(item[keyField])) {
      map.set(item[keyField], []);
    }
    map.get(item[keyField]).push(item);
  }

  return map;
}

function arrayDiff(targetValues, existingValues) {
  const targetSet = new Set(targetValues);
  const existingSet = new Set(existingValues);

  return {
    add: targetValues.filter((value) => !existingSet.has(value)),
    remove: existingValues.filter((value) => !targetSet.has(value)),
    keep: targetValues.filter((value) => existingSet.has(value)),
    reordered:
      targetValues.length === existingValues.length &&
      targetValues.some((value, index) => value !== existingValues[index]),
  };
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath, value) {
  await fs.writeFile(filePath, value, "utf8");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildSamplesMarkdown(sampleData) {
  const sections = [
    ["Insert 예정 작품", sampleData.insertArtworks],
    ["Update 예정 작품", sampleData.updateArtworks],
    ["Conflict 작품", sampleData.conflictArtworks],
    ["Geocode Failed 작품", sampleData.geocodeFailedArtworks],
    ["Audio Missing 작품", sampleData.audioMissingArtworks],
    ["대표사진 변경 작품", sampleData.representativeChangedArtworks],
  ];

  const lines = ["# SteelArt Dry-Run Samples", ""];

  for (const [title, items] of sections) {
    lines.push(`## ${title}`);
    lines.push("");

    if (!items.length) {
      lines.push("- 없음");
      lines.push("");
      continue;
    }

    for (const item of items) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runRoot = path.join(MIGRATION_ROOT, options.runId);
  const requiredFiles = [
    "extract.zones.json",
    "extract.artists.json",
    "extract.places.json",
    "extract.artworks.json",
    "extract.artwork-festivals.json",
    "extract.artwork-images.json",
    "extract.media-manifest.json",
    "extract.issues.jsonl",
  ];

  for (const fileName of requiredFiles) {
    if (!(await fileExists(path.join(runRoot, fileName)))) {
      throw new Error(`Missing extract output: ${fileName}`);
    }
  }

  const [
    zones,
    artists,
    places,
    artworks,
    artworkFestivals,
    artworkImages,
    mediaManifest,
    summary,
    extractIssues,
  ] = await Promise.all([
    loadJson(path.join(runRoot, "extract.zones.json")),
    loadJson(path.join(runRoot, "extract.artists.json")),
    loadJson(path.join(runRoot, "extract.places.json")),
    loadJson(path.join(runRoot, "extract.artworks.json")),
    loadJson(path.join(runRoot, "extract.artwork-festivals.json")),
    loadJson(path.join(runRoot, "extract.artwork-images.json")),
    loadJson(path.join(runRoot, "extract.media-manifest.json")),
    loadJson(path.join(runRoot, "extract.summary.json")),
    loadJsonl(path.join(runRoot, "extract.issues.jsonl")),
  ]);

  const conflicts = [];

  for (const [label, items] of [
    ["zones", zones],
    ["artists", artists],
    ["places", places],
    ["artworks", artworks],
  ]) {
    const map = listToMap(items);
    for (const [key, duplicates] of map.entries()) {
      if (duplicates.length > 1) {
        addConflict(conflicts, "duplicate_extract_key", `Duplicate extract key in ${label}`, {
          label,
          key,
          count: duplicates.length,
        });
      }
    }
  }

  const missingMediaFiles = [];
  for (const mediaItem of mediaManifest) {
    if (!(await fileExists(mediaItem.localPath))) {
      missingMediaFiles.push(mediaItem.localPath);
    }
  }

  const s3CollisionMap = new Map();
  for (const mediaItem of mediaManifest) {
    const bucket = s3CollisionMap.get(mediaItem.targetS3Key) ?? new Set();
    bucket.add(mediaItem.sha256);
    s3CollisionMap.set(mediaItem.targetS3Key, bucket);
  }

  for (const [targetS3Key, hashes] of s3CollisionMap.entries()) {
    if (hashes.size > 1) {
      addConflict(
        conflicts,
        "s3_key_hash_conflict",
        `Multiple hashes mapped to the same target S3 key '${targetS3Key}'.`,
        { targetS3Key, hashCount: hashes.size },
      );
    }
  }

  for (const issue of extractIssues) {
    if (issue.issueType === "duplicate_source_key") {
      addConflict(
        conflicts,
        "duplicate_source_key",
        `Duplicate source key '${issue.sourceKey}' exists in extract output rows.`,
        { sourceKey: issue.sourceKey },
      );
    }
  }

  const connection = await createDbConnection();

  try {
    const [
      zoneRowsResult,
      artistRowsResult,
      placeRowsResult,
      artworkRowsResult,
      festivalRowsResult,
      imageRowsResult,
    ] = await Promise.all([
      connection.query(`SELECT id, code, name_ko, name_en, sort_order FROM zones`),
      connection.query(
        `SELECT id, name_ko, name_en, type, profile_image_url
         FROM artists
         WHERE deleted_at IS NULL`,
      ),
      connection.query(
        `SELECT id, name_ko, name_en, address, lat, lng, zone_id
         FROM places
         WHERE deleted_at IS NULL`,
      ),
      connection.query(
        `SELECT a.id, a.title_ko, a.title_en, a.category, a.production_year,
                a.size_text_ko, a.size_text_en, a.description_ko, a.description_en,
                a.audio_url_ko, a.audio_url_en, a.likes_count, a.material, a.place_id,
                ar.name_ko AS artist_name_ko
         FROM artworks a
         LEFT JOIN artists ar ON ar.id = a.artist_id
         WHERE a.deleted_at IS NULL`,
      ),
      connection.query(
        `SELECT artwork_id, \`year\` AS festival_year
         FROM artwork_festivals`,
      ),
      connection.query(
        `SELECT artwork_id, image_url
         FROM artwork_images
         ORDER BY artwork_id ASC, id ASC`,
      ),
    ]);

    const existingZones = zoneRowsResult[0];
    const existingArtists = artistRowsResult[0];
    const existingPlaces = placeRowsResult[0];
    const existingArtworks = artworkRowsResult[0];
    const existingFestivals = festivalRowsResult[0];
    const existingImages = imageRowsResult[0];

    const existingZoneByCode = new Map(existingZones.map((row) => [row.code, row]));
    const existingArtistByName = new Map();
    for (const row of existingArtists) {
      const key = normalizeLoose(row.name_ko);
      if (!existingArtistByName.has(key)) {
        existingArtistByName.set(key, []);
      }
      existingArtistByName.get(key).push(row);
    }

    const existingPlaceById = new Map(existingPlaces.map((row) => [row.id, row]));
    const festivalsByArtworkId = new Map();
    for (const row of existingFestivals) {
      if (!festivalsByArtworkId.has(row.artwork_id)) {
        festivalsByArtworkId.set(row.artwork_id, []);
      }
      festivalsByArtworkId.get(row.artwork_id).push(String(row.festival_year));
    }

    const imagesByArtworkId = new Map();
    for (const row of existingImages) {
      if (!imagesByArtworkId.has(row.artwork_id)) {
        imagesByArtworkId.set(row.artwork_id, []);
      }
      imagesByArtworkId.get(row.artwork_id).push(row.image_url);
    }

    const existingArtworkIndex = new Map();
    const existingArtworkFestivalIndex = new Map();
    for (const row of existingArtworks) {
      const key = [
        normalizeLoose(row.artist_name_ko),
        normalizeLoose(row.title_ko),
        normalizeLoose(row.production_year),
      ].join("|");
      if (!existingArtworkIndex.has(key)) {
        existingArtworkIndex.set(key, []);
      }
      existingArtworkIndex.get(key).push(row);

      const years = festivalsByArtworkId.get(row.id) ?? [];
      for (const year of years) {
        const festivalKey = [
          normalizeLoose(row.artist_name_ko),
          normalizeLoose(row.title_ko),
          normalizeLoose(year),
        ].join("|");
        if (!existingArtworkFestivalIndex.has(festivalKey)) {
          existingArtworkFestivalIndex.set(festivalKey, []);
        }
        existingArtworkFestivalIndex.get(festivalKey).push(row);
      }
    }

    const dbPlan = createDbPlan();
    const artworkDetails = [];

    for (const zone of zones) {
      const existing = existingZoneByCode.get(zone.code);
      if (!existing) {
        dbPlan.zones.insert += 1;
        continue;
      }

      if (
        payloadChanged(zone, existing, ["name_ko", "name_en", "sort_order"])
      ) {
        dbPlan.zones.update += 1;
      } else {
        dbPlan.zones.skip += 1;
      }
    }

    for (const artist of artists) {
      const matches = existingArtistByName.get(normalizeLoose(artist.name_ko)) ?? [];
      if (matches.length === 0) {
        dbPlan.artists.insert += 1;
        continue;
      }

      if (matches.length > 1) {
        dbPlan.artists.conflict += 1;
        addConflict(conflicts, "artist_conflict", `Multiple existing artists matched '${artist.name_ko}'.`, {
          artistKey: artist.key,
          matchCount: matches.length,
        });
        continue;
      }

      if (
        payloadChanged(artist, matches[0], ["name_en", "type", "profile_image_url"])
      ) {
        dbPlan.artists.update += 1;
      } else {
        dbPlan.artists.skip += 1;
      }
    }

    const festivalsByArtworkKey = new Map();
    for (const row of artworkFestivals) {
      if (!festivalsByArtworkKey.has(row.artwork_key)) {
        festivalsByArtworkKey.set(row.artwork_key, []);
      }
      festivalsByArtworkKey.get(row.artwork_key).push(row.year);
    }

    const imagesByArtworkKey = new Map();
    for (const row of artworkImages) {
      if (!imagesByArtworkKey.has(row.artwork_key)) {
        imagesByArtworkKey.set(row.artwork_key, []);
      }
      imagesByArtworkKey.get(row.artwork_key).push(row.image_url);
    }

    const placesByKey = new Map(places.map((place) => [place.key, place]));
    const assignedArtworkIds = new Map();
    const sampleData = {
      insertArtworks: [],
      updateArtworks: [],
      conflictArtworks: [],
      geocodeFailedArtworks: [],
      audioMissingArtworks: [],
      representativeChangedArtworks: [],
    };

    for (const artwork of artworks) {
      const extractPlace = placesByKey.get(artwork.place_key);
      const targetFestivalYears = festivalsByArtworkKey.get(artwork.key) ?? [];
      const exactKey = [
        normalizeLoose(artists.find((artist) => artist.key === artwork.artist_key)?.name_ko),
        normalizeLoose(artwork.title_ko),
        normalizeLoose(artwork.production_year),
      ].join("|");
      const festivalKey = [
        normalizeLoose(artists.find((artist) => artist.key === artwork.artist_key)?.name_ko),
        normalizeLoose(artwork.title_ko),
        normalizeLoose(targetFestivalYears[0]),
      ].join("|");
      const exactMatches = existingArtworkIndex.get(exactKey) ?? [];
      const festivalMatches = existingArtworkFestivalIndex.get(festivalKey) ?? [];

      let matches = exactMatches;
      if (matches.length === 0) {
        matches = festivalMatches;
      }

      let matchStatus = "insert";
      let existingArtwork = null;

      if (matches.length === 0) {
        dbPlan.artworks.insert += 1;
        dbPlan.places.insert += 1;
      } else if (matches.length > 1) {
        const resolvedMatch = resolveAmbiguousArtworkMatch(
          matches,
          artwork,
          extractPlace,
          existingPlaceById,
          assignedArtworkIds,
        );

        if (!resolvedMatch) {
          dbPlan.artworks.conflict += 1;
          matchStatus = "conflict";
          addConflict(conflicts, "artwork_conflict", `Multiple existing artworks matched '${artwork.title_ko}'.`, {
            artworkKey: artwork.key,
            matchCount: matches.length,
          });
        } else {
          existingArtwork = resolvedMatch;
          matchStatus = "update";
        }
      } else {
        existingArtwork = matches[0];
        matchStatus = "update";
      }

      if (existingArtwork && assignedArtworkIds.has(existingArtwork.id)) {
        dbPlan.artworks.conflict += 1;
        matchStatus = "conflict";
        addConflict(conflicts, "artwork_conflict", `Existing artwork '${existingArtwork.id}' was matched by multiple extract artworks.`, {
          artworkKey: artwork.key,
          existingArtworkId: existingArtwork.id,
          firstArtworkKey: assignedArtworkIds.get(existingArtwork.id),
        });
        existingArtwork = null;
      }

      if (existingArtwork) {
        assignedArtworkIds.set(existingArtwork.id, artwork.key);

        if (
          payloadChanged(artwork, existingArtwork, [
            "title_en",
            "category",
            "production_year",
            "material",
            "size_text_ko",
            "size_text_en",
            "description_ko",
            "description_en",
            "audio_url_ko",
            "audio_url_en",
            "likes_count",
          ])
        ) {
          dbPlan.artworks.update += 1;
        } else {
          dbPlan.artworks.skip += 1;
          matchStatus = "skip";
        }

        const existingPlace = existingPlaceById.get(existingArtwork.place_id);
        if (!existingPlace || !extractPlace) {
          dbPlan.places.update += 1;
        } else {
          const existingZoneCode = existingZones.find((zone) => zone.id === existingPlace.zone_id)?.code ?? null;
          const extractZoneCode = zones.find((zone) => zone.key === extractPlace.zone_key)?.code ?? null;
          if (
            payloadChanged(
              {
                ...extractPlace,
                zone_code: extractZoneCode,
              },
              {
                ...existingPlace,
                zone_code: existingZoneCode,
              },
              ["name_ko", "name_en", "address", "lat", "lng", "zone_code"],
            )
          ) {
            dbPlan.places.update += 1;
          } else {
            dbPlan.places.skip += 1;
          }
        }
      }

      const existingFestivalYears = existingArtwork
        ? festivalsByArtworkId.get(existingArtwork.id) ?? []
        : [];
      const festivalDiff = arrayDiff(targetFestivalYears, existingFestivalYears);
      dbPlan.artwork_festivals.add += festivalDiff.add.length;
      dbPlan.artwork_festivals.remove += festivalDiff.remove.length;
      dbPlan.artwork_festivals.keep += festivalDiff.keep.length;

      const targetImages = imagesByArtworkKey.get(artwork.key) ?? [];
      const existingImageUrls = existingArtwork ? imagesByArtworkId.get(existingArtwork.id) ?? [] : [];
      const imageDiff = arrayDiff(targetImages, existingImageUrls);
      dbPlan.artwork_images.add += imageDiff.add.length;
      dbPlan.artwork_images.remove += imageDiff.remove.length;
      dbPlan.artwork_images.keep += imageDiff.keep.length;
      if (imageDiff.reordered) {
        dbPlan.artwork_images.reordered += 1;
      }

      artworkDetails.push({
        artwork_key: artwork.key,
        match_status: matchStatus,
        existing_artwork_id: existingArtwork?.id ?? null,
        artist_action: matchStatus === "insert" ? "insert" : matchStatus === "conflict" ? "conflict" : "match",
        place_action: matchStatus === "insert" ? "insert" : matchStatus === "conflict" ? "conflict" : "compare",
        festival_diff: festivalDiff,
        image_diff: imageDiff,
      });

      if (matchStatus === "insert" && sampleData.insertArtworks.length < 10) {
        sampleData.insertArtworks.push(`${artwork.title_ko} (${artwork.key})`);
      }

      if (matchStatus === "update" && sampleData.updateArtworks.length < 10) {
        sampleData.updateArtworks.push(`${artwork.title_ko} (${artwork.key})`);
      }

      if (matchStatus === "conflict") {
        sampleData.conflictArtworks.push(`${artwork.title_ko} (${artwork.key})`);
      }

      if (extractPlace && Number(extractPlace.lat) === 0 && Number(extractPlace.lng) === 0) {
        sampleData.geocodeFailedArtworks.push(`${artwork.title_ko} (${artwork.key})`);
      }

      if (!artwork.audio_url_ko && sampleData.audioMissingArtworks.length < 20) {
        sampleData.audioMissingArtworks.push(`${artwork.title_ko} (${artwork.key})`);
      }

      if (imageDiff.reordered || imageDiff.add[0] !== existingImageUrls[0]) {
        sampleData.representativeChangedArtworks.push(`${artwork.title_ko} (${artwork.key})`);
      }
    }

    const dryRunSummary = {
      run_id: options.runId,
      target_artwork_count: artworks.length,
      target_artist_count: artists.length,
      target_place_count: places.length,
      target_image_count: artworkImages.length,
      target_audio_count: mediaManifest.filter((item) => item.kind === "audio").length,
      s3_upload_planned_count: mediaManifest.length,
      local_file_missing_count: missingMediaFiles.length,
      geocode_failed_count: summary.geocode_failed_count ?? 0,
      english_missing_count: summary.english_missing_count ?? 0,
      unresolved_conflict_count: conflicts.length,
      manual_geocode_required_count: summary.geocode_failed_count ?? 0,
      db_plan: dbPlan,
      write_blocked:
        conflicts.length > 0 || missingMediaFiles.length > 0,
    };

    const s3Plan = {
      total_media_objects: mediaManifest.length,
      image_objects: mediaManifest.filter((item) => item.kind === "image").length,
      audio_objects: mediaManifest.filter((item) => item.kind === "audio").length,
      local_file_missing_count: missingMediaFiles.length,
      duplicate_content_collapsed_count:
        (summary.image_file_count_before_dedupe ?? 0) - (summary.image_file_count_after_dedupe ?? 0),
      target_key_collisions: conflicts.filter((item) => item.type === "s3_key_hash_conflict").length,
      items: mediaManifest.map((item) => ({
        kind: item.kind,
        artwork_key: item.artworkKey,
        local_path: item.localPath,
        sha256: item.sha256,
        target_s3_key: item.targetS3Key,
        target_url: item.targetUrl,
        exists_locally: !missingMediaFiles.includes(item.localPath),
        action: "upload",
      })),
    };

    await Promise.all([
      writeJson(path.join(runRoot, "dry-run.summary.json"), dryRunSummary),
      writeJson(
        path.join(runRoot, "dry-run.db-plan.json"),
        {
          ...dbPlan,
          artwork_details: artworkDetails,
        },
      ),
      writeJson(path.join(runRoot, "dry-run.s3-plan.json"), s3Plan),
      writeJson(path.join(runRoot, "dry-run.conflicts.json"), conflicts),
      writeText(path.join(runRoot, "dry-run.samples.md"), buildSamplesMarkdown(sampleData)),
    ]);

    console.log("SteelArt dry-run completed.");
    console.log(`run_id=${options.runId}`);
    console.log(`write_blocked=${dryRunSummary.write_blocked}`);
    console.log(`conflicts=${conflicts.length}`);
    console.log(`missing_media_files=${missingMediaFiles.length}`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
