#!/usr/bin/env bash
# Dijalankan di VM oleh GitHub Actions lewat SSH, atau manual:
#   bash scripts/deploy.sh <commit-sha>     memasang versi tertentu (rollback)
#   bash scripts/deploy.sh latest           memasang versi terbaru
#
# Kunci deploy di authorized_keys dibatasi hanya boleh menjalankan skrip ini.
# Tag yang diminta Actions sampai ke sini lewat SSH_ORIGINAL_COMMAND
set -euo pipefail

# Seluruh isi dibungkus fungsi yang baru dipanggil di baris terakhir. Bash
# membaca fungsi utuh sebelum menjalankannya, sehingga git checkout di bawah
# yang ikut memperbarui berkas ini tidak mengacaukan skrip yang sedang berjalan
main() {
  local tag="${SSH_ORIGINAL_COMMAND:-${1:-latest}}"

  # Hanya sha commit atau "latest". Teks dari SSH tidak boleh diteruskan
  # mentah ke perintah lain
  if [[ ! "$tag" =~ ^([0-9a-f]{7,40}|latest)$ ]]; then
    echo "Tag tidak valid: $tag" >&2
    exit 1
  fi

  cd "$(dirname "$(readlink -f "$0")")/.."

  # docker-compose.yml dan skrip ini ikut diperbarui. .env.production tidak
  # tersentuh karena tidak dilacak git
  echo "==> Memperbarui berkas deploy dari main"
  git fetch --quiet origin main
  git checkout --quiet --force -B main origin/main

  export IMAGE_TAG="$tag"

  echo "==> Menarik image $IMAGE_TAG"
  docker compose pull backend

  echo "==> Menyalakan versi baru"
  docker compose up -d --no-build --remove-orphans

  echo "==> Menunggu /health"
  for _ in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8080/health > /dev/null 2>&1; then
      echo "==> Berhasil, berjalan dengan image $IMAGE_TAG"
      docker image prune -f > /dev/null
      exit 0
    fi
    sleep 2
  done

  echo "==> /health tidak menjawab dalam 60 detik. Log terakhir:" >&2
  docker compose logs --tail 50 backend >&2
  exit 1
}

main "$@"
