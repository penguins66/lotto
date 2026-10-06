# 로또 번호 생성기

역대 로또 6/45 당첨번호를 구간별로 분석해 번호 5세트를 만들어 주는 정적 웹사이트입니다.
서버 없이 GitHub Pages에서 동작하고, 매주 추첨 결과를 자동으로 반영합니다.

## 생성 방식

| 구간 (최신 회차 기준) | 빈출 번호 | 비중 |
|---|---|---|
| 최근 2~50회 | 5개 | 30% |
| 최근 51~100회 | 5개 | 30% |
| 최근 101회~처음 | 6개 | 40% |

1. 구간 비중의 절반은 그 구간 빈출 번호들에 나누고, 나머지 절반은 구간 내 출현 빈도대로 45개 번호 전체에 나눕니다. 여러 구간에서 빈출이면 비중이 합산됩니다.
2. 직전 회차 번호 중 1개, 나머지 39개 번호 중 5개를 이 확률대로 뽑습니다. 각 세트에 직전 회차 번호는 정확히 1개이며, 그 번호는 2번째 최근 회차에도 나온 번호이면 안 됩니다.
3. 역대 당첨번호 합계의 평균·표준편차로 정규분포를 구해, 합계가 평균에 가까울수록 채택 확률을 높입니다 (±2σ 밖은 제외).
4. 역대 1등 조합과 같은 조합, 세트끼리 4개 이상 겹치는 조합은 제외합니다. 홀짝·고저 쏠림, 3연속, 생일 조합 필터는 화면에서 켜고 끌 수 있습니다.

설정값은 [`js/engine.js`](js/engine.js) 맨 위(`WINDOWS`, `FOCUS` 등)에 모여 있습니다.

## 데이터 갱신

- [`.github/workflows/pages.yml`](.github/workflows/pages.yml)이 매주 토요일 밤, 일요일 아침, 월요일 아침(KST)에 [`scripts/update.py`](scripts/update.py)를 실행해 새 회차를 [`data/draws.json`](data/draws.json)에 추가하고 사이트를 다시 배포합니다.
- 소스: 동행복권 공식 API → 실패 시 공개 미러([smok95/lotto](https://github.com/smok95/lotto)).
- 바로 반영하고 싶으면 GitHub 저장소의 **Actions → 회차 갱신 및 배포 → Run workflow**를 누르면 됩니다.
- 로컬에서: `python scripts/update.py` 후 커밋·푸시.
- 엑셀에서 전체를 다시 만들 때: `pip install openpyxl` 후 `python scripts/import_excel.py lotto.xlsx`

## 로컬 실행 / 테스트

```bash
python -m http.server 8000
```

브라우저에서 http://localhost:8000 을 엽니다.

```bash
npm test
```

## 처음 배포할 때 (한 번만)

1. GitHub에 **Public** 저장소를 만들고 이 폴더를 푸시합니다.
2. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿉니다.
3. **Actions** 탭에서 워크플로를 한 번 실행하면 `https://<아이디>.github.io/<저장소>/` 주소로 열립니다.

> 로또 추첨은 매번 독립적이므로 과거 기록으로 당첨 확률을 높일 수는 없습니다. 재미로 참고하세요.
