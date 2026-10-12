# tagent.space landing page

A single static page (`index.html`) with the T Agent logo and a link to the Fitness app at
<https://fitness.tagent.space>. Served by nginx from the Dockerfile here; on Railway it is the
`landing` service of the `fitness` project (root directory `/landing`, public port 8080), behind
Cloudflare for `tagent.space` and `www.tagent.space`.

Preview locally:

```bash
docker build -t tagent-landing landing && docker run --rm -p 8080:8080 tagent-landing
```
