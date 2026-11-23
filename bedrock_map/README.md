# 7000x7000 RPG MAP — Bedrock 변환본

Java 맵을 Bedrock(1.26.60)용으로 변환한 `.mcworld` 파일을 GitHub 용량 제한(파일당 100MB) 때문에 4조각으로 나눈 것입니다.
조각은 압축 파일이 아니라 원본 파일을 그대로 자른 것이라, **순서대로 이어 붙이기만 하면** 원본과 똑같은 파일이 됩니다.

## 합치는 법
1. `.001` ~ `.004` 네 파일을 모두 같은 폴더에 받습니다.
2. 합치기
   - **Windows**: `join_windows.bat` 더블클릭
   - **Mac / Linux**: `sh join_mac_linux.sh`
   - **7-Zip**: `.001` 파일 우클릭 → 7-Zip → 파일 합치기(Combine files)
3. 만들어진 `7000x7000_RPG_MAP_bedrock.mcworld`를 더블클릭하면 마인크래프트로 들어갑니다.

## 확인용 SHA-1
합친 파일의 SHA-1: `7231c1b93649559856e16575a01743c5a304f2bc` (크기 177,297,748 바이트)

## 변환 과정
- 원본은 `level.dat`만 1.16.5이고 청크 대부분이 1.12.2 구형 포맷이라, 공식 Java 1.16.5 서버의 `--forceUpgrade`로 먼저 업그레이드
- 상태가 `empty`로 남아 Chunker가 건너뛰던 청크(실제 블록 있음)를 변환 대상에 포함
- 1.12 시절 음수로 깨진 바이옴 번호 복구, 나뭇잎 전부 영구(사라지지 않음)로 지정
- [Chunker](https://github.com/HiveGamesOSS/Chunker)로 Bedrock 변환
- 엔티티(몹, 주민, 보트 등)는 Chunker가 옮기지 않습니다.

원작 맵 제작: Bibibik
