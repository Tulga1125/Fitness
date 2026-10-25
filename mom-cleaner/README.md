# mom.sonorgroup.mn — гэрийн цэвэрлэгчийн апп

Ээжийн гэрийн цэвэрлэгчид зориулсан жижиг PWA. Нэг Node контейнер (framework-гүй `server.js`
+ `public/` доторх vanilla JS), өгөгдөл `DATA_DIR/data.json` файлд.

**Цэвэрлэгч** (🧹, PIN-ээр нэвтэрнэ)
- 👋 Ирлээ / 🏁 Явлаа — цаг бүртгэл, ажилласан хугацаа
- Тоглоом маягийн checklist: өрөө тус бүрийн ажил, оноо, XP, түвшин (Шинэ цэвэрлэгч → Легенд), 🔥 streak, шагнал (badge), бүгд дуусахад confetti
- Хүсэлт бичих (жишээ: нунтаг дууссан), ээжийн хүсэлтийг «Хийсэн ✓» гэх
- Хуваарь оруулах (ирэх өдөр, цаг)
- Миний цалин: энэ сарын бодогдсон цалин, авах үлдэгдэл

**Ээж** (👩, өөр PIN)
- Нүүр: одоо гэрт байна уу, явц, сүүлийн айлчлалууд, цэвэрлэгчийн хүсэлт
- Ажлууд: checklist-ийн ажил нэмэх/засах/устгах, оноо тогтоох
- Хүсэлт бичих, хуваарь харах/нэмэх
- Цалин: тариф (цагаар / айлчлал тутам + оноо тутмын урамшуулал), сараар нэгтгэл, өгсөн мөнгөний бүртгэл, үлдэгдэл
- 🤖 AI тойм (сонголттой, `ANTHROPIC_API_KEY` тохируулсан үед): "Энэ 2 долоо хоногт юу хийсэн бэ?"

## Ажиллуулах

```bash
npm install
CLEANER_PIN=1111 MOM_PIN=2222 npm start     # http://localhost:8080
npm test
```

| Env | Default | Тайлбар |
|---|---|---|
| `PORT` | `8080` | |
| `DATA_DIR` | `./data` (Docker: `/data`) | `data.json`, `secret` энд |
| `CLEANER_PIN` | `1111` | Цэвэрлэгчийн PIN — **заавал өөрчил** |
| `MOM_PIN` | `2222` | Ээжийн PIN — **заавал өөрчил** |
| `SESSION_DAYS` | `180` | Нэвтрэлт хэд хоног хадгалагдах |
| `TZ_NAME` | `Asia/Ulaanbaatar` | Огноо/цаг энэ бүсээр |
| `ANTHROPIC_API_KEY` | — | Байвал ээжийн нүүр дээр AI тойм гарна |

## Railway дээр тавих

1. Railway → **New Project → Deploy from GitHub repo** → энэ repo. Service Settings → **Root Directory** = `mom-cleaner`
   (Dockerfile-аа өөрөө олно, `railway.json` healthcheck-ийг тохируулна).
2. **Variables**: `CLEANER_PIN`, `MOM_PIN` (4 оронтой), сонголттой `ANTHROPIC_API_KEY`.
3. **Volumes → New Volume**, mount path `/data` — өгөгдөл redeploy хийхэд арилахгүй.
4. **Settings → Networking → Custom Domain** → `mom.sonorgroup.mn`. Railway CNAME утга өгнө.
5. `sonorgroup.mn`-ийн DNS дээр: `mom` → CNAME → Railway-ийн өгсөн хост (жишээ `xxxx.up.railway.app`).
   Cloudflare ашиглаж байвал proxy-г эхэндээ унтраа (DNS only), SSL гарсны дараа асаана.

Хэдхэн минутын дараа https://mom.sonorgroup.mn дээр нээгдэнэ. Утсан дээр «Нүүр хуудсанд нэмэх» хийвэл апп шиг ажиллана.
