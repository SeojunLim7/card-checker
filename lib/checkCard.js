// 공통 로직: 업로드된 카드 사진을 Anthropic Claude API(Vision)로 보내서
// "한국 교통카드"인지 판별합니다 (선불/후불, 발급 주체와 무관).
// server.js(Express)와 api/check-card.js(Vercel 서버리스 함수) 양쪽에서 이 파일을 그대로 가져다 씁니다.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// 정확도가 가장 중요하면 'claude-sonnet-5', 속도/비용이 더 중요하면
// 'claude-haiku-4-5-20251001' 로 바꿔보세요.
const DEFAULT_MODEL = "claude-sonnet-5";

const PROMPT = `당신은 한국 교통카드를 판별하는 전문가입니다.
첨부된 사진 속 카드 한 장을 보고, 이 카드로 한국 대중교통(버스, 지하철 등) 요금을 결제할 수 있는지(교통카드 기능이 있는지) 판별하세요.

[교통카드로 판단해야 하는 경우 — 선불/후불, 발급 주체와 관계없이 전부 포함]
- 캐시비(Cashbee), 티머니(T-money), 레일플러스(RailPlus), 원카드(ONE Card), 하나로카드, 이즐(e-Z) 등 교통카드 브랜드 로고가 카드에 있으면 포함
- 편의점(CU, GS25, 세븐일레븐, 이마트24 등)에서 파는 선불 교통카드
- 은행/카드사가 발급한 체크카드·신용카드라도, Tmoney/캐시비 등 후불 교통 결제 기능을 나타내는 로고가 카드에 있으면 포함 (카드 소유자 이름이나 EMV 칩이 있어도 상관없이 교통카드로 판단)

[교통카드가 "아니오"인 경우]
- 교통카드 브랜드 로고나 후불 교통 표시가 전혀 없는 일반 신용/체크카드
- 학생증, 사원증, 신분증, 운전면허증 (교통 기능 표시가 없는 경우)
- 멤버십/포인트 카드 등 교통과 무관한 카드
- 카드가 아닌 것 (휴대폰 화면 등)

카드에 인쇄된 로고와 문구를 근거로 판단하세요.

반드시 아래 JSON 형식으로만, 다른 설명 없이 답하세요:
{"is_transit_card": boolean, "confidence": "high" | "medium" | "low", "detected_brand": string 또는 null, "reason": "한국어 1~2문장으로 판단 근거"}`;

/**
 * 모델 응답 텍스트에서 JSON 하나를 관대하게 추출합니다.
 * (코드펜스로 감싸져 오거나 앞뒤에 군더더기 텍스트가 붙는 경우 대비)
 */
function extractJson(text) {
  if (!text) throw new Error("empty model response");
  try {
    return JSON.parse(text);
  } catch (_) {
    // ignore
  }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch (_) {
      // ignore
    }
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (_) {
      // ignore
    }
  }
  throw new Error("could not parse JSON from model response: " + text.slice(0, 300));
}

/**
 * @param {Object} params
 * @param {string} params.base64 - 이미지의 base64 인코딩 데이터 (data: 접두사 제외)
 * @param {string} params.mediaType - 예: "image/jpeg", "image/png"
 * @param {string} params.apiKey - Anthropic API 키
 * @param {string} [params.model] - 사용할 모델 ID
 * @param {string} [params.workspaceId] - 키가 워크스페이스에 연결되어 있지 않다는 오류(anthropic-workspace-id 필요)가 날 때만 필요
 * @returns {Promise<{is_transit_card: boolean, confidence: string, detected_brand: (string|null), reason: string}>}
 */
async function classifyCardImage({ base64, mediaType, apiKey, model, workspaceId }) {
  if (!apiKey) {
    const err = new Error("ANTHROPIC_API_KEY가 설정되어 있지 않습니다.");
    err.code = "missing_api_key";
    throw err;
  }
  if (!base64 || !mediaType) {
    const err = new Error("이미지 데이터가 없습니다.");
    err.code = "missing_image";
    throw err;
  }

  const headers = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
  };
  if (workspaceId) {
    headers["anthropic-workspace-id"] = workspaceId;
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    const err = new Error(`Anthropic API 오류 (${res.status}): ${bodyText.slice(0, 500)}`);
    err.code = "upstream_error";
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const parsed = extractJson(text);

  return {
    is_transit_card: parsed.is_transit_card === true,
    confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium",
    detected_brand: parsed.detected_brand ? String(parsed.detected_brand) : null,
    reason: parsed.reason ? String(parsed.reason) : "",
  };
}

module.exports = { classifyCardImage, DEFAULT_MODEL };
