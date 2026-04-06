# Subagent Extension Design

pi-coding-agent용 서브에이전트 오케스트레이션 확장.
독립된 pi 서브프로세스를 spawn하여 격리된 컨텍스트에서 에이전트를 실행한다.

## Agents

에이전트 정의는 `01_EXTENSIONS/subagent/agents/` 에 마크다운 파일로 번들한다.
YAML 프론트매터로 설정하고, 본문이 시스템 프롬프트가 된다.

| Agent | Model | Thinking | Tools | Role |
|-------|-------|----------|-------|------|
| scout | gpt-5.4-mini | low | read, grep, find, ls, bash | 빠른 정찰. 코드베이스 탐색 후 압축된 컨텍스트 반환 |
| worker | gpt-5.4 | medium | 제한 없음 | 범용 구현. 파일 생성/수정/삭제 |
| reviewer | gpt-5.4 | high | read, grep, find, ls, bash(읽기) | 코드 리뷰. critical/warning/suggestion 분류 |

프론트매터 스키마:

```yaml
name: scout
description: Fast codebase recon
model: gpt-5.4-mini
thinking: low
tools: read, grep, find, ls, bash
```

## CLI Interface

도구에 `command` 문자열 하나를 넘긴다. 파싱은 외부 라이브러리 사용.

```
subagent run <agent> [--main] [--cwd <path>] -- <task>
subagent batch --agent <a> --task <t> [--agent <a> --task <t> ...]
subagent chain --agent <a> --task <t> [--agent <a> --task <t> ...]
subagent continue <id> -- <task>
subagent status
subagent detail <id>
subagent abort <id>
subagent runs
```

### Commands

- **run**: 에이전트 하나 실행. `--main`으로 메인 컨텍스트 주입
- **batch**: 병렬 실행. 최대 8개, 동시 4개
- **chain**: 순차 실행. `{previous}` 플레이스홀더로 이전 출력 전달
- **continue**: 완료된 세션에 추가 지시
- **status**: 실행 중인 에이전트 목록
- **detail**: 완료된 세션의 전체 대화 히스토리
- **abort**: 실행 중단
- **runs**: 전체 실행 목록 (실행 중 + 완료)

## Async Execution Model

모든 실행은 비동기. 메인 에이전트를 블로킹하지 않는다.

### Flow

1. `subagent run worker -- task` 호출
2. pi 서브프로세스 spawn, 실행 ID 부여 (#1)
3. 도구 즉시 반환: "worker #1 실행 시작"
4. 메인 에이전트는 다른 작업 가능
5. 서브에이전트 종료 → followUp 메시지로 결과 전달
6. 메인 에이전트가 사용자에게 보고

### Failure Handling

- **일시적 실패** (네트워크, rate limit, 5xx): 자동 재시도 최대 3회, 지수 백오프
- **영구 실패**: followUp으로 에러 보고
### Concurrency Limits

- batch 최대 태스크: 16
- 동시 실행: 8
- 실행 간격 (pacing): 1초
- 재시도 쿨다운: 지수 백오프 (2s, 4s, 8s)

## Session Management

서브에이전트 세션을 파일로 영속화하여 continue를 지원한다.

- 세션 파일 경로: `~/.pi/agent/sessions/subagents/`
- `continue <id>` 시 기존 세션 파일로 pi 서브프로세스 재개
- 메인 세션 전환 시에도 서브에이전트 결과 보존 (cross-session delivery)

## Main Context Injection

`--main` 플래그로 메인 대화 컨텍스트를 서브에이전트에 주입한다.

주입 내용:
- compaction 요약 (있으면)
- 최근 메시지 (최대 20개)
- 다른 서브에이전트 결과 (있으면)

용도: 서브에이전트가 "지금 무슨 작업 중인지" 파악할 수 있게 한다.
`--main` 없으면 태스크 문자열만 받고 시작.

## Escalation (ask_master)

서브에이전트가 판단 불가 상황에서 부모에게 질문을 올리는 메커니즘.

### Flow

1. 서브에이전트가 `ask_master` 도구 호출
2. YAML IPC 파일에 질문 기록 → 서브에이전트 일시 중단
3. 메인 에이전트가 followUp으로 질문 수신 → 사용자에게 전달
4. 사용자 응답 → IPC 파일에 답변 기록
5. 서브에이전트 재개

### Escalation Targets

- 파괴적 작업 (파일 삭제, 대규모 변경)
- 요구사항 모호
- 복수 방안 중 선택 필요

`ask_master`는 서브에이전트에 추가 도구로 주입한다.
시스템 프롬프트에 "확신이 없으면 추측하지 말고 ask_master를 호출하라" 명시.

## Widget

에디터 하단에 실행 중인 서브에이전트 실시간 상태 표시.

표시 항목:
- 에이전트명 + 실행 ID
- 경과 시간
- 현재 호출 중인 도구 프리뷰
- 최대 3개 동시 표시

## Replay (Detail View)

`subagent detail <id>` 로 완료된 세션의 전체 대화를 포맷팅하여 출력.

표시 항목:
- 메시지 (assistant/user)
- 도구 호출 + 결과
- 사용량 통계 (토큰, 비용, 모델)

## Module Structure

99줄/파일 제한 준수를 위한 모듈 분리:

```
src/
├── index.ts          # 진입점 (import + 등록만)
├── types.ts          # 인터페이스, TypeBox 스키마
├── constants.ts      # 상수
├── agents.ts         # 에이전트 발견/로딩
├── runner.ts         # pi 서브프로세스 spawn + 이벤트 파싱
├── execute.ts        # single/batch/chain 분기
├── session.ts        # 세션 파일 관리
├── store.ts          # 공유 상태 (실행 목록)
├── cli.ts            # 커맨드 파싱
├── context.ts        # 메인 컨텍스트 주입
├── escalation.ts     # ask_master IPC
├── retry.ts          # 재시도 로직
├── format.ts         # 포맷팅 유틸
├── widget.ts         # 실시간 위젯
├── replay.ts         # 세션 히스토리 출력
├── render.ts         # renderCall/renderResult
└── queue.ts          # 실행 pacing
```

```
agents/
├── scout.md
├── worker.md
└── reviewer.md
```

## Dependencies

- CLI 파서: 외부 라이브러리 (yargs, commander 등)
- TypeBox: 도구 파라미터 스키마 (`@sinclair/typebox`)
- gray-matter 또는 유사: YAML 프론트매터 파싱
- pi-coding-agent: ExtensionAPI (`@mariozechner/pi-coding-agent`)

## Constraints

- 파일당 99줄 제한
- 100% 테스트 커버리지 (src/index.ts 제외)
- `as any` / `as unknown` 타입 단언 금지
- ExtensionAPI는 src/index.ts에서만 import
- 탭 들여쓰기 (Biome)
