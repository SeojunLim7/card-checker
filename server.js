// 일반 Node.js 호스팅(Render, Railway, Fly.io, 직접 관리하는 VPS 등)에서 그대로 실행할 수 있는 서버입니다.
// 정적 프론트엔드(public/index.html)도 같이 서빙합니다.
//
// 실행 방법:
//   1) npm install
//   2) .env.example 을 .env 로 복사하고 ANTHROPIC_API_KEY 값을 채워넣기
//   3) npm start
//   4) http://localhost:3000 접속

require("dotenv").config();
const express = require("express");
const path = require("path");
const { classifyCardImage } = require("./lib/checkCard");

const app = express();
const PORT = process.env.PORT || 3000;

// 브라우저에서 캔버스로 리사이즈한 이미지를 base64 JSON으로 보내므로
// 넉넉하게 10mb까지 허용합니다 (원본 사진 자체는 리사이즈 후 보통 1~2MB 이내예요).
app.use(express.json({ limit: "10mb" }));

// 이 API를 다른 도메인(예: 정적 사이트가 다른 호스팅에 있을 때)에서 호출한다면
// CORS_ORIGIN 환경변수에 그 사이트 주소를 넣어주세요. 기본값은 전체 허용(*)입니다.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "public")));

app.post("/api/check-card", async (req, res) => {
  try {
    const { imageBase64, mediaType } = req.body || {};
    if (!imageBase64 || !mediaType) {
      return res.status(400).json({ error: "imageBase64, mediaType이 필요합니다." });
    }
    if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) {
      return res.status(400).json({ error: "지원하지 않는 이미지 형식입니다. (JPEG/PNG/WebP/GIF)" });
    }

    const result = await classifyCardImage({
      base64: imageBase64,
      mediaType,
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL,
      workspaceId: process.env.ANTHROPIC_WORKSPACE_ID,
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    if (err.code === "missing_api_key") {
      return res.status(500).json({ error: "서버에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다." });
    }
    res.status(502).json({ error: "카드 판별 중 문제가 발생했어요. 잠시 후 다시 시도해주세요." });
  }
});

app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "이미지가 너무 커요. 사진을 다시 찍거나 더 작은 파일로 시도해주세요." });
  }
  console.error(err);
  res.status(500).json({ error: "알 수 없는 오류가 발생했어요." });
});

app.listen(PORT, () => {
  console.log(`편의점 교통카드 확인 서버가 http://localhost:${PORT} 에서 실행 중이에요.`);
});
