# Pi Extensions 개발 프로젝트

이 프로젝트는 pi-coding-agent용 extension을 개발하는 프로젝트입니다.

## 구조
- `extensions/` - pi extension 파일들 (.ts)
- `skills/` - pi skill 파일들 (SKILL.md)
- `prompts/` - prompt template 파일들 (.md)

## Extension 개발 규칙
- TypeScript로 작성
- `export default function(pi: ExtensionAPI)` 형태로 export
- 타입은 `@mariozechner/pi-coding-agent`에서 import
- 스키마는 `@sinclair/typebox`의 `Type` 사용
- 문자열 enum은 `@mariozechner/pi-ai`의 `StringEnum` 사용 (Google 호환)

## 테스트 방법
```bash
pi -e ./extensions/파일명.ts
```
