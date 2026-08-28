# [Claude Code 작업 지시서] 강체 6DOF 마운트 진동 / 공진 해석

- 제출자: 김완호 (HD건설기계)
- 출처: 생성형 AI 업무자동화 전문가과정 — 수강생이 자체 제작해 이메일로 제출(2026-08-27), 대표가 hd-project19로 이식
- 프로젝트 유형: 공학 계산기(강체 동역학) + 결과 서버 저장 + 규칙기반 결과 해설
- 원본: [anakizz/6DOF-vibration](https://github.com/anakizz/6DOF-vibration) — 해석 로직은 원본 그대로, 이 리포에서 저장/해설 기능만 얹었다.

> ⚠ **이 문서도 기획서 원문이 아니라 되짚어 쓴 것이다** (hd-project13과 같은 상황).
> 김완호 님이 보낸 것은 완성된 웹앱 링크와 짧은 이메일 요청 두 줄
> ("SQL로 서버에 저장하고 싶다", "AI/chatbot 연동 아이디어가 없는데 시간 되면 부탁")뿐이었다.
> 부록 A(기획서 원문)는 비워 둔다.

---

## 0. Claude Code에게 — 작업 방식

1. **원 해석 로직(`analyze()`와 그 아래 Jacobi/Cholesky 등 수학 함수들)은 절대 건드리지 않는다.** 김완호 님이 이미 검증한 엔지니어링 계산이다. 고칠 일이 생기면 반드시 먼저 확인받는다.
2. 새 기능은 전부 별도 파일에 둔다 — `js/interpret.js`(결과 해설, 순수함수), `js/store.js`(Supabase 저장/불러오기). `index.html`의 원본 `<script>` 블록 안에는 `if(window.hd19OnAnalyze) window.hd19OnAnalyze(modes);` 훅 한 줄만 추가돼 있다.
3. `test/logic.test.js`는 `js/interpret.js`만 검증한다. 원본 계산 로직은 DOM과 얽혀 있고 원작자가 이미 검증했으므로 여기서 다시 재현하지 않는다.
4. 서버 저장은 **테이블이 없어도 화면이 죽지 않아야 한다** — `supabase/schema.sql`을 대표가 아직 SQL Editor에서 안 돌렸을 수 있기 때문(§2.1 sqld 사고 재발 방지). `js/store.js`의 `isTableMissing()`이 이 경계를 처리한다.

---

## 1. 한 줄 요약

4개 마운트의 위치·강성 + 강체 질량·무게중심·관성모멘트를 입력하면 6개 고유진동수와 모드 결합을 계산하고, 그 결과를 서버에 저장/불러오거나 참고용 해설을 볼 수 있는 도구.

## 2. 배경

HD건설기계 사내에서 장비 마운트(엔진·운전실 등) 설계 시 반복하는 6DOF 공진 해석을 웹 계산기로 자동화한 것이 원본. 김완호 님이 두 가지를 추가로 요청:
- 결과를 CSV뿐 아니라 서버(SQL)에 저장 → 이 리포에서 Supabase로 구현.
- AI 연동 아이디어 요청 → 막연한 요청이라 "규칙 기반 결과 해설"로 1차 구현, 진짜 대화형 AI는 범위 밖으로 명시.

## 3. 요구 기능

### 3.1 (원본, 손대지 않음) 6DOF 해석
- 강체 입력(질량/CG/관성모멘트) + 마운트 4개(위치/강성) → 6개 고유진동수·모드형상·마운트별 변위/하중.
- CSV 템플릿 다운로드 / 업로드 / 결과 CSV 내보내기.
- 3D 애니메이션 뷰(모드 형상 시각화).

### 3.2 (신규) 결과 서버 저장
- `supabase/schema.sql` — `hd19_analysis_results` 테이블(입력 JSON + 결과 JSON). RLS: anon insert/select 허용(로그인이 없어 완전한 소유자 격리는 불가 — 스키마 파일 상단 주석에 그 한계를 명시했다).
- 브라우저 localStorage의 무작위 UUID로 "내 기록"만 화면에 보여준다.
- `js/store.js`: `hd19SaveResult()` / `hd19LoadResultList()`.

### 3.3 (신규) 결과 해설 (참고용)
- `js/interpret.js`: 고유진동수를 4개 대역(저주파/인체민감/엔진회전/고주파)과 비교해 코멘트. 모드 결합(지배 DOF 순도 < 70%)도 별도로 짚는다.
- AI 챗봇 버튼은 비활성 상태로 자리만 있음 — "API 키 협의 후 다음 단계"로 안내.

## 4. 데이터 스키마

`supabase/schema.sql` 참고. 재실행 안전, 대표가 SQL Editor에서 직접 실행해야 한다(§3.7).

## 5. 제약·가정

- 정적 사이트, 빌드 단계 없음, GitHub Pages(Actions) 배포.
- Supabase URL/anon key는 공용 프로젝트(hcmgdztsgjvzcyxyayaj) 값을 fallback 하드코딩(§3.2).
- 결과 해설의 주파수 대역 구분은 일반적인 경험칙이며 이 장비의 실측치가 아니다 — 화면에도 "참고용"이라고 명시했다.

## 6. 검증

```
node test/logic.test.js      # js/interpret.js 단위 테스트 12건
node test/smoke.browser.js   # 화면 연기 테스트 — playwright 필요
```
`supabase/schema.sql`은 로컬 임시 PostgreSQL에 실제 적용해 재실행 안전성과 anon 권한 경계(insert/select만 되고 update/delete는 막힘)를 확인했다(§3.7).

## 부록 A — 기획서 원문

(없음 — 이메일 두 줄과 완성된 프로토타입 링크가 전부였다. §0 참고.)
