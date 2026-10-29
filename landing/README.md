# tagent.space landing page

A single static page (`index.html`) for T Agent, Tulga's personal agent, laid out like the in-game
phone from GTA V: a phone frame with a status bar, a grid of app tiles (one per service, Fitness at
<https://fitness.tagent.space> first), key hints along the bottom, and arrow-key, Enter and Escape
navigation. Status, T Loan and About open inside the phone; the other tiles open the service. The
Status app reads each service's health through the `/status/<name>` proxies in `nginx.conf`
(see `docs/SERVICES.md`). Served by nginx from the Dockerfile here; on Railway it is the
`landing` service of the `fitness` project (root directory `/landing`, public port 8080), behind
Cloudflare for `tagent.space` and `www.tagent.space`.

Preview locally:

```bash
docker build -t tagent-landing landing && docker run --rm -p 8080:8080 tagent-landing
```
