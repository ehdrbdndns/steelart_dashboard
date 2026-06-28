import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
    skipS3: false,
    skipDb: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--run-id") {
      options.runId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--skip-s3") {
      options.skipS3 = true;
      continue;
    }

    if (arg === "--skip-db") {
      options.skipDb = true;
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

function stableValue(value) {
  return value ?? null;
}

function payloadChanged(left, right, fields) {
  return fields.some((field) => stableValue(left[field]) !== stableValue(right[field]));
}

async function loadJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildTargetUrl(bucket, region, key) {
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

function createS3Client(region) {
  const accessKeyId = cleanText(process.env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = cleanText(process.env.AWS_SECRET_ACCESS_KEY);
  const sessionToken = cleanText(process.env.AWS_SESSION_TOKEN);

  return new S3Client({
    region,
    ...(accessKeyId && secretAccessKey
      ? {
          credentials: {
            accessKeyId,
            secretAccessKey,
            ...(sessionToken ? { sessionToken } : {}),
          },
        }
      : {}),
  });
}

function createCounter() {
  return {
    insert: 0,
    update: 0,
    skip: 0,
  };
}

function createApplySummary(runId, options) {
  return {
    run_id: runId,
    started_at: new Date().toISOString(),
    finished_at: null,
    status: "running",
    skip_s3: options.skipS3,
    skip_db: options.skipDb,
    s3: {
      uploaded_count: 0,
      skipped_count: 0,
      bucket: null,
      region: null,
    },
    db: {
      zones: createCounter(),
      artists: createCounter(),
      places: createCounter(),
      artworks: createCounter(),
      artwork_festivals: {
        replaced_artwork_count: 0,
        skipped_artwork_count: 0,
        inserted_row_count: 0,
        deleted_row_count: 0,
      },
      artwork_images: {
        replaced_artwork_count: 0,
        skipped_artwork_count: 0,
        reordered_artwork_count: 0,
        inserted_row_count: 0,
        deleted_row_count: 0,
      },
    },
    error: null,
  };
}

async function loadRunArtifacts(runId) {
  const runRoot = path.join(MIGRATION_ROOT, runId);
  const [
    zones,
    artists,
    places,
    artworks,
    artworkFestivals,
    artworkImages,
    mediaManifest,
    dryRunSummary,
    dryRunDbPlan,
    dryRunConflicts,
  ] = await Promise.all([
    loadJson(path.join(runRoot, "extract.zones.json")),
    loadJson(path.join(runRoot, "extract.artists.json")),
    loadJson(path.join(runRoot, "extract.places.json")),
    loadJson(path.join(runRoot, "extract.artworks.json")),
    loadJson(path.join(runRoot, "extract.artwork-festivals.json")),
    loadJson(path.join(runRoot, "extract.artwork-images.json")),
    loadJson(path.join(runRoot, "extract.media-manifest.json")),
    loadJson(path.join(runRoot, "dry-run.summary.json")),
    loadJson(path.join(runRoot, "dry-run.db-plan.json")),
    loadJson(path.join(runRoot, "dry-run.conflicts.json")),
  ]);

  return {
    runRoot,
    zones,
    artists,
    places,
    artworks,
    artworkFestivals,
    artworkImages,
    mediaManifest,
    dryRunSummary,
    dryRunDbPlan,
    dryRunConflicts,
  };
}

function indexBy(items, keyField = "key") {
  return new Map(items.map((item) => [item[keyField], item]));
}

function groupBy(items, keyField) {
  const map = new Map();
  for (const item of items) {
    const key = item[keyField];
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
  }
  return map;
}

function assertApprovedDryRun(artifacts) {
  if (artifacts.dryRunSummary.write_blocked) {
    throw new Error(`Dry-run is still blocked for run '${artifacts.dryRunSummary.run_id}'. Resolve blockers first.`);
  }

  if (artifacts.dryRunConflicts.length > 0) {
    throw new Error(`Dry-run conflicts are not empty for run '${artifacts.dryRunSummary.run_id}'.`);
  }

  if (artifacts.dryRunDbPlan.artwork_details.length !== artifacts.artworks.length) {
    throw new Error("dry-run.db-plan.json is out of sync with extract.artworks.json. Re-run dry-run first.");
  }
}

async function validateMediaManifest(mediaManifest, bucket, region) {
  for (const item of mediaManifest) {
    if (!(await fileExists(item.localPath))) {
      throw new Error(`Missing local media file: ${item.localPath}`);
    }

    const expectedUrl = buildTargetUrl(bucket, region, item.targetS3Key);
    const actualUrl = item.targetUrl === null || item.targetUrl === undefined ? null : String(item.targetUrl).trim();
    if (actualUrl !== expectedUrl) {
      throw new Error(
        `Target URL mismatch for '${item.localPath}'. Re-run extract with the current AWS bucket/region.`,
      );
    }
  }
}

async function uploadMediaManifest(mediaManifest, summary, options) {
  if (options.skipS3) {
    summary.s3.skipped_count = mediaManifest.length;
    return;
  }

  const bucket = cleanText(process.env.AWS_S3_BUCKET);
  const region = cleanText(process.env.AWS_REGION);
  if (!bucket || !region) {
    throw new Error("AWS_S3_BUCKET and AWS_REGION are required to upload migration media.");
  }

  summary.s3.bucket = bucket;
  summary.s3.region = region;
  await validateMediaManifest(mediaManifest, bucket, region);

  const s3Client = createS3Client(region);
  for (let index = 0; index < mediaManifest.length; index += 1) {
    const item = mediaManifest[index];
    const body = await fs.readFile(item.localPath);

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: item.targetS3Key,
        Body: body,
        ContentType: cleanText(item.contentType) ?? "application/octet-stream",
        Metadata: {
          sha256: item.sha256,
          kind: item.kind,
        },
      }),
    );

    summary.s3.uploaded_count += 1;
    if ((index + 1) % 50 === 0 || index + 1 === mediaManifest.length) {
      console.log(`uploaded_media=${index + 1}/${mediaManifest.length}`);
    }
  }
}

