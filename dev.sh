#!/bin/bash
# 로컬 개발 환경 전체 기동: ./dev.sh
# 종료: Ctrl+C (API/워커/웹 모두 함께 종료. 컨테이너는 유지)
set -e
cd "$(dirname "$0")"

echo "▸ 인프라 (PostgreSQL:5433, MinIO:9000)"
docker compose up -d

echo "▸ API 서버 (:8080)"
(cd apps/api && ./gradlew bootRun -q) &
API_PID=$!

echo "▸ API 대기 중..."
for i in $(seq 1 60); do
  curl -sf http://localhost:8080/actuator/health >/dev/null 2>&1 && break
  sleep 2
done
echo "  API UP"

echo "▸ 렌더 워커"
(cd apps/render-worker && npm start) &
WORKER_PID=$!

echo "▸ 웹 에디터 (:5173)"
(cd apps/web && npm run dev) &
WEB_PID=$!

trap 'kill $API_PID $WORKER_PID $WEB_PID 2>/dev/null' EXIT
echo ""
echo "✔ 준비 완료 → http://localhost:5173"
wait
