import { createHash } from "node:crypto";
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
  "★스틸아트페스티벌 구입및기증작품 현황(2012-2023)_최종_20260514.xls",
);
const IMAGE_ROOTS = [
  {
    label: "작품사진",
    path: path.join(DATA_ROOT, "작품사진"),
  },
  {
    label: "작품사진2",
    path: path.join(DATA_ROOT, "작품사진2"),
  },
];
const AUDIO_ROOT = path.join(DATA_ROOT, "작품설명(TTS)");
const OUTPUT_ROOT = path.join(DASHBOARD_ROOT, ".migration", "steelart");
const MANUAL_GEOCODE_OVERRIDE_PATH = path.join(OUTPUT_ROOT, "manual-geocode-overrides.json");
const STATUS_COLUMN = "상태\n(A시급, B보통, C불급, D철거검토)";
const APP_FLAG_COLUMN = "스틸아트투어앱";
const MANAGER_COLUMN = "관리\n주체";
const ARTIST_COLUMN = "작가명";
const TITLE_COLUMN = "작품명";
const FESTIVAL_YEAR_COLUMN = "출품연도";
const PRODUCTION_YEAR_COLUMN = "제작년도";
const MATERIAL_COLUMN = "재료";
const SIZE_COLUMN = "작품크기\n(cm)";
const DESCRIPTION_COLUMN = "작품설명";
const PLACE_NAME_COLUMN = "작품위치";
const ADDRESS_COLUMN = "주소";
const ZONE_COLUMN = "권역";
const SERIAL_COLUMN = "연번";
const COORD_COLUMN = "좌표";
const CULL_COLUMN = "살생부";

// 상태 컬럼이 아래 값이면 물리적으로 사라진 작품으로 보고 적재에서 제외한다.
const EXCLUDED_STATUS_VALUES = ["작품 망실", "폐기", "D"];
// 살생부 컬럼이 아래 값이면 철거/폐기 후보로 보고 적재에서 제외한다.
const CULL_CANDIDATE_VALUE = "후보";

const COMPANY_KEYWORDS = [
  "재단",
  "재단법인",
  "미술관",
  "주식회사",
  "㈜",
  "센터",
  "학교",
  "대학",
  "협회",
  "연구소",
  "기업",
  "포스코",
];

const ZONE_MAP = new Map([
  [
    "영일대해수욕장",
    {
      code: "ZONE_01",
      name_ko: "영일대해수욕장",
      name_en: "Yeongildae Beach",
      sort_order: 1,
    },
  ],
  [
    "환호공원",
    {
      code: "ZONE_02",
      name_ko: "환호공원",
      name_en: "Hwanho Park",
      sort_order: 2,
    },
  ],
  [
    "해도근린공원",
    {
      code: "ZONE_03",
      name_ko: "해도근린공원",
      name_en: "Haedo Neighborhood Park",
      sort_order: 3,
    },
  ],
  [
    "포항운하",
    {
      code: "ZONE_04",
      name_ko: "포항운하",
      name_en: "Pohang Canal",
      sort_order: 4,
    },
  ],
  [
    "철길숲",
    {
      code: "ZONE_05",
      name_ko: "철길숲",
      name_en: "Cheolgil Forest",
      sort_order: 5,
    },
  ],
  [
    "오천 냉천",
    {
      code: "ZONE_06",
      name_ko: "오천 냉천",
      name_en: "Ocheon Naengcheon",
      sort_order: 6,
    },
  ],
  [
    "기타",
    {
      code: "ZONE_07",
      name_ko: "기타",
      name_en: "Others",
      sort_order: 7,
    },
  ],
]);

function timestampRunId() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}

function parseArgs(argv) {
  const options = {
    runId: timestampRunId(),
    overwrite: false,
    enableGeocoding:
      process.env.ENABLE_GEOCODING === "true" || process.env.ENABLE_GEOCODING === "1",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--run-id") {
      options.runId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--overwrite") {
      options.overwrite = true;
      continue;
    }

    if (arg === "--enable-geocoding") {
      options.enableGeocoding = true;
      continue;
    }
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

function replaceCommonTitleVariants(value) {
  return value
    .replace(/비즈니스/gu, "비지니스")
    .replace(/金/gu, "金");
}

function stripAsciiWords(value) {
  return value.replace(/[A-Za-z]+/g, " ");
}

function stripCjkIdeographs(value) {
  return value.replace(/[\p{Script=Han}]+/gu, " ");
}

function stripParentheticalSegments(value) {
  return value.replace(/\([^)]*\)/g, " ");
}

function extractParentheticalSegments(value) {
  return [...value.matchAll(/\(([^)]*)\)/g)].map((match) => cleanText(match[1])).filter(Boolean);
}

function normalizeRomanDigitVariants(value) {
  const candidates = new Set([value]);
  const romanPairs = [
    [/(\d+)\s*[- ]\s*III\b/giu, "$1-3"],
    [/(\d+)\s*[- ]\s*II\b/giu, "$1-2"],
    [/(\d+)\s*[- ]\s*IV\b/giu, "$1-4"],
    [/(\d+)\s*[- ]\s*I\b/giu, "$1-1"],
    [/(\d+)\s*[- ]\s*V\b/giu, "$1-5"],
  ];

  for (const [pattern, replacement] of romanPairs) {
    if (pattern.test(value)) {
      candidates.add(value.replace(pattern, replacement));
    }
  }

  return candidates;
}

