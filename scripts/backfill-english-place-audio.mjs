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

// 검증된 수동 오버라이드: DB 자연키 -> 영어 음원 파일명 (한자/로마숫자/특수문자/구분자/철자/한↔영 노이즈로 자동매칭 불가, 파일 존재 확인됨)
const MANUAL_AUDIO = {
  "김상균__風景기억의방pohang": "김상균_풍경-기억의 방_영어.wav",
  "정국택__비즈니스맨": "정국택_비지니스맨_영어.wav",
  "도흥록__빛의순환10i": "도흥록_빛의 순환 10-1_영어.wav",
  "박태동__원석자原石子201322": "박태동_원석자 2013-22_영어.wav",
  "제일테크노스__연오ᆞ세오이야기삼국유사": "제일테크노스_연오세오이야기-삼국유사_영어.wav",
  "엄익훈__스페이스p": "엄익훈_SPACE_P_영어.wav",
  "제일테크노스__비상飛上2023": "제일테크노스-비상2023_영어.wav",
  "강대영__selfportrait": "강대영_모기_영어.wav", // 작가/음원 각 1개, 사용자 확정(제목 self-portrait↔모기)
};

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
// 영어 음원 파일명 파싱: NFC 정규화 후 _영어/(영문제목) 제거, 첫 _ 기준 작가/제목 분리
function parseAudio(fileName) {
  let base = fileName.normalize("NFC").replace(/\.wav$/i, "");
  base = base.replace(/_영어\s*$/, "");
  const noParen = base.replace(/\s*\([^)]*\)\s*$/, "");
  const idx = noParen.indexOf("_");
  const artist = idx >= 0 ? noParen.slice(0, idx) : "";
  const title = idx >= 0 ? noParen.slice(idx + 1) : noParen;
  return { artistNorm: normalizeLoose(artist), titleNorm: normalizeLoose(title), combinedKey: keyOf(artist, title) };
}
// 2차 보강: 정규화 제목이 서로 포함관계이고 짧은 쪽 길이 >= 2면 후보
function containsRel(a, b) {
  if (!a || !b) return false;
  const shorter = a.length <= b.length ? a : b;
  if (shorter.length < 2) return false;
  return a.includes(b) || b.includes(a);
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
  const report = { ambiguousKeys: [], unmatchedArtworks: [], audioAmbiguous: [], audioStillMissing: [] };

  // 1) 영어 시트 인덱스
  const wb = XLSX.readFile(WORKBOOK_PATH, { cellDates: false, raw: false });
  const sheetIndex = new Map();
  const sheetDup = new Set();
  for (const r of readSheetRows(wb, ENGLISH_SHEET, 1)) {
    if (!normalizeLoose(r["작가명"]) || !normalizeLoose(r["작품명"])) continue;
    const k = keyOf(r["작가명"], r["작품명"]);
    if (sheetIndex.has(k)) sheetDup.add(k);
    sheetIndex.set(k, { placeNameEn: cleanText(r["작품위치"]), addressEn: cleanText(r["주소"]), materialEn: cleanText(r["재료.1"]) });
  }

  // 2) 영어 음원 인덱스 (exact: combinedKey, 보강: artistNorm, title-only: titleNorm)
  const audioExact = new Map();
  const audioByArtist = new Map();
  const audioByTitle = new Map();
  for (const e of await fs.readdir(EN_AUDIO_ROOT, { withFileTypes: true })) {
    if (!e.isFile() || !e.name.toLowerCase().endsWith(".wav")) continue;
    const { artistNorm, titleNorm, combinedKey } = parseAudio(e.name);
    const filePath = path.join(EN_AUDIO_ROOT, e.name);
    if (!audioExact.has(combinedKey)) audioExact.set(combinedKey, []);
    audioExact.get(combinedKey).push(filePath);
    if (!audioByArtist.has(artistNorm)) audioByArtist.set(artistNorm, []);
    audioByArtist.get(artistNorm).push({ titleNorm, fileName: e.name, filePath });
    if (titleNorm) {
      if (!audioByTitle.has(titleNorm)) audioByTitle.set(titleNorm, []);
      audioByTitle.get(titleNorm).push({ fileName: e.name, filePath });
    }
  }

  // 3) DB 인덱스
  const conn = await mysql.createConnection(dbConfig());
  const [dbRows] = await conn.query(
    `SELECT a.id AS artworkId, a.place_id AS placeId, ar.name_ko AS artist, a.title_ko AS title
     FROM artworks a JOIN artists ar ON ar.id = a.artist_id WHERE a.deleted_at IS NULL`,
  );
  const dbIndex = new Map();
  for (const r of dbRows) {
    const k = keyOf(r.artist, r.title);
    if (!dbIndex.has(k)) dbIndex.set(k, []);
    dbIndex.get(k).push(r);
  }

  // 4) 시트 매칭된 작품 선별
  const matched = [];
  for (const [k, list] of dbIndex) {
    if (list.length > 1) { report.ambiguousKeys.push({ key: k, names: list.map((x) => `${x.artist}_${x.title}`) }); continue; }
    const a = list[0];
    if (!sheetIndex.get(k) || sheetDup.has(k)) { report.unmatchedArtworks.push(`${a.artist}_${a.title}`); continue; }
    matched.push({ artworkId: a.artworkId, placeId: a.placeId, artist: a.artist, title: a.title, key: k, artistNorm: normalizeLoose(a.artist), titleNorm: normalizeLoose(a.title), sheet: sheetIndex.get(k) });
  }

  // 5) 오디오 매칭: exact → 2차 보강(contains, 단일)
  const usedPaths = new Set();
  const audioAssign = new Map(); // artworkId -> filePath
  for (const m of matched) {
    const ex = (audioExact.get(m.key) || []).filter((p) => !usedPaths.has(p));
    if (ex.length === 1) { audioAssign.set(m.artworkId, ex[0]); usedPaths.add(ex[0]); }
    else if (ex.length > 1) report.audioAmbiguous.push({ name: `${m.artist}_${m.title}`, files: ex.map((p) => path.basename(p)) });
  }
  // 5a) 검증된 수동 오버라이드
  const recoveredManual = [];
  for (const m of matched) {
    if (audioAssign.has(m.artworkId)) continue;
    const fn = MANUAL_AUDIO[m.key];
    if (!fn) continue;
    const fp = path.join(EN_AUDIO_ROOT, fn);
    try { await fs.access(fp); } catch { report.audioAmbiguous.push({ name: `${m.artist}_${m.title}`, files: [`${fn} (파일 없음)`] }); continue; }
    if (usedPaths.has(fp)) { report.audioAmbiguous.push({ name: `${m.artist}_${m.title}`, files: [`${fn} (이미 사용됨)`] }); continue; }
    audioAssign.set(m.artworkId, fp); usedPaths.add(fp);
    recoveredManual.push({ m, fileName: fn });
  }
  // 5b) 2차 보강: 같은 작가 + 제목 포함관계, 단일 후보
  const proposals = [];
  for (const m of matched) {
    if (audioAssign.has(m.artworkId)) continue;
    const cands = (audioByArtist.get(m.artistNorm) || [])
      .filter((c) => !usedPaths.has(c.filePath))
      .filter((c) => containsRel(m.titleNorm, c.titleNorm));
    if (cands.length === 1) proposals.push({ m, cand: cands[0] });
    else if (cands.length > 1) report.audioAmbiguous.push({ name: `${m.artist}_${m.title}`, files: cands.map((c) => c.fileName) });
  }
  const byFile = new Map();
  for (const p of proposals) { if (!byFile.has(p.cand.filePath)) byFile.set(p.cand.filePath, []); byFile.get(p.cand.filePath).push(p); }
  const recoveredContains = [];
  for (const [fp, ps] of byFile) {
    if (ps.length === 1) recoveredContains.push(ps[0]);
    else ps.forEach((p) => report.audioAmbiguous.push({ name: `${p.m.artist}_${p.m.title}`, files: [`${path.basename(fp)} (여러 작품 후보)`] }));
  }
  for (const r of recoveredContains) { audioAssign.set(r.m.artworkId, r.cand.filePath); usedPaths.add(r.cand.filePath); }

  // 5c) 3차 보강(title-only): 폴더 전체에서 정규화 제목이 유일하게 일치 (작가 다를 수 있어 검수용으로 분리)
  const titleProps = [];
  for (const m of matched) {
    if (audioAssign.has(m.artworkId)) continue;
    const cands = (audioByTitle.get(m.titleNorm) || []).filter((c) => !usedPaths.has(c.filePath));
    if (cands.length === 1) titleProps.push({ m, cand: cands[0] });
    else if (cands.length > 1) report.audioAmbiguous.push({ name: `${m.artist}_${m.title}`, files: cands.map((c) => c.fileName) });
  }
  const byFileT = new Map();
  for (const p of titleProps) { if (!byFileT.has(p.cand.filePath)) byFileT.set(p.cand.filePath, []); byFileT.get(p.cand.filePath).push(p); }
  const recoveredTitle = [];
  for (const [, ps] of byFileT) { if (ps.length === 1) recoveredTitle.push(ps[0]); }
  for (const r of recoveredTitle) { audioAssign.set(r.m.artworkId, r.cand.filePath); usedPaths.add(r.cand.filePath); }

  // 최종 미매칭 재계산
  report.audioStillMissing = matched.filter((m) => !audioAssign.has(m.artworkId)).map((m) => ({ name: `${m.artist}_${m.title}`, key: m.key }));

  // 6) S3 업로드(apply) + URL 계산
  const bucket = (process.env.AWS_S3_BUCKET || "").trim();
  const region = (process.env.AWS_REGION || "").trim();
  let s3 = null;
  if (APPLY) { if (!bucket || !region) throw new Error("AWS_S3_BUCKET/AWS_REGION required for --apply"); s3 = new S3Client({ region }); }

  const updates = [];
  for (const m of matched) {
    let audioUrl = null;
    const localPath = audioAssign.get(m.artworkId);
    if (localPath) {
      const buf = await fs.readFile(localPath);
      const sha = createHash("sha256").update(buf).digest("hex");
      const objectKey = `migration/steelart/audio/${m.artistNorm}-${m.titleNorm}/${sha.slice(0, 16)}-${safeFileName(path.basename(localPath))}`;
      audioUrl = s3Url(bucket, region, objectKey);
      if (APPLY) await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: buf, ContentType: "audio/wav" }));
    }
    updates.push({ ...m, audioUrl });
  }

  // 7) DB UPDATE(apply)
  if (APPLY) {
    for (const u of updates) {
      await conn.query(`UPDATE places SET name_en = ?, address_en = ?, updated_at = NOW() WHERE id = ?`, [u.sheet.placeNameEn, u.sheet.addressEn, u.placeId]);
      await conn.query(`UPDATE artworks SET material_en = ?, updated_at = NOW() WHERE id = ?`, [u.sheet.materialEn, u.artworkId]);
      if (u.audioUrl) await conn.query(`UPDATE artworks SET audio_url_en = ?, updated_at = NOW() WHERE id = ?`, [u.audioUrl, u.artworkId]);
    }
  }
  await conn.end();

  // 8) 리포트
  console.log(`MODE = ${APPLY ? "APPLY (S3 업로드 + DB UPDATE 수행)" : "DRY-RUN (쓰기 없음)"}`);
  console.log(`DB 작품=${dbRows.length}, 영어시트 키=${sheetIndex.size}`);
  console.log(`장소/주소 갱신 대상=${matched.length}`);
  console.log(`오디오 갱신 대상=${audioAssign.size} (exact + 보강)`);
  console.log(`\n[수동 오버라이드(검증된 매핑) ${recoveredManual.length}건] (DB작품  ←  음원파일)`);
  for (const r of recoveredManual) console.log(`  ${r.m.artist}_${r.m.title}  ←  ${r.fileName}`);
  console.log(`\n[2차 보강(같은 작가+제목 포함) ${recoveredContains.length}건] (DB작품  ←  음원파일)`);
  for (const r of recoveredContains) console.log(`  ${r.m.artist}_${r.m.title}  ←  ${r.cand.fileName}`);
  console.log(`\n[3차 보강(title-only, 작가 다를 수 있음 — 검수) ${recoveredTitle.length}건] (DB작품  ←  음원파일)`);
  for (const r of recoveredTitle) console.log(`  ${r.m.artist}_${r.m.title}  ←  ${r.cand.fileName}`);
  console.log(`\n작품 미매칭(시트)=${report.unmatchedArtworks.length}`, report.unmatchedArtworks);
  console.log(`DB 중복키(건너뜀)=${report.ambiguousKeys.length}`, report.ambiguousKeys);
  console.log(`오디오 모호(건너뜀)=${report.audioAmbiguous.length}`, report.audioAmbiguous);
  console.log(`오디오 여전히 없음=${report.audioStillMissing.length}`, JSON.stringify(report.audioStillMissing, null, 1));
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
