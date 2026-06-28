import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DASHBOARD_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(DASHBOARD_ROOT, "..");
const DATA_ROOT = path.join(WORKSPACE_ROOT, "data");
const WORKBOOK_PATH = path.join(
  DATA_ROOT,
  "★스틸아트페스티벌 구입및기증작품 현황(2012-2023)_최종_20260409.xls",
);
const MIGRATION_ROOT = path.join(DASHBOARD_ROOT, ".migration", "steelart");

const STATUS_COLUMN = "상태\n(A시급, B보통, C불급, D철거검토)";
const APP_FLAG_COLUMN = "스틸아트투어앱";
const MANAGER_COLUMN = "관리\n주체";
const ARTIST_COLUMN = "작가명";
const TITLE_COLUMN = "작품명";
const FESTIVAL_YEAR_COLUMN = "출품연도";
const PRODUCTION_YEAR_COLUMN = "제작년도";
const PLACE_NAME_COLUMN = "작품위치";
const ADDRESS_COLUMN = "주소";
const ZONE_COLUMN = "권역";
const SERIAL_COLUMN = "연번";

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
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text || ["-", "없음", "미상", "n/a", "N/A"].includes(text)) {
    return null;
  }

  return text;
}

function normalizeLoose(value) {
  const text = cleanText(value);
  if (!text) return "";

  return text
    .toLowerCase()
    .replace(/[_·•∙ㆍ]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function stringifyYear(value) {
  const text = cleanText(value);
  if (!text) return null;

  const match = text.match(/\d{4}/);
  return match ? match[0] : text;
}

function createBaseSourceKey(artistName, title, festivalYear) {
  return [
    normalizeLoose(artistName) || "unknown-artist",
    normalizeLoose(title) || "unknown-title",
    normalizeLoose(festivalYear) || "unknown-year",
  ].join("|");
}

function isLostArtwork(statusValue) {
  return normalizeLoose(statusValue).includes(normalizeLoose("작품 망실"));
}

function readSheetRows(workbook, sheetName, headerRowIndex = 1) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Missing sheet: ${sheetName}`);
  }

  const grid = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: null,
    blankrows: false,
  });

  const headerCounts = new Map();
  const headers = (grid[headerRowIndex] || []).map((cell) => {
    const baseHeader = cleanText(cell) ?? "";

    if (!baseHeader) {
      return "";
    }

    const count = headerCounts.get(baseHeader) ?? 0;
    headerCounts.set(baseHeader, count + 1);

    return count === 0 ? baseHeader : `${baseHeader}.${count}`;
  });

  const rows = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < grid.length; rowIndex += 1) {
    const cells = grid[rowIndex] || [];
    const row = {};
    let hasValue = false;

    headers.forEach((header, columnIndex) => {
      const value = cells[columnIndex] ?? null;
      if (header) {
        row[header] = value;
      }
      if (cleanText(value)) {
        hasValue = true;
      }
    });

    if (!hasValue) {
      continue;
    }

    rows.push({
      sheetName,
      sheetRowNumber: rowIndex + 1,
      row,
    });
  }

  return rows;
}

async function loadJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function loadJsonl(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeMarkdown(filePath, content) {
  await fs.writeFile(filePath, `${content}\n`, "utf8");
}

function pickRowFields(rowEntry) {
  const row = rowEntry.row;
  const artistName = cleanText(row[ARTIST_COLUMN]);
  const title = cleanText(row[TITLE_COLUMN]);
  const festivalYear = stringifyYear(row[FESTIVAL_YEAR_COLUMN]);

  return {
    sheet_name: rowEntry.sheetName,
    sheet_row_number: rowEntry.sheetRowNumber,
    serial: cleanText(row[SERIAL_COLUMN]),
    manager: cleanText(row[MANAGER_COLUMN]),
    artist_name_ko: artistName,
    title_ko: title,
    festival_year: festivalYear,
    production_year: stringifyYear(row[PRODUCTION_YEAR_COLUMN]),
    place_name_ko: cleanText(row[PLACE_NAME_COLUMN]),
    address: cleanText(row[ADDRESS_COLUMN]),
    zone_name_ko: cleanText(row[ZONE_COLUMN]),
    app_flag: cleanText(row[APP_FLAG_COLUMN]),
    status_value: cleanText(row[STATUS_COLUMN]),
    base_source_key:
      artistName || title
        ? createBaseSourceKey(artistName, title, festivalYear)
        : null,
  };
}

function buildIncludedArtworkRows(artworks, artworkImages, places, rowsJsonl) {
  const imageCountByArtworkKey = new Map();
  for (const row of artworkImages) {
    imageCountByArtworkKey.set(row.artwork_key, (imageCountByArtworkKey.get(row.artwork_key) ?? 0) + 1);
  }

  const placeByKey = new Map(places.map((place) => [place.key, place]));
  const rowBySourceKey = new Map(rowsJsonl.map((row) => [row.source_key, row]));

  return artworks.map((artwork) => {
    const sourceRow = rowBySourceKey.get(artwork.source_key) ?? null;
    const place = placeByKey.get(artwork.place_key) ?? null;

    return {
      artwork_key: artwork.key,
      source_key: artwork.source_key,
      sheet_row_number: sourceRow?.sheet_row_number ?? null,
      app_flag: artwork.app_flag ?? sourceRow?.app_flag ?? null,
      status_value: artwork.status_value ?? sourceRow?.status_value ?? null,
      artist_name_ko: sourceRow?.raw?.[ARTIST_COLUMN] ?? null,
      title_ko: artwork.title_ko,
      title_en: artwork.title_en,
      festival_year: sourceRow?.raw?.[FESTIVAL_YEAR_COLUMN] ?? null,
      production_year: artwork.production_year,
      place_name_ko: place?.name_ko ?? null,
      address: place?.address ?? null,
      lat: place?.lat ?? null,
      lng: place?.lng ?? null,
      zone_key: place?.zone_key ?? null,
      audio_url_ko: artwork.audio_url_ko,
      image_count: imageCountByArtworkKey.get(artwork.key) ?? 0,
    };
  });
}

function toMarkdownSection(title, items, fields) {
  const lines = [`## ${title}`, `총 ${items.length}건`, ""];

  if (items.length === 0) {
    lines.push("- 없음", "");
    return lines.join("\n");
  }

  items.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.title_ko ?? item.artist_name_ko ?? item.serial ?? "row"}`);
    for (const [label, field] of fields) {
      const value = item[field];
      lines.push(`- ${label}: ${value ?? ""}`);
    }
    lines.push("");
  });

  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runRoot = path.join(MIGRATION_ROOT, options.runId);
  const reportsRoot = path.join(runRoot, "reports");
  await fs.mkdir(reportsRoot, { recursive: true });

  const workbook = XLSX.readFile(WORKBOOK_PATH, {
    cellDates: false,
    raw: false,
  });
  const overallRows = readSheetRows(workbook, "전체", 1);

  const [artworks, artworkImages, places, rowsJsonl, issuesJsonl] = await Promise.all([
    loadJson(path.join(runRoot, "extract.artworks.json")),
    loadJson(path.join(runRoot, "extract.artwork-images.json")),
    loadJson(path.join(runRoot, "extract.places.json")),
    loadJsonl(path.join(runRoot, "extract.rows.jsonl")),
    loadJsonl(path.join(runRoot, "extract.issues.jsonl")),
  ]);

  const excludedLostArtworks = [];
  const excludedEmptyIdentityRows = [];

  for (const rowEntry of overallRows) {
    const row = rowEntry.row;
    const statusValue = cleanText(row[STATUS_COLUMN]);
    const artistName = cleanText(row[ARTIST_COLUMN]);
    const title = cleanText(row[TITLE_COLUMN]);

    if (!artistName && !title) {
      excludedEmptyIdentityRows.push({
        exclusion_reason: "empty_identity",
        ...pickRowFields(rowEntry),
      });
      continue;
    }

    if (isLostArtwork(statusValue)) {
      excludedLostArtworks.push({
        exclusion_reason: "lost_artwork",
        ...pickRowFields(rowEntry),
      });
    }
  }

  const includedArtworkRows = buildIncludedArtworkRows(artworks, artworkImages, places, rowsJsonl);
  const artworksMissingAudio = includedArtworkRows.filter((row) => !row.audio_url_ko);
  const artworksMissingImages = includedArtworkRows.filter((row) => row.image_count === 0);
  const geocodeFailedSourceKeys = new Set(
    issuesJsonl
      .filter((issue) => issue.issueType === "geocode_failed")
      .map((issue) => issue.sourceKey)
      .filter(Boolean),
  );
  const manualGeocodeRequired = includedArtworkRows.filter((row) => geocodeFailedSourceKeys.has(row.source_key));

  const summary = {
    run_id: options.runId,
    workbook_path: WORKBOOK_PATH,
    excluded_lost_artwork_count: excludedLostArtworks.length,
    excluded_empty_identity_count: excludedEmptyIdentityRows.length,
    artworks_missing_audio_count: artworksMissingAudio.length,
    artworks_missing_images_count: artworksMissingImages.length,
    manual_geocode_required_count: manualGeocodeRequired.length,
    generated_files: {
      excluded_lost_artworks: path.join(reportsRoot, "report.excluded-lost-artworks.json"),
      excluded_empty_identity: path.join(reportsRoot, "report.excluded-empty-identity.json"),
      artworks_missing_audio: path.join(reportsRoot, "report.artworks-missing-audio.json"),
      artworks_missing_images: path.join(reportsRoot, "report.artworks-missing-images.json"),
      manual_geocode_required: path.join(reportsRoot, "report.manual-geocode-required.json"),
      markdown_summary: path.join(reportsRoot, "report.gap-lists.md"),
    },
  };

  await Promise.all([
    writeJson(summary.generated_files.excluded_lost_artworks, excludedLostArtworks),
    writeJson(summary.generated_files.excluded_empty_identity, excludedEmptyIdentityRows),
    writeJson(summary.generated_files.artworks_missing_audio, artworksMissingAudio),
    writeJson(summary.generated_files.artworks_missing_images, artworksMissingImages),
    writeJson(summary.generated_files.manual_geocode_required, manualGeocodeRequired),
    writeJson(path.join(reportsRoot, "report.gap-summary.json"), summary),
  ]);

  const markdown = [
    "# SteelArt Migration Gap Lists",
    "",
    `- run_id: ${summary.run_id}`,
    `- excluded_lost_artwork_count: ${summary.excluded_lost_artwork_count}`,
    `- excluded_empty_identity_count: ${summary.excluded_empty_identity_count}`,
    `- artworks_missing_audio_count: ${summary.artworks_missing_audio_count}`,
    `- artworks_missing_images_count: ${summary.artworks_missing_images_count}`,
    `- manual_geocode_required_count: ${summary.manual_geocode_required_count}`,
    "",
    toMarkdownSection("Excluded Lost Artworks", excludedLostArtworks, [
      ["sheet_row_number", "sheet_row_number"],
      ["serial", "serial"],
      ["artist_name_ko", "artist_name_ko"],
      ["title_ko", "title_ko"],
      ["festival_year", "festival_year"],
      ["place_name_ko", "place_name_ko"],
      ["address", "address"],
      ["app_flag", "app_flag"],
      ["status_value", "status_value"],
    ]),
    toMarkdownSection("Excluded Empty Identity Rows", excludedEmptyIdentityRows, [
      ["sheet_row_number", "sheet_row_number"],
      ["serial", "serial"],
      ["place_name_ko", "place_name_ko"],
      ["address", "address"],
      ["app_flag", "app_flag"],
      ["status_value", "status_value"],
    ]),
    toMarkdownSection("Artworks Missing Audio", artworksMissingAudio, [
      ["sheet_row_number", "sheet_row_number"],
      ["artist_name_ko", "artist_name_ko"],
      ["title_ko", "title_ko"],
      ["festival_year", "festival_year"],
      ["place_name_ko", "place_name_ko"],
      ["address", "address"],
      ["app_flag", "app_flag"],
      ["status_value", "status_value"],
    ]),
    toMarkdownSection("Artworks Missing Images", artworksMissingImages, [
      ["sheet_row_number", "sheet_row_number"],
      ["artist_name_ko", "artist_name_ko"],
      ["title_ko", "title_ko"],
      ["festival_year", "festival_year"],
      ["place_name_ko", "place_name_ko"],
      ["address", "address"],
      ["app_flag", "app_flag"],
      ["status_value", "status_value"],
    ]),
    toMarkdownSection("Manual Geocode Required", manualGeocodeRequired, [
      ["sheet_row_number", "sheet_row_number"],
      ["artist_name_ko", "artist_name_ko"],
      ["title_ko", "title_ko"],
      ["festival_year", "festival_year"],
      ["place_name_ko", "place_name_ko"],
      ["address", "address"],
      ["app_flag", "app_flag"],
      ["status_value", "status_value"],
    ]),
  ].join("\n");

  await writeMarkdown(summary.generated_files.markdown_summary, markdown);

  console.log("SteelArt gap reports generated.");
  console.log(`run_id=${options.runId}`);
  console.log(`reports_root=${reportsRoot}`);
  console.log(`excluded_lost_artwork_count=${excludedLostArtworks.length}`);
  console.log(`excluded_empty_identity_count=${excludedEmptyIdentityRows.length}`);
  console.log(`artworks_missing_audio_count=${artworksMissingAudio.length}`);
  console.log(`artworks_missing_images_count=${artworksMissingImages.length}`);
  console.log(`manual_geocode_required_count=${manualGeocodeRequired.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
