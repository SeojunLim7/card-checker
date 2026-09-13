# 편의점 교통카드 확인 (AI 이미지 판별 버전)

카드 사진을 올리면 Claude Vision(AI)이 카드 전체 디자인(로고, 인쇄된 이름 유무, 칩 유무 등)을 보고
편의점(CU·GS25·세븐일레븐 등) 판매용 선불 교통카드인지 판별해주는 웹앱이에요.
OCR 방식과 달리, 은행 체크카드에 붙은 Tmoney/캐시비 후불 교통 기능도 구분할 수 있어요.

API 키는 절대로 프론트엔드(브라우저) 코드에 넣으면 안 돼요 — 누구나 개발자 도구로 훔쳐볼 수 있어요.
그래서 이 폴더에는 API 키를 안전하게 보관하고 Anthropic API를 대신 호출해주는 아주 작은 백엔드가
함께 들어있어요.

## 폴더 구조

```
ai-backend/
├─ lib/checkCard.js     # 공통 로직 (Anthropic API 호출 + 결과 파싱) — 수정할 일 있으면 여기만 고치면 돼요
├─ server.js            # 옵션 A: 직접 실행하는 Node.js 서버 (정적 파일도 함께 서빙)
├─ api/check-card.js    # 옵션 B: Vercel 서버리스 함수
├─ public/index.html    # 프론트엔드 (카드 업로드 화면)
├─ package.json
└─ .env.example         # API 키를 넣을 환경변수 템플릿
```

**옵션 A와 B 중 하나만 고르면 돼요.** 지금처럼 정적 사이트만 있는 상태라면 보통 B(Vercel)가 가장 간단해요.

---

## 옵션 A. 직접 서버 실행 (Render, Railway, Fly.io, 개인 서버 등)

1. `ai-backend` 폴더를 서버에 올리고 그 안에서:
   ```
   npm install
   cp .env.example .env
   ```
2. `.env` 파일을 열어 `ANTHROPIC_API_KEY`에 발급받은 키를 넣어요. (https://console.anthropic.com 에서 발급)
3. 로컬에서 테스트:
   ```
   npm start
   ```
   브라우저에서 http://localhost:3000 열어서 확인해보세요.
4. Render / Railway / Fly.io 등에 배포할 때는:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment Variables에 `ANTHROPIC_API_KEY` 등록
   위 설정만 해주면 끝이에요. `public/` 폴더가 같이 서빙되니 프론트엔드도 그대로 열려요.

이미 만들고 계신 사이트에 이 화면을 넣고 싶다면, `public/index.html`의 내용을 그 사이트의 한 페이지로
옮기고, `API_ENDPOINT` 값만 이 서버의 실제 주소(예: `https://your-api.onrender.com/api/check-card`)로
바꿔주면 돼요.

---

## 옵션 B. Vercel 서버리스 함수 (정적 사이트에 API 하나만 추가)

이미 정적 사이트가 있고 별도 서버를 운영하고 싶지 않다면 이 방법이 가장 간단해요.

1. 지금 만드시는 정적 사이트의 저장소(레포)에 아래 두 파일을 그대로 복사해 넣으세요:
   - `lib/checkCard.js` → 저장소의 `lib/checkCard.js`
   - `api/check-card.js` → 저장소의 `api/check-card.js`
   (`server.js`, `public/`는 필요 없어요 — 이미 있는 정적 사이트를 그대로 쓰는 거예요)
2. `public/index.html`의 내용(또는 필요한 업로드 UI 부분)을 사이트의 원하는 페이지에 붙여넣으세요.
   `API_ENDPOINT`는 `/api/check-card`로 그대로 두면 돼요 (같은 사이트에 배포되니까요).
3. Vercel 대시보드 → 프로젝트 → Settings → Environment Variables에서 `ANTHROPIC_API_KEY` 추가.
4. `git push` 하면 Vercel이 `api/check-card.js`를 자동으로 서버리스 함수로 배포해줘요. 별도 설정 필요 없음.

---

## 동작 원리

1. 브라우저에서 사진을 캔버스로 가로/세로 최대 1280px, JPEG 품질 0.85로 줄여요 (전송 속도 개선, 요금 절감).
2. `/api/check-card`로 base64 이미지를 보내요.
3. 서버가 Anthropic Messages API(모델: `claude-sonnet-5`, `lib/checkCard.js`에서 변경 가능)에
   이미지와 판별 기준을 담은 프롬프트를 보내요.
4. AI가 아래 JSON 형식으로 답해요:
   ```json
   {
     "is_convenience_store_transit_card": true,
     "confidence": "high",
     "detected_brand": "캐시비 (Cashbee)",
     "reason": "카드 전면에 캐시비 로고가 있고, 카드 소유자 이름이나 결제용 칩이 없어 편의점 판매용 선불 카드로 보입니다."
   }
   ```
5. 프론트엔드가 이 결과를 Yes/No 배지로 보여줘요.

## 비용

호출 1건당 이미지 1장 + 짧은 프롬프트를 보내는 수준이라 비용은 매우 작아요 (건당 1원 단위 수준).
사용량이 많아질 것 같다면 `.env`의 `ANTHROPIC_MODEL`을 `claude-haiku-4-5-20251001`로 바꾸면 더 저렴하고
빨라져요 (정확도는 sonnet-5보다 약간 낮을 수 있어요).

## 참고

- 이미지 형식은 JPEG/PNG/WebP/GIF만 지원돼요.
- 서버는 사진을 저장하지 않고 판별 후 바로 버려요 (Anthropic API로 전달만 해요).
- 실제 서비스에 쓰기 전에, 같은 API를 짧은 시간에 너무 많이 호출하지 못하도록 요청 빈도 제한(rate
  limiting)을 추가하는 걸 권장해요 — 지금 코드에는 포함돼 있지 않아요.
