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

Нэвтрэлт: PIN зөв бол сервер HMAC-тай session token-ийг cookie-гоор **болон** JSON-оор буцаана. Клиент token-ийг
localStorage-д хадгалж `Authorization: Bearer` толгойгоор илгээдэг тул iOS Safari cookie-г хаясан ч нэвтрэлт
ажиллана (сервер cookie эсвэл Bearer-ийн алийг нь ч хүлээн авна).

## Railway (одоогийн deploy)

Railway-ийн `fitness` project дотор `mom` service: энэ repo-оос (root directory `/mom-cleaner`, Dockerfile build),
volume `/data` дээр, `CLEANER_PIN` / `MOM_PIN` / `DATA_DIR` / `TZ_NAME` variables. Public URL:
<https://mom-production-b950.up.railway.app>, custom domain <https://mom.sonorgroup.mn>.

Custom domain одоогоор Cloudflare Worker-оор (`mom-proxy`, route `mom.sonorgroup.mn/*`, эх код `cloudflare/mom-proxy.js`)
Railway-ийн service domain руу proxy хийгдэж байна: Cloudflare дээр `mom` → CNAME → `8rhlvlg3.up.railway.app` (proxied). Railway-ийн
өөрийн custom-domain router энэ домэйныг таньж сертификат гаргаж чадаагүй (хэдэн цаг "validating ownership"
гацсан); Railway дээр сертификат VALID болсон үед Worker route-ийг устгаад CNAME-ийг DNS only болгоход л
Railway шууд үйлчилнэ.

- Branch руу push хийхэд Railway автоматаар дахин build хийнэ.
- PIN солих: Railway → mom service → Variables. `ANTHROPIC_API_KEY` нэмбэл AI тойм асна.
- Утсан дээр «Нүүр хуудсанд нэмэх» хийвэл апп шиг ажиллана.

Шинээр өөр газар тавих бол: Deploy from GitHub → Root Directory `mom-cleaner` → Variables → Volume `/data` → Custom Domain → DNS CNAME.
