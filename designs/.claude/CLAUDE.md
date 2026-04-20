# 디자인 라이브러리 가이드

이 폴더에는 브랜드별 DESIGN.md 파일이 있습니다.
작업 시 스타일을 지정하면 해당 파일을 참조합니다.

## 폰트 기본 규칙
- 영문/숫자: Inter (Google Fonts) — 테크/SaaS 느낌
- 한국어: Noto Sans KR (Google Fonts)
- 한화/LIFEPLUS 공식물: LIFEPLUS 전용 폰트 (로컬, designs/LIFEPLUS_assets/)
- 항상 영문 폰트 + 한국어 폰트 함께 import

## 스타일 카탈로그

### 🏢 사내 공식 브랜드
- LIFEPLUS → designs/LIFEPLUS/LIFEPLUS-DESIGN.md (전용 폰트 포함)

### 🏦 금융/프리미엄
- Stripe → designs/getdesign.md/finance/stripe-DESIGN.md
- Mastercard → designs/getdesign.md/finance/mastercard-DESIGN.md
- Revolut → designs/getdesign.md/finance/revolut-DESIGN.md
- Wise → designs/getdesign.md/finance/wise-DESIGN.md

### ☕ 브랜드/라이프스타일
- Starbucks → designs/getdesign.md/brand/starbucks-DESIGN.md
- Nike → designs/getdesign.md/brand/nike-DESIGN.md
- Apple → designs/getdesign.md/brand/apple-DESIGN.md
- Spotify → designs/getdesign.md/brand/spotify-DESIGN.md

### 🤖 AI/테크
- Claude → designs/getdesign.md/ai/claude-DESIGN.md
- Cursor → designs/getdesign.md/dev-tools/cursor-DESIGN.md
- Linear → designs/getdesign.md/dev-tools/linear.app-DESIGN.md
- Notion → designs/getdesign.md/design-productivity/notion-DESIGN.md

### 🏎️ 럭셔리
- Ferrari → designs/ohmydesign.md/ferrari/DESIGN.md
- BMW → designs/ohmydesign.md/bmw/DESIGN.md

## 사용법
- 폴더 전체 참조 금지 (Prompt too long 오류)
- 개별 파일만 @참조: `@designs/getdesign.md/finance/stripe-DESIGN.md`
- LIFEPLUS 전용 폰트는 로컬 경로 사용
