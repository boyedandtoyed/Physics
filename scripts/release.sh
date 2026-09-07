#!/usr/bin/env bash
# Release path for Abstract Physics: build once, verify on staging through the real Cloudflare
# edge, then promote the identical image to production.
#
# The guarantee this script exists to provide: `promote` never rebuilds. It retags the image ID
# that staging served and recreates the production container from it, and it refuses to run if
# that image ID is not the one currently on staging.
#
#   ./scripts/release.sh build     # build physics-web:rc-<sha> and tag it :rc
#   ./scripts/release.sh stage     # start/replace the staging stack on 127.0.0.1:8082
#   ./scripts/release.sh promote   # retag the staged image :live and recreate production
#   ./scripts/release.sh status    # what is built, staged and live, by image ID
#   ./scripts/release.sh rollback <tag>   # promote a previous physics-web:rc-<sha>
set -euo pipefail

cd "$(dirname "$0")/.."

REPO=physics-web
PROD_COMPOSE=docker-compose.yml
STAGING_COMPOSE=docker-compose.staging.yml
STAGING_URL=https://staging-abstract-physics.binodtiwari.com
PROD_URL=https://abstract-physics.binodtiwari.com

sha() { git rev-parse --short HEAD; }
image_id() {
  local id
  id=$(docker image inspect --format '{{.Id}}' "$1" 2>/dev/null | head -1 | tr -d "[:space:]")
  printf '%s' "${id:-<none>}"
}

container_image() {
  local id
  id=$(docker inspect --format '{{.Image}}' "$1" 2>/dev/null | head -1 | tr -d '[:space:]')
  printf '%s' "${id:-<not running>}"
}

require_clean_tree() {
  if [ -n "$(git status --porcelain)" ]; then
    echo "Refusing: the working tree is dirty. A release must be reproducible from a commit." >&2
    git status --short >&2
    exit 1
  fi
}

case "${1:-}" in
  build)
    require_clean_tree
    TAG="$REPO:rc-$(sha)"
    echo "Building $TAG"
    docker build -t "$TAG" .
    docker tag "$TAG" "$REPO:rc"
    echo "Built  $TAG  ($(image_id "$TAG"))"
    ;;

  stage)
    if [ "$(image_id "$REPO:rc")" = "<none>" ]; then
      echo "Refusing: no $REPO:rc image. Run 'build' first." >&2; exit 1
    fi
    docker compose -f "$STAGING_COMPOSE" up -d
    echo "Staging is $REPO:rc ($(image_id "$REPO:rc")) on 127.0.0.1:8082 -> $STAGING_URL"
    ;;

  promote)
    STAGED=$(image_id "$REPO:rc")
    if [ "$STAGED" = "<none>" ]; then
      echo "Refusing: nothing staged." >&2; exit 1
    fi
    # The image the staging CONTAINER is actually running, which is what was verified. If someone
    # rebuilt :rc after staging it, these differ and the verification no longer applies.
    RUNNING=$(container_image physics-staging-web-1)
    if [ "$RUNNING" = "<not running>" ]; then
      echo "Refusing: the staging container is not running. Verify on staging before promoting." >&2
      exit 1
    fi
    if [ "$RUNNING" != "$STAGED" ]; then
      echo "Refusing: $REPO:rc ($STAGED) is not what staging is running ($RUNNING)." >&2
      echo "Re-stage before promoting, or the promoted image is not the tested one." >&2
      exit 1
    fi
    docker tag "$STAGED" "$REPO:live"
    docker compose -f "$PROD_COMPOSE" up -d
    echo "Promoted $STAGED to production on 127.0.0.1:8080 -> $PROD_URL"
    echo "Identical image: staging=$RUNNING live=$(image_id "$REPO:live")"
    ;;

  rollback)
    TARGET="${2:-}"
    [ -n "$TARGET" ] || { echo "Usage: release.sh rollback <image-tag, e.g. rc-1a2b3c4>" >&2; exit 1; }
    docker tag "$REPO:$TARGET" "$REPO:live"
    docker compose -f "$PROD_COMPOSE" up -d
    echo "Rolled production back to $REPO:$TARGET"
    ;;

  status)
    printf '%-26s %s\n' "built (:rc)"  "$(image_id "$REPO:rc")"
    printf '%-26s %s\n' "live tag (:live)" "$(image_id "$REPO:live")"
    printf '%-26s %s\n' "staging container" "$(container_image physics-staging-web-1)"
    printf '%-26s %s\n' "production container" "$(container_image physics-web-1)"
    echo
    docker images "$REPO" --format '  {{.Repository}}:{{.Tag}}  {{.ID}}  {{.CreatedSince}}'
    ;;

  *)
    sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
