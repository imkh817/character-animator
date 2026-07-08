#!/bin/bash
# 로컬 개발 환경 전체 기동: ./dev.sh
# 종료: Ctrl+C (워커/웹 종료. 컨테이너(API 포함)는 유지 → docker compose down으로 정리)
set -e
cd "$(dirname "$0")"

echo "▸ 인프라 + API (PostgreSQL:5433, MinIO:9000, API:8080)"
docker compose up -d --build

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

trap 'kill $WORKER_PID $WEB_PID 2>/dev/null' EXIT
echo ""
echo "✔ 준비 완료 → http://localhost:5173"
wait