function buildTitleVariants(value) {
  const text = cleanText(value);
  if (!text) {
    return new Set();
  }

  const variants = new Set([text, replaceCommonTitleVariants(text)]);
  const queue = [...variants];

  while (queue.length > 0) {
    const current = queue.pop();
    const derived = new Set([
      current,
      stripExtraFolderPrefix(current),
      stripParentheticalSegments(current),
      stripAsciiWords(current),
      stripCjkIdeographs(current),
      stripAsciiWords(stripParentheticalSegments(current)),
      stripCjkIdeographs(stripParentheticalSegments(current)),
      replaceCommonTitleVariants(stripExtraFolderPrefix(current)),
    ]);

    for (const segment of extractParentheticalSegments(current)) {
      derived.add(segment);
      derived.add(stripAsciiWords(segment));
      derived.add(stripCjkIdeographs(segment));
    }

    for (const item of [...derived]) {
      for (const romanVariant of normalizeRomanDigitVariants(item)) {
        derived.add(romanVariant);
      }
    }

    for (const item of derived) {
      const cleaned = cleanText(item);
      if (cleaned && !variants.has(cleaned)) {
        variants.add(cleaned);
        queue.push(cleaned);
      }
    }
  }

  const normalizedVariants = new Set();
  for (const variant of variants) {
    const normalized = normalizeLoose(variant);
    if (normalized) {
      normalizedVariants.add(normalized);
    }
  }

  return normalizedVariants;
}

function safeFileName(fileName) {
  return fileName.normalize("NFKC").replace(/[^a-zA-Z0-9._\-가-힣() ]/g, "_");
}

function createSlug(...parts) {
  const slug = parts
    .map((part) => cleanText(part))
    .filter(Boolean)
    .map((part) =>
      String(part)
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
    )
    .filter(Boolean)
    .join("-");

  return slug || "untitled";
}

function createBaseSourceKey(artistName, title, festivalYear) {
  return [
    normalizeLoose(artistName) || "unknown-artist",
    normalizeLoose(title) || "unknown-title",
    normalizeLoose(festivalYear) || "unknown-year",
  ].join("|");
}

function createSourceKey(artistName, title, festivalYear, serialValue, duplicateCount, rowNumber) {
  const baseKey = createBaseSourceKey(artistName, title, festivalYear);
  if ((duplicateCount ?? 0) <= 1) {
    return baseKey;
  }

  const serialSlug = normalizeLoose(serialValue) || `row${rowNumber}`;
  return `${baseKey}#${serialSlug}`;
}

function stringifyYear(value) {
  const text = cleanText(value);
  if (!text) return null;

  const match = text.match(/\d{4}/);
  return match ? match[0] : text;
}

