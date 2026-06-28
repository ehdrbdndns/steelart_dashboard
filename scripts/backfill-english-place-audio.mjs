import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import mysql from "mysql2/promise";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = path.resolve(DASHBOARD_ROOT, "..", "data");
const WORKBOOK_PATH = path.join(
  DATA_ROOT,
  "★스틸아트페스티벌 구입및기증작품 현황(2012-2023)_최종_20260625.xls",
);
const EN_AUDIO_ROOT = path.join(
  DATA_ROOT,
  "작품설명(TTS)",
  "작품설명(TTS_음성안내 파일)_영어",
);
const ENGLISH_SHEET = "작품설명(영문)";
const APPLY = process.argv.includes("--apply");

function cleanText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value)
    .normalize("NFKC")
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!text || ["-", "없음", "미상", "n/a", "N/A"].includes(text)) return null;
  return text;
}
function normalizeLoose(value) {
  const text = cleanText(value);
  if (!text) return "";
  return text.toLowerCase().replace(/[_·•∙ㆍ]/g, " ").replace(/[^\p{L}\p{N}]+/gu, "");
}
function readSheetRows(workbook, sheetName, headerRowIndex = 1) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Missing sheet: ${sheetName}`);
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null, blankrows: false });
  const headerCounts = new Map();
  const headers = (grid[headerRowIndex] || []).map((cell) => {
    const base = cleanText(cell) ?? "";
    if (!base) return "";
    const count = headerCounts.get(base) ?? 0;
    headerCounts.set(base, count + 1);
    return count === 0 ? base : `${base}.${count}`;
  });
  const rows = [];
  for (let i = headerRowIndex + 1; i < grid.length; i += 1) {
    const cells = grid[i] || [];
    const row = {};
    let hasValue = false;
    headers.forEach((h, c) => { if (h) row[h] = cells[c] ?? null; if (cleanText(cells[c])) hasValue = true; });
    if (hasValue) rows.push(row);
  }
  return rows;
}
function keyOf(artist, title) {
  return `${normalizeLoose(artist)}__${normalizeLoose(title)}`;
}
function safeFileName(name) {
  return name.normalize("NFC").replace(/[^\p{L}\p{N}.\-]+/gu, "_");
}
function audioKeyFromFileName(fileName) {
  let base = fileName.normalize("NFC").replace(/\.wav$/i, "");
  base = base.replace(/_영어\s*$/, "");
  base = base.replace(/\s*\([^)]*\)\s*$/, "");
  const idx = base.indexOf("_");
  const artist = idx >= 0 ? base.slice(0, idx) : "";
  const title = idx >= 0 ? base.slice(idx + 1) : base;
  return keyOf(artist, title);
}
function dbConfig() {
  const host = (process.env.DB_HOST || "").trim();
  const LOCAL = new Set(["localhost", "127.0.0.1", "::1"]);
  const ssl = LOCAL.has(host.toLowerCase()) ? undefined : { rejectUnauthorized: false };
  return { host, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, ...(ssl ? { ssl } : {}) };
}
function s3Url(bucket, region, key) {
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

async function main() {
  const report = { matchedPlace: 0, matchedAudio: 0, unmatchedArtworks: [], ambiguousKeys: [], audioAmbiguous: [], audioMissing: [] };

  const wb = XLSX.readFile(WORKBOOK_PATH, { cellDates: false, raw: false });
  const englishRows = readSheetRows(wb, ENGLISH_SHEET, 1);
  const sheetIndex = new Map();
  const sheetDup = new Set();
  for (const r of englishRows) {
    if (!normalizeLoose(r["작가명"]) || !normalizeLoose(r["작품명"])) continue;
    const k = keyOf(r["작가명"], r["작품명"]);
    if (sheetIndex.has(k)) sheetDup.add(k);
    sheetIndex.set(k, { placeNameEn: cleanText(r["작품위치"]), addressEn: cleanText(r["주소"]) });
  }

  const audioEntries = await fs.readdir(EN_AUDIO_ROOT, { withFileTypes: true });
  const audioIndex = new Map();
  for (const e of audioEntries) {
    if (!e.isFile() || !e.name.toLowerCase().endsWith(".wav")) continue;
    const k = audioKeyFromFileName(e.name);
    if (!audioIndex.has(k)) audioIndex.set(k, []);
    audioIndex.get(k).push(path.join(EN_AUDIO_ROOT, e.name));
  }

  const conn = await mysql.createConnection(dbConfig());
  const [dbRows] = await conn.query(
    `SELECT a.id AS artworkId, a.place_id AS placeId, ar.name_ko AS artist, a.title_ko AS title
     FROM artworks a JOIN artists ar ON ar.id = a.artist_id WHERE a.deleted_at IS NULL`,
  );
  const dbIndex = new Map();
  for (const r of dbRows) {
    const k = keyOf(r.artist, r.title);
    if (!dbIndex.has(k)) dbIndex.set(k, []);
    dbIndex.get(k).push({ artworkId: r.artworkId, placeId: r.placeId, artist: r.artist, title: r.title });
  }

  const bucket = (process.env.AWS_S3_BUCKET || "").trim();
  const region = (process.env.AWS_REGION || "").trim();
  let s3 = null;
  if (APPLY) {
    if (!bucket || !region) throw new Error("AWS_S3_BUCKET/AWS_REGION required for --apply");
    s3 = new S3Client({ region });
  }

  const updates = [];
  for (const [k, list] of dbIndex) {
    if (list.length > 1) { report.ambiguousKeys.push({ key: k, names: list.map((x) => `${x.artist}_${x.title}`) }); continue; }
    const { artworkId, placeId, artist, title } = list[0];
    const sheet = sheetIndex.get(k);
    if (!sheet || sheetDup.has(k)) { report.unmatchedArtworks.push(`${artist}_${title}`); continue; }
    report.matchedPlace += 1;

    let audioUrl = null;
    const audio = audioIndex.get(k);
    if (!audio) report.audioMissing.push(`${artist}_${title}`);
    else if (audio.length > 1) report.audioAmbiguous.push({ name: `${artist}_${title}`, files: audio.map((f) => path.basename(f)) });
    else {
      const localPath = audio[0];
      const buf = await fs.readFile(localPath);
      const sha = createHash("sha256").update(buf).digest("hex");
      const objectKey = `migration/steelart/audio/${normalizeLoose(artist)}-${normalizeLoose(title)}/${sha.slice(0, 16)}-${safeFileName(path.basename(localPath))}`;
      audioUrl = s3Url(bucket, region, objectKey);
      if (APPLY) {
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: buf, ContentType: "audio/wav" }));
      }
      report.matchedAudio += 1;
    }

    updates.push({ artworkId, placeId, nameEn: sheet.placeNameEn, addressEn: sheet.addressEn, audioUrl });
  }

  if (APPLY) {
    for (const u of updates) {
      await conn.query(`UPDATE places SET name_en = ?, address_en = ?, updated_at = NOW() WHERE id = ?`,
        [u.nameEn, u.addressEn, u.placeId]);
      if (u.audioUrl) {
        await conn.query(`UPDATE artworks SET audio_url_en = ?, updated_at = NOW() WHERE id = ?`,
          [u.audioUrl, u.artworkId]);
      }
    }
  }
  await conn.end();

  console.log(`MODE = ${APPLY ? "APPLY (S3 업로드 + DB UPDATE 수행)" : "DRY-RUN (쓰기 없음)"}`);
  console.log(`DB 작품=${dbRows.length}, 영어시트 키=${sheetIndex.size}, 영어음원 키=${audioIndex.size}`);
  console.log(`매칭(place name/address 갱신 대상)=${report.matchedPlace}`);
  console.log(`매칭(audio_url_en 갱신 대상)=${report.matchedAudio}`);
  console.log(`작품 미매칭(시트에 없음/중복)=${report.unmatchedArtworks.length}`, report.unmatchedArtworks.slice(0, 10));
  console.log(`DB 중복키(ambiguous, 건너뜀)=${report.ambiguousKeys.length}`, report.ambiguousKeys);
  console.log(`오디오 ambiguous(여러 파일)=${report.audioAmbiguous.length}`, report.audioAmbiguous.slice(0, 10));
  console.log(`오디오 없음=${report.audioMissing.length}`, report.audioMissing.slice(0, 10));
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
