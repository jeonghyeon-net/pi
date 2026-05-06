---
description: GitHub PR 리뷰 코멘트별 대응·답글·재리뷰 대기
argument-hint: "[추가 지시사항]"
---
먼저 `start_supervision` 도구를 사용해 아래 목표로 supervisor를 활성화해줘.

outcome:
현재 git 브랜치와 remote 정보를 기준으로 대상 GitHub PR을 자동으로 찾고, 추가 지시사항에 PR URL/번호가 명시된 경우에만 그 PR을 우선한다. 대상 PR의 리뷰 항목을 빠짐없이 확인해, 아직 대응이 필요한 각 항목에 올바른 위치로 개별 답글을 남긴다. 리뷰어 피드백은 무조건 수용하지 말고 현재 코드 흐름, 요구사항, 아키텍처, 테스트, 유지보수성, 호환성, 보안/성능 영향, 변경 범위와 트레이드오프를 비교해 타당성을 판단한다. 타당하면 최소 변경으로 반영하고 검증·커밋·푸시한다. 타당하지 않거나 더 나은 대안이 있으면 근거를 들어 답글로 설명한다. 모든 대응이 끝나면 review conversation/thread를 절대로 resolve하지 않은 상태로 기존 리뷰어에게 re-review를 요청한다. re-review 요청만으로 작업을 끝내지 말고, 새 리뷰·추가 코멘트·changes requested·CI 실패·merge conflict·mergeability 변화를 계속 확인한다. 새로 대응할 일이 생기면 같은 원칙으로 반복 처리하고, PR이 리뷰와 체크 기준을 충족해 mergeable 상태가 되거나 직접 처리할 수 없는 블로커가 생겼을 때만 최종 보고한다. 직접 merge, merge queue 등록, auto-merge 활성화는 하지 않는다.

추가 지시사항:
$@

그 다음 아래 원칙으로 작업해줘.

## 용어와 범위

- `리뷰 항목`은 대응이 필요한 GitHub review comment conversation/thread, review body 항목, PR comment를 뜻한다.
- 라인별 review comment conversation/thread는 반드시 해당 thread/comment의 reply 기능/API로 답한다.
- review body나 PR comment처럼 thread reply가 불가능한 항목은 그 코멘트에 답하거나 GitHub가 허용하는 가장 가까운 위치에 답한다.
- 이미 충분히 답한 항목에는 같은 내용의 답글을 중복으로 남기지 않는다. 후속 코멘트가 새 질문이나 새 지적을 담고 있을 때만 다시 대응한다.

## 절대 금지

- GitHub review conversation/thread를 절대 resolve하지 않는다. `Resolve conversation`, `resolveReviewThread` mutation, UI/CLI/API의 resolve 계열 동작을 사용하지 않는다. resolve 권한과 판단은 리뷰어에게 있다.
- 여러 라인별 review comment conversation을 하나의 PR 전체 코멘트나 단일 review summary로 대체하지 않는다.
- 리뷰어 피드백을 무조건 수용하지 않는다. 반대로 방어적으로 무시하지도 않는다. 반드시 근거와 트레이드오프를 비교한 뒤 결정한다.
- 직접 merge하지 않는다. merge queue에 넣지 않고, `enable auto-merge` 같은 auto-merge 동작도 하지 않는다.
- 명시 승인 없이 force push로 리뷰 컨텍스트를 깨지 않는다.

## 진행 절차

1. 현재 브랜치와 remote에서 대상 PR을 자동으로 찾는다.
   - 먼저 현재 브랜치에 연결된 open PR을 확인한다. 예: `gh pr view --json number,url,headRefName,baseRefName,reviewDecision,statusCheckRollup,mergeStateStatus`.
   - 실패하면 현재 브랜치명과 head remote 기준으로 open PR을 검색한다. 예: `gh pr list --head "$(git branch --show-current)" --state open`.
   - 그래도 찾지 못하거나 여러 PR이 매칭될 때만 사용자에게 대상 PR 선택을 요청한다.
2. 대상 PR의 base/head, CI 상태, review 상태, required review/check 조건, mergeability를 확인한다.
3. 모든 리뷰 항목을 수집한다. 항목 ID, 리뷰어, 위치, 최신 코멘트, 내가 이미 남긴 답글, 아직 대응이 필요한 후속 코멘트를 구분해 기록한다.
4. 아직 대응이 필요한 항목별로 아래를 판단한다.
   - 리뷰어의 핵심 주장과 의도
   - 관련 코드 흐름과 기존 설계/요구사항
   - 수용 시 장점·단점·위험
   - 수용하지 않을 경우 장점·단점·위험
   - 가능한 대안과 그 트레이드오프
   - 최종 판단: `수용`, `부분 수용/대안 적용`, `미수용`, `질문 필요`, `범위 밖`