function integerYear(value) {
  const year = stringifyYear(value);
  if (!year) return null;

  const parsed = Number.parseInt(year, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function findHeader(columns, pattern) {
  return columns.find((column) => column === pattern || column.includes(pattern)) ?? null;
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

  return {
    columns: headers,
    rows,
  };
}

async function ensureOutputDirectory(outputPath, overwrite) {
  try {
    await fs.access(outputPath);

    if (!overwrite) {
      throw new Error(`Output directory already exists: ${outputPath}`);
    }

    await fs.rm(outputPath, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  await fs.mkdir(outputPath, { recursive: true });
}

async function loadManualGeocodeOverrides() {
  try {
    const content = await fs.readFile(MANUAL_GEOCODE_OVERRIDE_PATH, "utf8");
    const rows = JSON.parse(content);
    const overrideMap = new Map();

    for (const row of rows) {
      const sourceKey = cleanText(row?.source_key);
      const lat = Number.parseFloat(row?.lat);
      const lng = Number.parseFloat(row?.lng);
      if (!sourceKey || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        continue;
      }

      overrideMap.set(sourceKey, {
        lat,
        lng,
        source: cleanText(row?.source ?? "manual_override"),
        display_name: cleanText(row?.display_name),
      });
    }

    return overrideMap;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return new Map();
    }
    throw error;
  }
}

function createIssueCollector() {
  const issues = [];

  return {
    add(issue) {
      issues.push({
        level: "warning",
        ...issue,
      });
    },
    all() {
      return issues;
    },
    countByType() {
      const counts = {};
      for (const issue of issues) {
        counts[issue.issueType] = (counts[issue.issueType] ?? 0) + 1;
      }
      return counts;
    },
  };
}

function classifyArtistType(nameKo) {
  const normalized = cleanText(nameKo) ?? "";
  const matchedKeyword = COMPANY_KEYWORDS.find((keyword) => normalized.includes(keyword));

  if (matchedKeyword) {
    return {
      type: "COMPANY",
      ambiguous: false,
    };
  }

  return {
    type: "INDIVIDUAL",
    ambiguous: true,
  };
}

function stripExtraFolderPrefix(name) {
  return (cleanText(name) ?? "")
    .replace(/^\(추가\)\s*/u, "")
    .replace(/^\d{4}\s+/u, "")
    .trim();
}

function shouldIgnoreMediaDir(name) {
  return name.startsWith("★") || name.startsWith("☆");
}

function parseArtworkInfoManifest(content) {
  const lines = content.split(/\r?\n/).map((line) => line.trim());
  const manifest = {
    artworkId: null,
    artworkTitle: null,
    folderName: null,
    thumbnailFile: null,
    detailFiles: [],
  };

  for (const line of lines) {
    if (line.startsWith("작품 ID:")) {
      manifest.artworkId = cleanText(line.slice("작품 ID:".length));
    } else if (line.startsWith("작품명:")) {
      manifest.artworkTitle = cleanText(line.slice("작품명:".length));
    } else if (line.startsWith("폴더명:")) {
      manifest.folderName = cleanText(line.slice("폴더명:".length));
    } else if (line.startsWith("썸네일 파일:")) {
      manifest.thumbnailFile = cleanText(line.slice("썸네일 파일:".length));
    } else if (/^\d+\.\s/.test(line)) {
      manifest.detailFiles.push(cleanText(line.replace(/^\d+\.\s*/, "")));
    }
  }

  return manifest;
}

async function sha256File(filePath) {
  const buffer = await fs.readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

function buildTargetUrl(key) {
  const bucket = cleanText(process.env.AWS_S3_BUCKET);
  const region = cleanText(process.env.AWS_REGION);

  if (!bucket || !region) {
    return null;
  }

  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

async function scanMediaDirectories() {
  const mediaDirs = [];

  for (const root of IMAGE_ROOTS) {
    const entries = await fs.readdir(root.path, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || shouldIgnoreMediaDir(entry.name)) {
        continue;
      }

      const dirPath = path.join(root.path, entry.name);
      const dirEntries = await fs.readdir(dirPath, { withFileTypes: true });
      const manifestEntry = dirEntries.find(
        (file) => file.isFile() && normalizeLoose(file.name) === normalizeLoose("작품정보.txt"),
      );
      const manifest = manifestEntry
        ? parseArtworkInfoManifest(
            await fs.readFile(path.join(dirPath, manifestEntry.name), "utf8"),
          )
        : null;

      const files = dirEntries
        .filter((file) => file.isFile())
        .map((file) => file.name)
        .filter((name) => /\.(jpg|jpeg|png)$/i.test(name))
        .map((name) => ({
          name,
          path: path.join(dirPath, name),
        }));

      if (files.length === 0) {
        continue;
      }

      const normalizedTitleKeys = new Set([
        ...buildTitleVariants(entry.name),
        ...buildTitleVariants(stripExtraFolderPrefix(entry.name)),
        ...buildTitleVariants(manifest?.artworkTitle),
        ...buildTitleVariants(manifest?.folderName),
      ]);

      mediaDirs.push({
        rootLabel: root.label,
        dirPath,
        dirName: entry.name,
        manifest,
        files,
        normalizedTitleKeys,
        searchableBlobNorm: normalizeLoose(
          [
            entry.name,
            manifest?.artworkTitle,
            manifest?.folderName,
            ...files.map((file) => file.name),
          ]
            .filter(Boolean)
            .join(" "),
        ),
      });
    }
  }

  return mediaDirs;
}

function indexMediaDirectories(mediaDirs) {
  const titleIndex = new Map();

  for (const mediaDir of mediaDirs) {
    for (const key of mediaDir.normalizedTitleKeys) {
      if (!titleIndex.has(key)) {
        titleIndex.set(key, []);
      }

      titleIndex.get(key).push(mediaDir);
    }
  }

  return titleIndex;
}

function matchMediaDirs({ title, titleEn, artist }, titleIndex) {
  const titleNorm = normalizeLoose(title);
  const titleEnNorm = normalizeLoose(titleEn);
  const artistNorm = normalizeLoose(artist);

  const titleVariants = [...buildTitleVariants(title)];
  if (titleNorm && !titleVariants.includes(titleNorm)) {
    titleVariants.unshift(titleNorm);
  }
  for (const variant of buildTitleVariants(titleEn)) {
    if (!titleVariants.includes(variant)) {
      titleVariants.push(variant);
    }
  }
  if (titleEnNorm && !titleVariants.includes(titleEnNorm)) {
    titleVariants.push(titleEnNorm);
  }

  if (titleVariants.length === 0) {
    return [];
  }

  let candidates = [];
  for (const variant of titleVariants) {
    const matched = titleIndex.get(variant) ?? [];
    if (matched.length > 0) {
      candidates = matched;
      break;
    }
  }

  if (candidates.length <= 1) {
    return candidates;
  }

  const artistMatched = candidates.filter((candidate) =>
    artistNorm ? candidate.searchableBlobNorm.includes(artistNorm) : false,
  );

  if (artistMatched.length > 0) {
    return artistMatched;
  }

  return candidates;
}

async function buildArtworkMedia({
  artworkKey,
  sourceKey,
  title,
  artist,
  matchedMediaDirs,
  issues,
}) {
  const fileRecords = [];

  for (const mediaDir of matchedMediaDirs) {
    for (const file of mediaDir.files) {
      const sha256 = await sha256File(file.path);
      fileRecords.push({
        sourceFolder: mediaDir.rootLabel,
        localPath: file.path,
        fileName: file.name,
        sha256,
      });
    }
  }

  const deduped = [];
  const seenHashes = new Set();

  for (const fileRecord of fileRecords) {
    if (seenHashes.has(fileRecord.sha256)) {
      continue;
    }

    seenHashes.add(fileRecord.sha256);
    deduped.push(fileRecord);
  }

  deduped.sort((left, right) => {
    const leftRole = rankImage(left.fileName);
    const rightRole = rankImage(right.fileName);
    if (leftRole !== rightRole) {
      return leftRole - rightRole;
    }

    const leftIndex = numericFileOrder(left.fileName);
    const rightIndex = numericFileOrder(right.fileName);
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.fileName.localeCompare(right.fileName, "ko");
  });

  if (deduped.length === 0) {
    issues.add({
      issueType: "image_missing",
      artworkKey,
      sourceKey,
      message: `No image files matched artwork '${title}' by '${artist}'.`,
    });
  }

  const artworkSlug = createSlug(artist, title, sourceKey.split("|").at(-1));

  return deduped.map((fileRecord, index) => {
    const sortIndex = index + 1;
    const targetS3Key = [
      "migration",
      "steelart",
      "artworks",
      artworkSlug,
      `${String(sortIndex).padStart(2, "0")}-${fileRecord.sha256.slice(0, 16)}-${safeFileName(
        fileRecord.fileName,
      )}`,
    ].join("/");

    return {
      artworkKey,
      sourceKey,
      sourceFolder: fileRecord.sourceFolder,
      localPath: fileRecord.localPath,
      fileName: fileRecord.fileName,
      sha256: fileRecord.sha256,
      contentType: inferContentType(fileRecord.fileName),
      role: imageRole(fileRecord.fileName),
      sortIndex,
      targetS3Key,
      targetUrl: buildTargetUrl(targetS3Key),
    };
  });
}

function rankImage(fileName) {
  const normalized = cleanText(fileName) ?? "";
  if (normalized.includes("(대표사진)")) return 1;
  if (normalized.startsWith("thumb__")) return 2;
  if (normalized.startsWith("detail_")) return 3;
  return 4;
}

function imageRole(fileName) {
  const normalized = cleanText(fileName) ?? "";
  if (normalized.includes("(대표사진)") || normalized.startsWith("thumb__")) {
    return "thumbnail";
  }

  return "detail";
}

function numericFileOrder(fileName) {
  const detailMatch = fileName.match(/detail_(\d+)/i);
  if (detailMatch) {
    return Number.parseInt(detailMatch[1], 10);
  }

  const suffixMatch = fileName.match(/_(\d+)(?=\.[^.]+$)/);
  if (suffixMatch) {
    return Number.parseInt(suffixMatch[1], 10);
  }

  return 999;
}

function inferContentType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpeg" || extension === ".jpg") return "image/jpeg";
  if (extension === ".wav") return "audio/wav";
  return "application/octet-stream";
}

async function scanAudioFiles() {
  const entries = await fs.readdir(AUDIO_ROOT, { withFileTypes: true });
  const audioFiles = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".wav")) {
      continue;
    }

    const baseName = entry.name.replace(/\.wav$/i, "");
    const separatorIndex = baseName.indexOf("_");
    const artistPart = separatorIndex >= 0 ? baseName.slice(0, separatorIndex) : null;
    const titlePart = separatorIndex >= 0 ? baseName.slice(separatorIndex + 1) : baseName;
    const filePath = path.join(AUDIO_ROOT, entry.name);

    audioFiles.push({
      fileName: entry.name,
      localPath: filePath,
      artistPart,
      titlePart,
      artistNorm: normalizeLoose(artistPart),
      titleNorm: normalizeLoose(titlePart),
      titleOnlyKey: normalizeLoose(titlePart),
      combinedKey: `${normalizeLoose(artistPart)}__${normalizeLoose(titlePart)}`,
    });
  }

  return audioFiles;
}