async function loadCurrentState(connection) {
  const [zoneRowsResult, artistRowsResult, placeRowsResult, artworkRowsResult] = await Promise.all([
    connection.query(
      `SELECT id, code, name_ko, name_en, sort_order
       FROM zones`,
    ),
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
      `SELECT id, title_ko, title_en, artist_id, place_id, category, production_year,
              size_text_ko, size_text_en, description_ko, description_en,
              audio_url_ko, audio_url_en, likes_count, material
       FROM artworks
       WHERE deleted_at IS NULL`,
    ),
  ]);

  const zones = zoneRowsResult[0];
  const artists = artistRowsResult[0];
  const places = placeRowsResult[0];
  const artworks = artworkRowsResult[0];

  const zoneByCode = new Map(zones.map((row) => [row.code, row]));
  const artistByName = new Map();
  for (const artist of artists) {
    const key = normalizeLoose(artist.name_ko);
    if (!artistByName.has(key)) {
      artistByName.set(key, []);
    }
    artistByName.get(key).push(artist);
  }

  return {
    zoneByCode,
    artistByName,
    placeById: new Map(places.map((row) => [row.id, row])),
    artworkById: new Map(artworks.map((row) => [row.id, row])),
  };
}

async function upsertZones(connection, zones, state, summary) {
  const zoneIdByKey = new Map();

  await connection.beginTransaction();
  try {
    for (const zone of zones) {
      const existing = state.zoneByCode.get(zone.code) ?? null;
      if (!existing) {
        const [result] = await connection.execute(
          `INSERT INTO zones (code, name_ko, name_en, sort_order)
           VALUES (?, ?, ?, ?)`,
          [zone.code, zone.name_ko, zone.name_en, zone.sort_order],
        );
        const nextRow = {
          id: result.insertId,
          code: zone.code,
          name_ko: zone.name_ko,
          name_en: zone.name_en,
          sort_order: zone.sort_order,
        };
        state.zoneByCode.set(zone.code, nextRow);
        zoneIdByKey.set(zone.key, nextRow.id);
        summary.db.zones.insert += 1;
        continue;
      }

      zoneIdByKey.set(zone.key, existing.id);
      if (payloadChanged(zone, existing, ["name_ko", "name_en", "sort_order"])) {
        await connection.execute(
          `UPDATE zones
           SET name_ko = ?, name_en = ?, sort_order = ?
           WHERE id = ?`,
          [zone.name_ko, zone.name_en, zone.sort_order, existing.id],
        );
        state.zoneByCode.set(zone.code, {
          ...existing,
          name_ko: zone.name_ko,
          name_en: zone.name_en,
          sort_order: zone.sort_order,
        });
        summary.db.zones.update += 1;
      } else {
        summary.db.zones.skip += 1;
      }
    }

    await connection.commit();
    return zoneIdByKey;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function upsertArtists(connection, artists, state, summary) {
  const artistIdByKey = new Map();

  await connection.beginTransaction();
  try {
    for (const artist of artists) {
      const matches = state.artistByName.get(normalizeLoose(artist.name_ko)) ?? [];
      if (matches.length > 1) {
        throw new Error(`Multiple active artists matched '${artist.name_ko}'. Re-run dry-run and resolve first.`);
      }

      if (matches.length === 0) {
        const [result] = await connection.execute(
          `INSERT INTO artists (name_ko, name_en, type, profile_image_url)
           VALUES (?, ?, ?, ?)`,
          [artist.name_ko, artist.name_en, artist.type, artist.profile_image_url],
        );
        const nextRow = {
          id: result.insertId,
          name_ko: artist.name_ko,
          name_en: artist.name_en,
          type: artist.type,
          profile_image_url: artist.profile_image_url,
        };
        state.artistByName.set(normalizeLoose(artist.name_ko), [nextRow]);
        artistIdByKey.set(artist.key, nextRow.id);
        summary.db.artists.insert += 1;
        continue;
      }

      const existing = matches[0];
      artistIdByKey.set(artist.key, existing.id);
      if (payloadChanged(artist, existing, ["name_en", "type", "profile_image_url"])) {
        await connection.execute(
          `UPDATE artists
           SET name_en = ?, type = ?, profile_image_url = ?
           WHERE id = ?`,
          [artist.name_en, artist.type, artist.profile_image_url, existing.id],
        );
        state.artistByName.set(normalizeLoose(artist.name_ko), [
          {
            ...existing,
            name_en: artist.name_en,
            type: artist.type,
            profile_image_url: artist.profile_image_url,
          },
        ]);
        summary.db.artists.update += 1;
      } else {
        summary.db.artists.skip += 1;
      }
    }

    await connection.commit();
    return artistIdByKey;
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function insertPlace(connection, place, zoneId) {
  const [result] = await connection.execute(
    `INSERT INTO places (name_ko, name_en, address, lat, lng, zone_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [place.name_ko, place.name_en, place.address, place.lat, place.lng, zoneId],
  );

  return {
    id: result.insertId,
    name_ko: place.name_ko,
    name_en: place.name_en,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    zone_id: zoneId,
  };
}

async function updatePlace(connection, placeId, place, zoneId) {
  await connection.execute(
    `UPDATE places
     SET name_ko = ?, name_en = ?, address = ?, lat = ?, lng = ?, zone_id = ?
     WHERE id = ?`,
    [place.name_ko, place.name_en, place.address, place.lat, place.lng, zoneId, placeId],
  );
}

async function insertArtwork(connection, artwork, artistId, placeId) {
  const [result] = await connection.execute(
    `INSERT INTO artworks (
      title_ko, title_en, artist_id, place_id, category, production_year,
      size_text_ko, size_text_en, description_ko, description_en,
      audio_url_ko, audio_url_en, likes_count, material
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      artwork.title_ko,
      artwork.title_en,
      artistId,
      placeId,
      artwork.category,
      artwork.production_year,
      artwork.size_text_ko,
      artwork.size_text_en,
      artwork.description_ko,
      artwork.description_en,
      artwork.audio_url_ko,
      artwork.audio_url_en,
      artwork.likes_count,
      artwork.material,
    ],
  );

  return {
    id: result.insertId,
    title_ko: artwork.title_ko,
    title_en: artwork.title_en,
    artist_id: artistId,
    place_id: placeId,
    category: artwork.category,
    production_year: artwork.production_year,
    size_text_ko: artwork.size_text_ko,
    size_text_en: artwork.size_text_en,
    description_ko: artwork.description_ko,
    description_en: artwork.description_en,
    audio_url_ko: artwork.audio_url_ko,
    audio_url_en: artwork.audio_url_en,
    likes_count: artwork.likes_count,
    material: artwork.material,
  };
}

async function updateArtwork(connection, artworkId, artwork, artistId, placeId) {
  await connection.execute(
    `UPDATE artworks
     SET title_ko = ?, title_en = ?, artist_id = ?, place_id = ?, category = ?, production_year = ?,
         size_text_ko = ?, size_text_en = ?, description_ko = ?, description_en = ?,
         audio_url_ko = ?, audio_url_en = ?, likes_count = ?, material = ?
     WHERE id = ?`,
    [
      artwork.title_ko,
      artwork.title_en,
      artistId,
      placeId,
      artwork.category,
      artwork.production_year,
      artwork.size_text_ko,
      artwork.size_text_en,
      artwork.description_ko,
      artwork.description_en,
      artwork.audio_url_ko,
      artwork.audio_url_en,
      artwork.likes_count,
      artwork.material,
      artworkId,
    ],
  );
}

async function replaceArtworkFestivals(connection, artworkId, targetRows, detail, summary) {
  const shouldReplace =
    !detail ||
    detail.match_status === "insert" ||
    (detail.festival_diff?.add?.length ?? 0) > 0 ||
    (detail.festival_diff?.remove?.length ?? 0) > 0;

  if (!shouldReplace) {
    summary.db.artwork_festivals.skipped_artwork_count += 1;
    return;
  }

  const [deleteResult] = await connection.execute(
    `DELETE FROM artwork_festivals WHERE artwork_id = ?`,
    [artworkId],
  );
  summary.db.artwork_festivals.deleted_row_count += deleteResult.affectedRows ?? 0;

  for (const row of targetRows) {
    await connection.execute(
      `INSERT INTO artwork_festivals (artwork_id, \`year\`) VALUES (?, ?)`,
      [artworkId, row.year],
    );
    summary.db.artwork_festivals.inserted_row_count += 1;
  }

  summary.db.artwork_festivals.replaced_artwork_count += 1;
}

async function replaceArtworkImages(connection, artworkId, targetRows, detail, summary) {
  const shouldReplace =
    !detail ||
    detail.match_status === "insert" ||
    (detail.image_diff?.add?.length ?? 0) > 0 ||
    (detail.image_diff?.remove?.length ?? 0) > 0 ||
    Boolean(detail.image_diff?.reordered);

  if (!shouldReplace) {
    summary.db.artwork_images.skipped_artwork_count += 1;
    return;
  }

  const [deleteResult] = await connection.execute(
    `DELETE FROM artwork_images WHERE artwork_id = ?`,
    [artworkId],
  );
  summary.db.artwork_images.deleted_row_count += deleteResult.affectedRows ?? 0;

  for (const row of targetRows) {
    await connection.execute(
      `INSERT INTO artwork_images (artwork_id, image_url) VALUES (?, ?)`,
      [artworkId, row.image_url],
    );
    summary.db.artwork_images.inserted_row_count += 1;
  }

  summary.db.artwork_images.replaced_artwork_count += 1;
  if (detail?.image_diff?.reordered) {
    summary.db.artwork_images.reordered_artwork_count += 1;
  }
}

async function applyArtworkUnits(connection, artifacts, state, zoneIdByKey, artistIdByKey, summary) {
  const placesByKey = indexBy(artifacts.places);
  const festivalsByArtworkKey = groupBy(artifacts.artworkFestivals, "artwork_key");
  const imagesByArtworkKey = groupBy(artifacts.artworkImages, "artwork_key");
  const artworkDetailsByKey = indexBy(artifacts.dryRunDbPlan.artwork_details, "artwork_key");

  for (const artwork of artifacts.artworks) {
    const detail = artworkDetailsByKey.get(artwork.key);
    if (!detail) {
      throw new Error(`Missing dry-run artwork detail for '${artwork.key}'.`);
    }

    if (detail.match_status === "conflict") {
      throw new Error(`Artwork '${artwork.key}' is still in conflict state.`);
    }

    const place = placesByKey.get(artwork.place_key);
    if (!place) {
      throw new Error(`Missing place payload for artwork '${artwork.key}'.`);
    }

    const artistId = artistIdByKey.get(artwork.artist_key);
    if (!artistId) {
      throw new Error(`Missing artist id mapping for artwork '${artwork.key}'.`);
    }

    const zoneId = place.zone_key ? (zoneIdByKey.get(place.zone_key) ?? null) : null;
    const festivalRows = festivalsByArtworkKey.get(artwork.key) ?? [];
    const imageRows = imagesByArtworkKey.get(artwork.key) ?? [];

    await connection.beginTransaction();
    try {
      let placeId;
      let artworkId;

      if (detail.match_status === "insert") {
        const nextPlace = await insertPlace(connection, place, zoneId);
        state.placeById.set(nextPlace.id, nextPlace);
        placeId = nextPlace.id;
        summary.db.places.insert += 1;

        const nextArtwork = await insertArtwork(connection, artwork, artistId, placeId);
        state.artworkById.set(nextArtwork.id, nextArtwork);
        artworkId = nextArtwork.id;
        summary.db.artworks.insert += 1;
      } else {
        const existingArtwork = state.artworkById.get(detail.existing_artwork_id);
        if (!existingArtwork) {
          throw new Error(
            `Existing artwork '${detail.existing_artwork_id}' no longer exists. Re-run dry-run before apply.`,
          );
        }

        const existingPlace = state.placeById.get(existingArtwork.place_id) ?? null;
        if (!existingPlace) {
          const nextPlace = await insertPlace(connection, place, zoneId);
          state.placeById.set(nextPlace.id, nextPlace);
          placeId = nextPlace.id;
          summary.db.places.insert += 1;
        } else {
          placeId = existingPlace.id;
          const nextPlacePayload = {
            name_ko: place.name_ko,
            name_en: place.name_en,
            address: place.address,
            lat: place.lat,
            lng: place.lng,
            zone_id: zoneId,
          };
          if (payloadChanged(nextPlacePayload, existingPlace, ["name_ko", "name_en", "address", "lat", "lng", "zone_id"])) {
            await updatePlace(connection, placeId, place, zoneId);
            state.placeById.set(placeId, {
              ...existingPlace,
              ...nextPlacePayload,
            });
            summary.db.places.update += 1;
          } else {
            summary.db.places.skip += 1;
          }
        }

        artworkId = existingArtwork.id;
        const nextArtworkPayload = {
          title_ko: artwork.title_ko,
          title_en: artwork.title_en,
          artist_id: artistId,
          place_id: placeId,
          category: artwork.category,
          production_year: artwork.production_year,
          size_text_ko: artwork.size_text_ko,
          size_text_en: artwork.size_text_en,
          description_ko: artwork.description_ko,
          description_en: artwork.description_en,
          audio_url_ko: artwork.audio_url_ko,
          audio_url_en: artwork.audio_url_en,
          likes_count: artwork.likes_count,
          material: artwork.material,
        };

        if (
          payloadChanged(nextArtworkPayload, existingArtwork, [
            "title_ko",
            "title_en",
            "artist_id",
            "place_id",
            "category",
            "production_year",
            "size_text_ko",
            "size_text_en",
            "description_ko",
            "description_en",
            "audio_url_ko",
            "audio_url_en",
            "likes_count",
            "material",
          ])
        ) {
          await updateArtwork(connection, artworkId, artwork, artistId, placeId);
          state.artworkById.set(artworkId, {
            ...existingArtwork,
            ...nextArtworkPayload,
          });
          summary.db.artworks.update += 1;
        } else {
          summary.db.artworks.skip += 1;
        }
      }

      await replaceArtworkFestivals(connection, artworkId, festivalRows, detail, summary);
      await replaceArtworkImages(connection, artworkId, imageRows, detail, summary);

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const artifacts = await loadRunArtifacts(options.runId);
  assertApprovedDryRun(artifacts);

  const summary = createApplySummary(options.runId, options);
  const summaryPath = path.join(artifacts.runRoot, "apply.summary.json");
  let connection;

  try {
    const bucket = cleanText(process.env.AWS_S3_BUCKET);
    const region = cleanText(process.env.AWS_REGION);
    summary.s3.bucket = bucket;
    summary.s3.region = region;

    if (!options.skipS3 && (!bucket || !region)) {
      throw new Error("AWS_S3_BUCKET and AWS_REGION must be set before running apply.");
    }

    if (bucket && region) {
      await validateMediaManifest(artifacts.mediaManifest, bucket, region);
    }

    await uploadMediaManifest(artifacts.mediaManifest, summary, options);

    if (!options.skipDb) {
      connection = await createDbConnection();
      const state = await loadCurrentState(connection);
      const zoneIdByKey = await upsertZones(connection, artifacts.zones, state, summary);
      const artistIdByKey = await upsertArtists(connection, artifacts.artists, state, summary);
      await applyArtworkUnits(connection, artifacts, state, zoneIdByKey, artistIdByKey, summary);
    }

    summary.status = "completed";
    summary.finished_at = new Date().toISOString();
    await writeJson(summaryPath, summary);

    console.log("SteelArt apply completed.");
    console.log(`run_id=${options.runId}`);
    console.log(`s3_uploaded=${summary.s3.uploaded_count}`);
    console.log(`artworks_inserted=${summary.db.artworks.insert}`);
    console.log(`artworks_updated=${summary.db.artworks.update}`);
    console.log(`artworks_skipped=${summary.db.artworks.skip}`);
  } catch (error) {
    summary.status = "failed";
    summary.finished_at = new Date().toISOString();
    summary.error = error instanceof Error ? error.message : String(error);
    await writeJson(summaryPath, summary);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
