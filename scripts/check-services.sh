#!/usr/bin/env sh
# Live check of every service behind tagent.space and sonorgroup.mn, plus Railway's platform
# status. Plain curl, no dependencies. Exit code is non-zero when any check fails.
#
#   sh scripts/check-services.sh
#
# A check passes on HTTP 200, or on 307 for mining.sonorgroup.mn, which sends anonymous
# visitors to its login page (the redirect proves the service is up).
set -u

fail=0
check() { # check <label> <url> <expected-code>
  code=$(curl -sS -o /dev/null -m 20 -w '%{http_code}' "$2" 2>/dev/null || echo 000)
  if [ "$code" = "$3" ]; then mark='[x]'; else mark='[ ]'; fail=1; fi
  printf '%s %-42s %-45s HTTP %s (want %s)\n' "$mark" "$1" "$2" "$code" "$3"
}

echo "== tagent.space (Railway project: fitness) =="
check 'landing'                  https://tagent.space/                      200
check 'landing (www)'            https://www.tagent.space/                  200
check 'Fitness web'              https://fitness.tagent.space/              200
check 'Fitness api health'       https://fitness.tagent.space/api/health    200
check 'Nomadex race control'     https://project1.tagent.space/             200
check 'Nomadex api health'       https://project1.tagent.space/api/health   200

echo "== sonorgroup.mn (company services) =="
check 'Sonor auto parts market'  https://22.sonorgroup.mn/                  200
check 'Sonor auto parts health'  https://22.sonorgroup.mn/api/health        200
check 'Tsagaan Chuluut mining'   https://mining.sonorgroup.mn/              307

echo "== Railway platform =="
stable=$(curl -sS -m 20 https://backboard.railway.app/graphql/v2 \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ platformStatus { isStable } }"}' 2>/dev/null | grep -o '"isStable":[a-z]*' | cut -d: -f2)
if [ "$stable" = "true" ]; then echo '[x] Railway platformStatus.isStable = true'
else echo "[ ] Railway platformStatus.isStable = ${stable:-unknown}"; fail=1; fi
echo '    incidents and per-region uptime: https://status.railway.com'

exit $fail