function indexAudioFiles(audioFiles) {
  const combinedIndex = new Map();
  const titleIndex = new Map();

  for (const audioFile of audioFiles) {
    if (!combinedIndex.has(audioFile.combinedKey)) {
      combinedIndex.set(audioFile.combinedKey, []);
    }
    combinedIndex.get(audioFile.combinedKey).push(audioFile);

    if (!titleIndex.has(audioFile.titleOnlyKey)) {
      titleIndex.set(audioFile.titleOnlyKey, []);
    }
    titleIndex.get(audioFile.titleOnlyKey).push(audioFile);
  }

  return {
    combinedIndex,
    titleIndex,
  };
}

async function matchAudioFile({ artist, title, artworkKey, sourceKey, issues }, audioIndex) {
  const combinedKey = `${normalizeLoose(artist)}__${normalizeLoose(title)}`;
  const exact = audioIndex.combinedIndex.get(combinedKey) ?? [];

  let selected = null;

  if (exact.length === 1) {
    selected = exact[0];
  } else if (exact.length > 1) {
    issues.add({
      issueType: "tts_match_ambiguous",
      artworkKey,
      sourceKey,
      message: "Multiple TTS files matched by artist+title.",
    });
  } else {
    const fallback = audioIndex.titleIndex.get(normalizeLoose(title)) ?? [];
    if (fallback.length === 1) {
      selected = fallback[0];
    } else if (fallback.length > 1) {
      issues.add({
        issueType: "tts_match_ambiguous",
        artworkKey,
        sourceKey,
        message: "Multiple TTS files matched by title only.",
      });
    }
  }

  if (!selected) {
    issues.add({
      issueType: "tts_missing",
      artworkKey,
      sourceKey,
      message: `No TTS file matched artwork '${title}' by '${artist}'.`,
    });
    return null;
  }

  const sha256 = await sha256File(selected.localPath);
  const artworkSlug = createSlug(artist, title, sourceKey.split("|").at(-1));
  const targetS3Key = [
    "migration",
    "steelart",
    "audio",
    artworkSlug,
    `${sha256.slice(0, 16)}-${safeFileName(selected.fileName)}`,
  ].join("/");

  return {
    kind: "audio",
    artworkKey,
    sourceKey,
    fileName: selected.fileName,
    localPath: selected.localPath,
    sha256,
    contentType: "audio/wav",
    targetS3Key,
    targetUrl: buildTargetUrl(targetS3Key),
  };
}