5. `수용` 또는 `부분 수용/대안 적용`이면 최소 변경으로 구현하고, 필요한 테스트/타입체크/린트/빌드를 실행한다.
6. 코드 변경이 있으면 커밋하고 푸시한다. 커밋 메시지는 변경 이유가 드러나게 작성한다.
7. 아직 대응이 필요한 각 리뷰 항목에 개별 답글을 단다.
   - 변경한 경우: 무엇을 왜 바꿨는지, 관련 파일/커밋, 실행한 검증을 적는다.
   - 변경하지 않은 경우: 왜 현재 흐름상 기존 구현이 더 적절한지 또는 왜 대안이 더 나은지 근거와 트레이드오프를 적는다.
   - 추가 판단이 필요한 경우: 리뷰어가 답하기 쉬운 구체적 질문을 남긴다.
   - 가능하면 리뷰어가 사용한 언어와 톤을 따른다.
8. 대응이 필요한 리뷰 항목에 답글이 모두 남았는지 다시 확인한다. 누락이 있으면 re-review 요청 전에 반드시 보완한다.
9. review conversation/thread는 resolve하지 않은 채, 기존 리뷰어(특히 changes requested 또는 코멘트를 남긴 리뷰어)에게 re-review를 요청한다. 권한이나 GitHub 제한 때문에 re-review request를 못 하면, 어떤 리뷰어에게 어떤 이유로 요청하지 못했는지 사용자에게 즉시 보고한다.
10. re-review 요청 후에도 작업 완료로 보지 말고 PR을 계속 추적한다.
   - 새 리뷰, 새 리뷰 항목, 기존 항목의 후속 코멘트, 추가 changes requested가 오면 3번부터 다시 반복하되 이미 답한 내용은 중복 답변하지 않는다.
   - CI/check 실패, merge conflict, mergeability 저하가 생기면 원인을 확인해 수정·검증·커밋·푸시하고 필요한 위치에 답글을 남긴 뒤 다시 re-review를 요청한다.
   - 단순히 리뷰어 응답을 기다리는 상태는 완료가 아니다. 너무 짧은 busy-wait는 피하되, 합리적인 간격으로 PR 상태를 다시 확인한다.
   - 세션/도구 제약 때문에 장시간 대기를 계속할 수 없을 때만 현재 대기 상태, 마지막 확인 시각, 다음에 확인해야 할 조건을 사용자에게 보고하고 멈춘다.
   - reviewDecision이 `CHANGES_REQUESTED`가 아니고, 대응이 필요한 리뷰 항목이 없고, 필수 리뷰/체크 조건이 충족됐으며, PR이 mergeable 상태임을 확인했을 때만 최종 보고로 넘어간다.
   - 권한 부족, GitHub 인증 문제, 리뷰어/관리자만 할 수 있는 조치, 제품 판단 등 직접 처리할 수 없는 블로커가 생긴 경우에만 즉시 사용자 액션을 요청한다.
11. 최종 요약에는 다음만 간결히 포함한다.
   - 반영한 피드백과 커밋
   - 반영하지 않은 피드백과 핵심 근거
   - 실행한 검증 결과
   - 답글 완료 및 resolve 미수행 확인
   - re-review 요청 및 이후 추적 결과
   - 최종 PR 상태: review decision, checks, mergeability, 남은 블로커

## 답글 작성 원칙

- 고정 템플릿, 반복 문구, 체크리스트 복붙처럼 보이는 답글을 쓰지 않는다.
- 각 리뷰 항목의 맥락과 리뷰어의 의도에 맞춰 자연스럽게 답한다.
- 내부 판단 과정을 장황하게 노출하지 말고, 리뷰어가 다음 판단을 할 수 있을 만큼의 핵심 근거만 전달한다.
- 변경한 경우에는 무엇을 왜 바꿨는지와 필요한 검증 결과를 간결하게 남긴다.
- 변경하지 않은 경우에도 해당 위치에 답글을 남기고, 현재 흐름에서 기존 구현 또는 대안이 더 적절하다고 판단한 이유와 트레이드오프를 명확히 설명한다.
- 추가 판단이 필요한 경우에는 모호한 확인 요청이 아니라 리뷰어가 바로 답할 수 있는 구체적인 질문을 남긴다.
