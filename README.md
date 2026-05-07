# Dice Turn Room

여러 사람이 같은 방에 들어와 정해진 순서대로 주사위를 굴리고 결과를 공유하는 작은 웹앱입니다.

## 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:4177`을 엽니다.

같은 Wi-Fi/사무실 네트워크의 다른 기기에서는 실행한 컴퓨터의 IP 주소로 접속합니다.

```text
http://내-IP-주소:4177
```

## 기능

- 방 코드 또는 초대 링크로 입장
- 플레이어 순서와 현재 턴 표시
- 자기 턴에만 주사위 굴리기
- 주사위 개수 1-12개 지정
- d4, d6, d8, d10, d12, d20, d100 지원
- 굴리는 동안 애니메이션 표시
- 결과 기록과 자동 턴 넘김

## 메모

현재 서버 메모리에 방 상태를 저장합니다. 서버를 재시작하면 방과 기록은 초기화됩니다.

## Render 배포

이 폴더를 GitHub 저장소로 올린 뒤 Render에서 `New` -> `Blueprint`를 선택하고 저장소를 연결하면 `render.yaml` 설정으로 무료 Web Service가 생성됩니다.

수동으로 Web Service를 만들 경우:

- Runtime: `Node`
- Build Command: `npm install`
- Start Command: `npm start`
- Instance Type: `Free`
