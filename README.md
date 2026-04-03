# 🧩 my-pi-extensions

[pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)용 개인 extension 패키지.

## 설치

```bash
pi install https://github.com/jeonghyeon-net/pi
```

버전 고정:

```bash
pi install https://github.com/jeonghyeon-net/pi@v0.1.0
```

## 포함된 Extension

### 🖐️ hello

연습용 extension. 커스텀 도구, 슬래시 커맨드, 이벤트 핸들러 예제.

- **도구**: LLM에게 "인사해줘"라고 하면 `hello` 도구 호출
- **커맨드**: `/hello 이름` → 인사 메시지 표시
- **이벤트**: 세션 시작 시 로드 알림

## 관리

```bash
pi list              # 설치된 패키지 목록
pi update            # 업데이트
pi config            # extension 개별 on/off
pi remove https://github.com/jeonghyeon-net/pi   # 삭제
```

## 개발

```bash
# 로컬에서 테스트
pi -e ./extensions/hello.ts

# 새 extension 추가 후
git add -A && git commit -m "feat: 새 extension"
git tag v0.x.0
git push && git push --tags
```

## 구조

```
extensions/    → pi extension (.ts)
skills/        → pi skill (SKILL.md)
prompts/       → prompt template (.md)
```