async function geocodeAddress(address, geocodeCache, options, issues, placeKey, sourceKey, manualGeocodeOverrides) {
  const override = manualGeocodeOverrides.get(sourceKey);
  if (override) {
    return {
      lat: override.lat,
      lng: override.lng,
    };
  }

  const normalizedAddress = cleanText(address);
  if (!normalizedAddress) {
    return {
      lat: 0,
      lng: 0,
    };
  }

  if (geocodeCache.has(normalizedAddress)) {
    return geocodeCache.get(normalizedAddress);
  }

  if (!options.enableGeocoding || !process.env.KAKAO_REST_API_KEY) {
    const fallback = { lat: 0, lng: 0 };
    geocodeCache.set(normalizedAddress, fallback);
    issues.add({
      issueType: "geocode_failed",
      placeKey,
      sourceKey,
      address: normalizedAddress,
      message: "Geocoding skipped or API key missing. Fell back to 0,0.",
    });
    return fallback;
  }

  try {
    const url = new URL("https://dapi.kakao.com/v2/local/search/address.json");
    url.searchParams.set("query", normalizedAddress);

    const response = await fetch(url, {
      headers: {
        Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Kakao geocoding failed with status ${response.status}`);
    }

    const data = await response.json();
    const document = data.documents?.[0];

    if (!document?.y || !document?.x) {
      throw new Error("No geocode result");
    }

    const result = {
      lat: Number.parseFloat(document.y),
      lng: Number.parseFloat(document.x),
    };

    geocodeCache.set(normalizedAddress, result);
    return result;
  } catch (error) {
    const fallback = { lat: 0, lng: 0 };
    geocodeCache.set(normalizedAddress, fallback);
    issues.add({
      issueType: "geocode_failed",
      placeKey,
      sourceKey,
      address: normalizedAddress,
      message: error instanceof Error ? error.message : "Unknown geocoding error",
    });
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeJsonl(filePath, values) {
  const content = values.map((value) => JSON.stringify(value)).join("\n");
  await fs.writeFile(filePath, content ? `${content}\n` : "", "utf8");
}

function createEnglishIndexes(englishRows) {
  const serialIndex = new Map();
  const artistTitleIndex = new Map();

  for (const englishRow of englishRows) {
    const serial = cleanText(englishRow.row[SERIAL_COLUMN]);
    if (serial) {
      if (!serialIndex.has(serial)) {
        serialIndex.set(serial, []);
      }
      serialIndex.get(serial).push(englishRow);
    }

    const key = `${normalizeLoose(englishRow.row[ARTIST_COLUMN])}__${normalizeLoose(
      englishRow.row[TITLE_COLUMN],
    )}`;
    if (!artistTitleIndex.has(key)) {
      artistTitleIndex.set(key, []);
    }
    artistTitleIndex.get(key).push(englishRow);
  }

  return {
    serialIndex,
    artistTitleIndex,
  };
}

function matchEnglishRow(overallRow, englishIndex, issues, sourceKey) {
  const serial = cleanText(overallRow.row[SERIAL_COLUMN]);
  if (serial) {
    const serialMatches = englishIndex.serialIndex.get(serial) ?? [];
    if (serialMatches.length === 1) {
      return {
        matched: true,
        sheetRowNumber: serialMatches[0].sheetRowNumber,
        row: serialMatches[0].row,
        matchStrategy: "serial",
      };
    }

    if (serialMatches.length > 1) {
      issues.add({
        issueType: "english_match_ambiguous",
        sourceKey,
        message: `Multiple english sheet rows matched serial '${serial}'.`,
      });
      return {
        matched: false,
      };
    }
  }

  const fallbackKey = `${normalizeLoose(overallRow.row[ARTIST_COLUMN])}__${normalizeLoose(
    overallRow.row[TITLE_COLUMN],
  )}`;
  const titleMatches = englishIndex.artistTitleIndex.get(fallbackKey) ?? [];

  if (titleMatches.length === 1) {
    return {
      matched: true,
      sheetRowNumber: titleMatches[0].sheetRowNumber,
      row: titleMatches[0].row,
      matchStrategy: "artist_title",
    };
  }

  if (titleMatches.length > 1) {
    issues.add({
      issueType: "english_match_ambiguous",
      sourceKey,
      message: "Multiple english sheet rows matched artist+title.",
    });
    return {
      matched: false,
    };
  }

  issues.add({
    issueType: "english_missing",
    sourceKey,
    message: "No english sheet row matched this artwork.",
  });
  return {
    matched: false,
  };
}

function isExcludedStatus(statusValue) {
  const text = cleanText(statusValue);
  if (!text) return false;

  if (EXCLUDED_STATUS_VALUES.includes(text)) {
    return true;
  }

  // 방어적 매칭: "작품 망실"/"폐기" 표기 변형, "D철거검토"처럼 D로 시작하는 상태도 제외한다.
  const norm = normalizeLoose(text);
  if (norm.includes(normalizeLoose("작품 망실"))) return true;
  if (norm === normalizeLoose("폐기")) return true;
  if (/^d(?![a-z])/i.test(text)) return true;

  return false;
}

function isCullCandidate(cullValue) {
  const text = cleanText(cullValue);
  if (!text) return false;
  return normalizeLoose(text) === normalizeLoose(CULL_CANDIDATE_VALUE);
}

// 새 엑셀의 "좌표" 컬럼은 "lat, lng" 형식이다. 한 셀에 좌표가 둘 이상 붙은 더러운 값도 있어
// 한국 좌표 범위에 드는 첫 유효쌍을 채택하고, 둘 이상 잡히면 dirty로 표시한다.
function parseCoordinate(value) {
  const text = cleanText(value);
  if (!text) {
    return { coord: null, dirty: false };
  }

  const matches = [...text.matchAll(/(-?\d{1,3}\.\d{3,})\s*[, ]\s*(-?\d{1,3}\.\d{3,})/g)];
  const valid = [];
  for (const match of matches) {
    const lat = Number.parseFloat(match[1]);
    const lng = Number.parseFloat(match[2]);
    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= 33 &&
      lat <= 39 &&
      lng >= 124 &&
      lng <= 132
    ) {
      valid.push({ lat, lng });
    }
  }

  if (valid.length === 0) {
    return { coord: null, dirty: Boolean(text) };
  }

  return { coord: valid[0], dirty: valid.length > 1 };
}

// 적재 제외 사유를 단일 함수로 모아 두 패스(중복키 카운트/본문)가 동일 기준을 쓰게 한다.
function getRowExclusionReason(row) {
  const artist = cleanText(row[ARTIST_COLUMN]);
  const title = cleanText(row[TITLE_COLUMN]);
  if (!artist || !title) return "empty_identity";
  if (isExcludedStatus(row[STATUS_COLUMN])) return "excluded_status";
  if (isCullCandidate(row[CULL_COLUMN])) return "cull_candidate";
  if (!parseCoordinate(row[COORD_COLUMN]).coord) return "missing_coordinate";
  return null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = path.join(OUTPUT_ROOT, options.runId);
  await ensureOutputDirectory(outputPath, options.overwrite);

  const workbook = XLSX.readFile(WORKBOOK_PATH, {
    cellDates: false,
    raw: false,
  });

  const overallSheet = readSheetRows(workbook, "전체", 1);
  const englishSheet = readSheetRows(workbook, "작품설명(영문)", 1);
  const issues = createIssueCollector();
  const englishIndex = createEnglishIndexes(englishSheet.rows);
  const mediaDirs = await scanMediaDirectories();
  const mediaDirIndex = indexMediaDirectories(mediaDirs);
  const audioIndex = indexAudioFiles(await scanAudioFiles());

  const rowsJsonl = [];
  const zoneMap = new Map();
  const artistMap = new Map();
  const placeMap = new Map();
  const artworkMap = new Map();
  const festivalRows = [];
  const artworkImageRows = [];
  const mediaManifest = [];
  const seenSourceKeys = new Set();
  const sourceBaseKeyCounts = new Map();

  let excludedEmptyIdentityCount = 0;
  let excludedStatusCount = 0;
  let excludedCullCandidateCount = 0;
  let excludedMissingCoordinateCount = 0;
  let coordinateDirtyCount = 0;

  for (const rowEntry of overallSheet.rows) {
    const row = rowEntry.row;
    if (getRowExclusionReason(row)) {
      continue;
    }

    const artistNameKo = cleanText(row[ARTIST_COLUMN]);
    const titleKo = cleanText(row[TITLE_COLUMN]);
    const festivalYearString = stringifyYear(row[FESTIVAL_YEAR_COLUMN]);
    const baseSourceKey = createBaseSourceKey(artistNameKo, titleKo, festivalYearString);
    sourceBaseKeyCounts.set(baseSourceKey, (sourceBaseKeyCounts.get(baseSourceKey) ?? 0) + 1);
  }

  for (let index = 0; index < overallSheet.rows.length; index += 1) {
    const rowEntry = overallSheet.rows[index];
    const row = rowEntry.row;
    const statusValue = cleanText(row[STATUS_COLUMN]);
    const artistNameKo = cleanText(row[ARTIST_COLUMN]);
    const titleKo = cleanText(row[TITLE_COLUMN]);

    const exclusionReason = getRowExclusionReason(row);
    if (exclusionReason === "empty_identity") {
      excludedEmptyIdentityCount += 1;
      continue;
    }
    if (exclusionReason === "excluded_status") {
      excludedStatusCount += 1;
      continue;
    }
    if (exclusionReason === "cull_candidate") {
      excludedCullCandidateCount += 1;
      continue;
    }
    if (exclusionReason === "missing_coordinate") {
      excludedMissingCoordinateCount += 1;
      continue;
    }

    const festivalYearString = stringifyYear(row[FESTIVAL_YEAR_COLUMN]);
    const baseSourceKey = createBaseSourceKey(artistNameKo, titleKo, festivalYearString);
    const duplicateCount = sourceBaseKeyCounts.get(baseSourceKey) ?? 1;
    const sourceKey = createSourceKey(
      artistNameKo,
      titleKo,
      festivalYearString,
      row[SERIAL_COLUMN],
      duplicateCount,
      rowEntry.sheetRowNumber,
    );
    const rowId = `overall:${String(index + 1).padStart(6, "0")}`;
    const englishMatch = matchEnglishRow(rowEntry, englishIndex, issues, sourceKey);

    rowsJsonl.push({
      row_id: rowId,
      sheet_name: rowEntry.sheetName,
      sheet_row_number: rowEntry.sheetRowNumber,
      app_flag: cleanText(row[APP_FLAG_COLUMN]),
      status_value: statusValue,
      source_key: sourceKey,
      raw: {
        [MANAGER_COLUMN]: cleanText(row[MANAGER_COLUMN]),
        [ARTIST_COLUMN]: artistNameKo,
        [TITLE_COLUMN]: titleKo,
        [FESTIVAL_YEAR_COLUMN]: festivalYearString,
      },
      english_match: englishMatch.matched
        ? {
            matched: true,
            sheet_row_number: englishMatch.sheetRowNumber,
            match_strategy: englishMatch.matchStrategy,
          }
        : {
            matched: false,
      },
    });

    if (duplicateCount > 1) {
      issues.add({
        issueType: "duplicate_artwork_base_key",
        rowId,
        baseSourceKey,
        sourceKey,
        message: "Duplicate artist/title/year rows detected. Serial suffix was added to keep both artworks.",
      });
    }

    if (seenSourceKeys.has(sourceKey)) {
      issues.add({
        issueType: "duplicate_source_key",
        rowId,
        sourceKey,
        message: "Duplicate source_key detected even after disambiguation. Later duplicate row is skipped from canonical entities.",
      });
      continue;
    }

    seenSourceKeys.add(sourceKey);

    if (!artistNameKo || !titleKo) {
      issues.add({
        issueType: "required_field_missing",
        rowId,
        sourceKey,
        message: "Artist name or title is missing. Row is skipped from canonical entities.",
      });
      continue;
    }

    const zoneNameKo = cleanText(row[ZONE_COLUMN]);
    const zoneDefinition = zoneNameKo ? ZONE_MAP.get(zoneNameKo) : null;
    const zoneKey = zoneDefinition ? `zone:${zoneDefinition.name_ko}` : null;

    if (!zoneDefinition && zoneNameKo) {
      issues.add({
        issueType: "zone_unknown",
        rowId,
        sourceKey,
        message: `Unknown zone '${zoneNameKo}'.`,
      });
    }

    if (zoneDefinition && !zoneMap.has(zoneKey)) {
      zoneMap.set(zoneKey, {
        key: zoneKey,
        ...zoneDefinition,
      });
    }

    const artistKey = `artist:${normalizeLoose(artistNameKo)}`;
    if (!artistMap.has(artistKey)) {
      const artistType = classifyArtistType(artistNameKo);
      if (artistType.ambiguous) {
        issues.add({
          issueType: "artist_type_ambiguous",
          sourceKey,
          artistKey,
          message: `Artist '${artistNameKo}' defaulted to INDIVIDUAL.`,
        });
      }

      artistMap.set(artistKey, {
        key: artistKey,
        name_ko: artistNameKo,
        name_en: cleanText(englishMatch.row?.["작가명.1"]) ?? artistNameKo,
        type: artistType.type,
        profile_image_url: null,
      });
    }

    const placeKey = `place:${sourceKey}`;
    if (!placeMap.has(placeKey)) {
      // 좌표 컬럼을 직접 파싱한다. 본문에 진입한 행은 이미 유효 좌표를 보장한다.
      const parsedCoordinate = parseCoordinate(row[COORD_COLUMN]);
      if (parsedCoordinate.dirty) {
        coordinateDirtyCount += 1;
        issues.add({
          issueType: "coordinate_dirty",
          placeKey,
          sourceKey,
          rawCoordinate: cleanText(row[COORD_COLUMN]),
          message:
            "좌표 셀에 좌표쌍이 둘 이상 들어 있어 첫 유효쌍을 채택했다. 수동 확인 대상.",
        });
      }

      placeMap.set(placeKey, {
        key: placeKey,
        name_ko: cleanText(row[PLACE_NAME_COLUMN]) ?? `${titleKo} 설치 위치`,
        name_en: cleanText(row[PLACE_NAME_COLUMN]) ?? `${titleKo} 설치 위치`,
        address: cleanText(row[ADDRESS_COLUMN]),
        lat: parsedCoordinate.coord.lat,
        lng: parsedCoordinate.coord.lng,
        zone_key: zoneKey,
      });
    }

    const artworkKey = `artwork:${sourceKey}`;
    const matchedMediaDirs = matchMediaDirs(
      {
        title: titleKo,
        titleEn: cleanText(englishMatch.row?.["작품명.1"]),
        artist: artistNameKo,
      },
      mediaDirIndex,
    );

    if (matchedMediaDirs.length > 2) {
      issues.add({
        issueType: "media_match_ambiguous",
        artworkKey,
        sourceKey,
        message: `Multiple media directories matched artwork '${titleKo}'.`,
      });
    }

    const imageManifest = await buildArtworkMedia({
      artworkKey,
      sourceKey,
      title: titleKo,
      artist: artistNameKo,
      matchedMediaDirs,
      issues,
    });

    const audioManifest = await matchAudioFile(
      {
        artist: artistNameKo,
        title: titleKo,
        artworkKey,
        sourceKey,
        issues,
      },
      audioIndex,
    );

    const descriptionKo = cleanText(row[DESCRIPTION_COLUMN]) ?? "작품 설명 미제공";
    const descriptionEn = cleanText(englishMatch.row?.["작품설명.1"]) ?? descriptionKo;

    artworkMap.set(artworkKey, {
      key: artworkKey,
      source_key: sourceKey,
      artist_key: artistKey,
      place_key: placeKey,
      title_ko: titleKo,
      title_en: cleanText(englishMatch.row?.["작품명.1"]) ?? titleKo,
      category: cleanText(row[MANAGER_COLUMN]) === "미술관" ? "PUBLIC_ART" : "STEEL_ART",
      production_year: integerYear(row[PRODUCTION_YEAR_COLUMN]),
      material: cleanText(row[MATERIAL_COLUMN]) ?? cleanText(englishMatch.row?.["재료.1"]),
      size_text_ko: cleanText(row[SIZE_COLUMN]),
      size_text_en: cleanText(row[SIZE_COLUMN]),
      description_ko: descriptionKo,
      description_en: descriptionEn,
      audio_url_ko: audioManifest?.targetUrl ?? null,
      audio_url_en: null,
      likes_count: 0,
      app_flag: cleanText(row[APP_FLAG_COLUMN]),
      status_value: statusValue,
    });

    if (festivalYearString) {
      festivalRows.push({
        key: `artwork_festival:${sourceKey}:${festivalYearString}`,
        artwork_key: artworkKey,
        source_key: sourceKey,
        year: festivalYearString,
      });
    }

    for (const imageItem of imageManifest) {
      artworkImageRows.push({
        key: `artwork_image:${artworkKey}:${String(imageItem.sortIndex).padStart(2, "0")}`,
        artwork_key: artworkKey,
        source_key: sourceKey,
        sort_index: imageItem.sortIndex,
        role: imageItem.role,
        image_url: imageItem.targetUrl,
        target_s3_key: imageItem.targetS3Key,
      });
      mediaManifest.push({
        kind: "image",
        ...imageItem,
      });
    }

    if (audioManifest) {
      mediaManifest.push(audioManifest);
    }
  }

  const includedAppFlagDistribution = rowsJsonl.reduce((accumulator, row) => {
    const key = row.app_flag ?? "__BLANK__";
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});

  const summary = {
    run_id: options.runId,
    workbook_path: WORKBOOK_PATH,
    included_row_count: rowsJsonl.length,
    excluded_empty_identity_row_count: excludedEmptyIdentityCount,
    excluded_status_row_count: excludedStatusCount,
    excluded_cull_candidate_row_count: excludedCullCandidateCount,
    excluded_missing_coordinate_row_count: excludedMissingCoordinateCount,
    coordinate_dirty_count: coordinateDirtyCount,
    included_app_flag_distribution: includedAppFlagDistribution,
    english_matched_count: rowsJsonl.filter((row) => row.english_match.matched).length,
    english_missing_count: issues.countByType().english_missing ?? 0,
    audio_matched_count: mediaManifest.filter((item) => item.kind === "audio").length,
    audio_missing_count: issues.countByType().tts_missing ?? 0,
    image_file_count_before_dedupe: mediaDirs.reduce(
      (total, mediaDir) => total + mediaDir.files.length,
      0,
    ),
    image_file_count_after_dedupe: mediaManifest.filter((item) => item.kind === "image").length,
    zone_count: zoneMap.size,
    artist_count: artistMap.size,
    place_count: placeMap.size,
    artwork_count: artworkMap.size,
    artwork_festival_count: festivalRows.length,
    artwork_image_count: artworkImageRows.length,
    issue_count_by_type: issues.countByType(),
  };

  await Promise.all([
    writeJson(path.join(outputPath, "extract.summary.json"), summary),
    writeJsonl(path.join(outputPath, "extract.rows.jsonl"), rowsJsonl),
    writeJson(path.join(outputPath, "extract.zones.json"), [...zoneMap.values()]),
    writeJson(path.join(outputPath, "extract.artists.json"), [...artistMap.values()]),
    writeJson(path.join(outputPath, "extract.places.json"), [...placeMap.values()]),
    writeJson(path.join(outputPath, "extract.artworks.json"), [...artworkMap.values()]),
    writeJson(path.join(outputPath, "extract.artwork-festivals.json"), festivalRows),
    writeJson(path.join(outputPath, "extract.artwork-images.json"), artworkImageRows),
    writeJson(path.join(outputPath, "extract.media-manifest.json"), mediaManifest),
    writeJsonl(path.join(outputPath, "extract.issues.jsonl"), issues.all()),
  ]);

  console.log("SteelArt extract completed.");
  console.log(`run_id=${options.runId}`);
  console.log(`output_path=${outputPath}`);
  console.log(`included_rows=${summary.included_row_count}`);
  console.log(`artworks=${summary.artwork_count}`);
  console.log(`media_items=${mediaManifest.length}`);
  console.log(`issues=${issues.all().length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
