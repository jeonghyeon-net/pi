# 🧩 My Pi Extensions

[pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)용 커스텀 extension 모음.

## 시작하기

```bash
# 특정 extension 테스트
pi -e ./extensions/hello.ts

# 모든 extension 로드
pi -e ./extensions/
```

## 구조

| 폴더 | 설명 |
|------|------|
| `extensions/` | pi extension 파일들 |
| `skills/` | pi skill 파일들 |
| `prompts/` | prompt template 파일들 |

## Extension 만드는 법

`extensions/` 폴더에 `.ts` 파일 생성:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // 여기에 도구, 커맨드, 이벤트 핸들러 등록
}
```

## 유용한 링크

- [Extension 문서](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/docs/extensions.md)
- [Extension 예제들](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions)
