// Vercel 서버리스 함수 버전입니다. 이 파일 하나를 정적 사이트 저장소의
// /api/check-card.js 위치에 두면, Vercel이 자동으로 /api/check-card 엔드포인트로 배포해줍니다.
// (server.js를 쓸 계획이라면 이 파일은 필요 없어요 — 둘 중 하나만 쓰면 됩니다.)
//
// 설정 방법:
//   1) Vercel 프로젝트 설정 > Environment Variables 에 ANTHROPIC_API_KEY 추가
//   2) lib/checkCard.js 도 함께 배포되어야 하므로 같은 저장소에 포함시켜주세요.

const { classifyCardImage } = require("../lib/checkCard");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 지원해요." });

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

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    if (err.code === "missing_api_key") {
      return res.status(500).json({ error: "서버에 ANTHROPIC_API_KEY가 설정되어 있지 않습니다." });
    }
    res.status(502).json({ error: "카드 판별 중 문제가 발생했어요. 잠시 후 다시 시도해주세요." });
  }
};

// Vercel 기본 body 크기 제한(4.5MB)보다 여유를 주기 위한 설정.
// (프론트엔드에서 이미 이미지를 리사이즈해서 보내지만 안전 마진을 둡니다)
module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};
