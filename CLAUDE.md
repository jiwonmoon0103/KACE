# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

"대학생을 위한 자취방을 구해줘~" — a prototype web service that helps college students explore monthly-rent (월세) housing in Seoul's 성북구 district by predicting **future contract probability** from historical public transaction data, rather than listing currently-available units. The full product spec — scope, the 4 core features with their exact rules, data schema, and AI-behavior constraints — lives in [`PRD.md`](PRD.md); read it before implementing any feature. [`prd_lite.md`](prd_lite.md) is an earlier, lighter draft kept only for reference — `PRD.md` is the source of truth wherever they differ.

This repo is currently a fresh `create-next-app` scaffold — none of the four core features in `PRD.md` are implemented yet.

## 작업 규칙

- 모든 설명과 코드 주석은 한국어로 작성한다.
- 새 파일은 반드시 `KACE` 폴더 안에만 만든다.
- 기술 스택은 PRD.md에 정한 대로 Next.js로 고정한다. 다른 프레임워크로 바꾸거나 마이그레이션을 제안하지 않는다. 배포는 Vercel을 사용한다.
- 코드를 변경하면 무엇을, 왜 바꿨는지 한 줄로 알려준다.
- `.env` 등 비밀 정보 파일과 `node_modules` 폴더는 `.gitignore`에 등록된 상태를 유지하고, 절대 커밋하지 않는다.
- 외부 서비스 인증이 필요할 때는 토큰 값을 사용자에게 묻거나 채팅에 출력하지 않고, `.env`에 있는 값을 읽어서 사용한다.
  - 예: Supabase가 필요해지면 Supabase CLI를 설치하고 `.env`의 `SUPABASE_ACCESS_TOKEN`으로 작업한다.
  - 예: Vercel 작업(배포 등)이 필요하면 Vercel CLI를 설치하고 `.env`의 `VERCEL_TOKEN`으로 인증해서 작업한다.
- 파일을 삭제해야 할 때는 바로 지우지 않고, `trash-can` 폴더를 만들어 그 안으로 옮겨만 둔다. 최종 삭제는 사용자가 직접 확인한 뒤 진행한다.
- 이미 설치된 서브에이전트(bkit 등)는 필요할 때마다 적극 활용한다.
- 클릭으로 값을 고르는 드롭다운/자동완성 목록을 만들 때는, 입력창의 `onBlur`보다 목록 클릭이 먼저 반영되도록 목록 항목에 `onMouseDown={(e) => e.preventDefault()}`를 건다 (안 걸면 클릭한 값이 blur 처리로 다시 지워지는 경쟁 상태가 생긴다 — SchoolInput.tsx에서 실제로 겪은 버그).
- 설계 문서(PRD.md/DESIGN.md)와 다르게 구현하기로 결정했다면, 그 자리에서 바로 문서도 함께 고쳐서 Gap이 쌓이지 않게 한다.

## 작업 절차 (검증 루프)

코드를 바꿀 때마다 아래 루프를 반복한다.

1. **변경한다** — 계획한 코드 수정을 적용한다.
2. **결과를 직접 확인한다** — 브라우저로 열어보거나 실행해서 실제로 동작하는지 눈으로 확인한다 (코드만 읽고 넘어가지 않는다). `npm run lint`만으로는 타입 오류를 놓칠 수 있으니, TypeScript 코드를 바꿨다면 `npx tsc --noEmit`도 함께 실행한다.
3. **스스로 코드 리뷰한다** — 방금 바꾼 코드를 다시 읽으며 버그, 어색한 부분, PRD.md 규칙 위반이 없는지 점검한다.
4. **문제가 있으면 고치고 다시 1)로 돌아간다.** 문제가 없을 때까지 반복한다.
5. 통과하면 **무엇을, 왜 바꿨는지 한 줄로 요약**해서 알려준다.

## Commands

- `npm run dev` — start the dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — ESLint (flat config via `eslint-config-next`)

No test runner is configured yet.

## Architecture notes

- **Stack**: Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind CSS v4. Path alias `@/*` maps to the repo root (see `tsconfig.json`).
- **Raw data**: `public_data/` holds 12 untouched government real-estate Excel files (국토부 실거래가 공개시스템, 성북구, 연립다세대/오피스텔 × 2021–2026, ~29,884 rows total, 월세+전세 mixed). Each file has disclaimer/metadata rows before the real table — the column header is row 13, data starts row 14. The 연립다세대 files use a `건물명` column and have a trailing `주택유형` column; the 오피스텔 files use `단지명` instead and have no `주택유형` column — unify these during preprocessing (PRD 개발 단위 #1) rather than assuming one shared schema across all 12 files.
- **No live external calls for listing data**: the probability engine reads only from the pre-collected `public_data/` files and must not call a real-time real-estate API. Map lookups (school/convenience-store/café distance) do go through a geocoding API, but the provider isn't chosen yet (see PRD §8).
- **No accounts/DB**: the product is intentionally session-only (no login, no persisted user data) per PRD §6 비범위. Roommate matching compares only users connected at the same time — don't introduce a persistent matching store for it.
- **Probability model** (PRD §5, feature 1): Kaplan-Meier for the baseline trend → Cox proportional hazards for per-building probability, where the survival time axis is the gap between consecutive contract dates at the same address (i.e. building-level contract turnover, not tracking a single unit — there's no unit/호수 identifier in the data) → OpenAI narrates the computed numbers only, never invents them. Rules like the 5-transaction minimum fallback, the trend definition (last-year vs. prior-year contract count), and the user-selectable 1–12 month probability window are specified in PRD §5 — don't re-derive them independently.
- **Env vars** (`.env`, already git-ignored): `OPENAI_API_KEY`, `GITHUB_TOKEN`, `VERCEL_TOKEN`. A map/geocoding API key will need to be added once a provider is chosen.
