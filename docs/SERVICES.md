# Live services checklist

Everything that runs on Railway under `tagent.space` and `sonorgroup.mn`, what each one is, and
how to confirm it is up. The same list is live on the landing page: the **Status** section at
<https://tagent.space> checks every row when the page loads and on *Check again*. From a terminal,
`sh scripts/check-services.sh` prints the checklist with live results and exits non-zero when
anything fails.

## How the Status section works

The landing nginx (`landing/nginx.conf`) proxies one path per service, so the page reads each
answer from its own origin and gets the real response code; not every service sends CORS headers,
and Railway's API only allows `railway.com`:

| Path on tagent.space | Proxies to | Up when |
|---|---|---|
| `/status/fitness` | `https://fitness.tagent.space/api/health` | 2xx |
| `/status/nomadex` | `https://project1.tagent.space/api/health` | 2xx |
| `/status/sonor-parts` | `https://22.sonorgroup.mn/api/health` | 2xx |
| `/status/sonor-mining` | `https://mining.sonorgroup.mn/login` | 2xx (the sign-in page is the check) |
| `/status/railway` | `POST https://backboard.railway.app/graphql/v2` `{ platformStatus { isStable } }` | `isStable` is `true` |

Timeouts are 5 s to connect and 8 s to answer; a service that misses them shows as down with the
502 or 504 nginx returns. Hostnames are resolved per request through `1.1.1.1`, the upstream
calls use HTTP/1.1 (Cloudflare refuses nginx's default HTTP/1.0 with a 426), and every status
answer is sent with `Cache-Control: no-store` so Cloudflare never serves a stale one. Adding a
service means one `location` line in `nginx.conf`, one `<li data-check="name">` on the page, and
a row below.

Snapshot below: 2026-10-25 07:35 UTC. All checks passed.

## tagent.space (Railway project `fitness`)

| | Service | URL | Check | Origin |
|---|---|---|---|---|
| [x] | Landing page (T Agent) | <https://tagent.space> | HTTP 200 | `landing` service, `yvh67ydq.up.railway.app` |
| [x] | Landing page (www) | <https://www.tagent.space> | HTTP 200 | `landing` service, `ktbmsyut.up.railway.app` |
| [x] | Fitness (openGym) web | <https://fitness.tagent.space> | HTTP 200 | `web` service, `vouf3ik1.up.railway.app` |
| [x] | Fitness api | <https://fitness.tagent.space/api/health> | `{"ok":true,"writable":true}` | `api` service, reached through `web` over `api.railway.internal` |
| [x] | Nomadex race control | <https://project1.tagent.space> | HTTP 200 | `ydkk8lwu.up.railway.app` |
| [x] | Nomadex api | <https://project1.tagent.space/api/health> | HTTP 200 | same service |
| [ ] | T Loan | none yet | listed as *Pending* on the landing page | not deployed |

All four hostnames are proxied CNAMEs on Cloudflare (SSL mode *Full*). The `*.up.railway.app`
origins answer 404 on their own because Railway only routes the custom domain, so always probe
the public hostname, never the origin.

The Fitness api health check is the one in `api/server.js`: it writes and removes a file under
`/data`, so `"writable":true` means the Railway volume is mounted and writable, not just that the
port answers.

## sonorgroup.mn (company services)

| | Service | URL | Check | Origin |
|---|---|---|---|---|
| [x] | Сонор Авто Сэлбэгийн Зах (auto parts market) | <https://22.sonorgroup.mn> | HTTP 200, `/api/health` 200 | `c88lmor1.up.railway.app`, Cloudflare proxied |
| [x] | Цагаан Чулуут, маркшейдерийн мэдээ (mining survey) | <https://mining.sonorgroup.mn> | HTTP 307 to `/login` | `97kvx74e.up.railway.app`, DNS only (not proxied) |

`sonorgroup.mn` and `www.sonorgroup.mn` have no A, AAAA or CNAME record, so the bare domain
does not serve a site; that is expected, not an outage. The zone only carries mail records
(iCloud MX, SPF, DKIM) and the two service CNAMEs above. The mining app sends anonymous visitors
to its login page, so a 307 is the healthy answer; a 5xx or a timeout is not.

## Railway platform

| | Check | Result |
|---|---|---|
| [x] | `platformStatus.isStable` on the public API | `true` |
| [x] | Active incidents on <https://status.railway.com> | none |
| [x] | Dashboard, API, Deployments, Compute, Networking, Domains, GitHub auto-deploys | 100% over 90 days |
| [ ] | Builds (every region) | 99.82% over 90 days, the only component below 100% besides public networking at 99.98% |
| [ ] | Notice: station.railway.com (support site) restored; new account signups paused, some non-essential features disabled | posted October 23, 22:03 UTC |

Neither open item affects the running services. The build figure matters only on the next push,
and the notice only for new Railway accounts.

## Not on the list

`tagent.online` (`www`, `api`, `admin`) answers from `47.100.239.54` and is not on Railway. Its
Cloudflare zone is still *pending*, so Cloudflare is not in front of it yet. It is not part of
`tagent.space` and the script does not probe it.

## Reading the Railway dashboard from a script

The Railway GraphQL API needs an account or team token for anything beyond `platformStatus`.
Create one at <https://railway.com/account/tokens> and call
`https://backboard.railway.app/graphql/v2` with `Authorization: Bearer <token>`; with it you can
list the `fitness` project's deployments and their status instead of probing from outside.
