# Doğrulama Raporu

## Bu dosya ne?

Bu dosya, Location Tracking Service'in case gereksinimlerini karşılayıp karşılamadığının kontrol kaydıdır. Her gereksinim için ne yapıldığı, nasıl doğrulandığı ve sonucu yazılır. Sonda soru-cevap bölümü vardır. Yeni sorular geldikçe oraya eklenir.

| | |
|---|---|
| Tarih | 28.09.2026 |
| Doğrulanan sürüm | `d677172` (main); Soru 10 ve sonrası: `ced220a` + filo, sürücü hesapları, alan düzenleme ve scooter detay paneli değişiklikleri (henüz commit edilmedi) |
| Ortam | Yerel makine, Docker (Colima: 4 CPU, 8 GB), `docker compose` ile tüm stack |

## Sistem nasıl işliyor?

```
Mobil uygulama ──POST /locations──▶ API ──▶ Redis kuyruğu (64 kullanıcı şeridi) ──▶ Worker'lar ──▶ PostGIS
   (5 sn'de bir)                   202 döner                                         │
                                                                                     └─▶ Redis pub/sub ──▶ API ──Socket.IO──▶ Operasyon ekranı
```

1. **Konum gelir:** Mobil uygulama aktifken yaklaşık 5 saniyede bir `POST /locations` ile `{ userId, lat, lng, timestamp }` gönderir. Bağlantı koptuğunda cihazda biriken konumlar bağlantı gelince `POST /locations/batch` ile toplu gönderilir (en fazla 100).
2. **API kuyruğa ekler:** API isteği doğrular, kullanıcının şeridine ekler ve hemen `202` döner. Veritabanına yazmaz. Bu yüzden ani trafik artışında yanıt süresi veritabanı hızına bağlı kalmaz.
3. **Worker işler:** Ayrı worker süreçleri kuyruktan konumu alır. Konumun hangi polygon alanların içinde olduğuna PostGIS ile bakar.
   - Kullanıcı yeni bir alana girdiyse o alan için bir **giriş kaydı** açılır (`area_logs`: kullanıcı, alan, giriş zamanı).
   - Kullanıcı alandan çıktıysa aynı kayda **çıkış zamanı** yazılır.
   - Kullanıcı alanın içinde kalmaya devam ediyorsa yeni kayıt açılmaz.
4. **Sıra korunur:** Aynı kullanıcının konumları tek tek, geliş sırasıyla işlenir. Farklı kullanıcılar paralel işlenir. Worker sayısı `docker compose up --scale worker=N` ile artırılabilir.
5. **Canlı yayın:** İşlenen konum ve giriş/çıkış olayları Redis üzerinden API'ye, oradan Socket.IO ile operasyon ekranına gider.

Servisler ve adresler:

| Servis | Adres |
|---|---|
| API + Swagger | http://localhost:3000/docs (anahtar: `dev-api-key`) |
| Operasyon uygulaması | http://localhost:8080 |
| Sürücü uygulaması | http://localhost:8081 |
| Sağlık durumu | http://localhost:3000/health |
| Postgres / Redis (host) | `localhost:5444` / `localhost:6390` |

## Doğrulama nasıl yapıldı?

Aşağıdaki adımların hepsi bu oturumda çalıştırıldı ve sonuçları buraya yazıldı.

### 1. Ortamın kurulması

```bash
colima start                         # Docker çalışmıyordu
docker compose up -d --build         # postgis, redis, migrate, api, 2 worker, ops, driver
node api/scripts/seed.mjs            # 10 örnek alan (Kadıköy/Moda)
```

- Migration'lar sorunsuz uygulandı: `AreaLogsAutovacuum`, `QueryStats`. Uygulama rolü `geofence_app` oluşturuldu.
- API ve worker veritabanına sadece gereken tablolara yetkili bu rolle bağlanıyor. Yazma ve okuma bu rolle çalıştı.

**Karşılaşılan sorunlar:**

- **8080 portu doluydu.** Başka bir projenin (OtodexaV2) geliştirme sunucusu 8080'i tutuyordu. O sunucu durdurulunca operasyon uygulaması 8080'e döndü.
- **`npm ci` host'ta hata veriyor.** Host'taki npm 10, `api/package-lock.json` dosyasını uyumsuz buluyor (`Missing: typescript@5.9.3 from lock file`). Docker imajındaki gibi npm 11 ile sorunsuz kuruluyor:
  ```bash
  cd api && PATH=/opt/homebrew/opt/node@26/bin:$PATH npm ci
  ```
  README'deki `cd api && npm ci && npm run seed` adımı npm 10 ile çalışmıyor. Seed betiği bağımlılık kullanmadığı için `node scripts/seed.mjs` ile doğrudan çalıştırılabiliyor.

### 2. Uçtan uca deneme

Alanın içinde bir konum gönderildi. Worker işledi ve giriş kaydı oluştu:

```bash
curl -X POST localhost:3000/locations -H 'x-api-key: dev-api-key' -H 'content-type: application/json' \
  -d '{"userId":"smoke-1","lat":40.985,"lng":29.025,"timestamp":"2026-09-27T22:05:53Z"}'
# → 202 {"jobId":"0:1", ...}
curl -H 'x-api-key: dev-api-key' 'localhost:3000/logs?userId=smoke-1'
# → Kadıköy Hizmet Bölgesi, entryTime 2026-09-27T22:05:53Z, exitTime null
```

### 3. Otomatik testler

```bash
PATH=/opt/homebrew/opt/node@26/bin:$PATH ./scripts/test-all.sh
```

| Aşama | Sonuç |
|---|---|
| Backend lint + tip kontrolü | ✓ |
| Frontend tip kontrolü | ✓ |
| Backend birim | ✓ 136/136 |
| Frontend birim | ✓ 77/77 |
| Veritabanı (migration, kısıt, sorgu planı, uygulama rolü) | ✓ 28/28 |
| Backend e2e (gerçek PostGIS + Redis) | ✓ 66/66 |
| Veritabanı, backend ve frontend smoke | ✓ |
| Tarayıcı e2e (Playwright) | ✓ 18/18 |

Test sayıları `502727e` sürümünde koşulan sonuçlardır. `d677172` sürümüyle gelen yeni testler henüz koşulmadı.

### 4. Yük testi (k6)

```bash
PEAK_RPS=2000 WORKERS=2 ./loadtest/run.sh
```

5.000 scooter, 70 saniyede 2.000 istek/sn'ye çıkan yük, 2 worker:

| | |
|---|---|
| Kabul edilen konum | 101.750 (%100 `202`) |
| Başarısız istek / düşen istek | 0 / 0 |
| Yanıt süresi (tepe yükte) | p95 0,65 ms, p99 1,6 ms, en fazla 10 ms |
| En yüksek kuyruk birikimi | 10 iş |
| Yük bitince kuyrukta kalan | 0 (worker'lar yüke anında yetişti) |
| Ortalama işleme | ~1.200 konum/sn (alt sınır) |
| k6 eşikleri | hepsi geçti |

Test sonrası kuyrukta hata alan iş yoktu, API ve worker loglarında hata yoktu. Worker'lar hiç geride kalmadığı için gerçek kapasite (boşalma hızı) bu koşuda ölçülemedi.

### 5. Kayıtların veritabanıyla tutarlılığı

Yük testinden sonra 4.034 giriş kaydının hepsi, kullanıcıların son konumlarıyla karşılaştırıldı:

| Kontrol | Sonuç |
|---|---|
| "İçeride" görünüp son konumu alanın dışında olan | 0 |
| Son konumu alanın içinde olup açık kaydı olmayan | 0 |
| Açık kaydı olup hiç konumu olmayan | 0 |
| Aynı kullanıcı ve alanda zamanı çakışan ziyaret | 0 |
| Çıkışı girişten önce olan kayıt | 0 |

Sorgular (`docker compose exec -T postgres psql -U geofence -d geofence`):

```sql
-- Açık kayıt var ama son konum alanın dışında
SELECT count(*) FROM area_logs l JOIN areas a ON a.id = l.area_id
JOIN user_last_location u ON u.user_id = l.user_id
WHERE l.exit_time IS NULL AND NOT ST_Covers(a.geom, ST_SetSRID(ST_MakePoint(u.lng, u.lat), 4326));

-- Son konum alanın içinde ama açık kayıt yok
SELECT count(*) FROM user_last_location u JOIN areas a
  ON ST_Covers(a.geom, ST_SetSRID(ST_MakePoint(u.lng, u.lat), 4326))
WHERE NOT EXISTS (SELECT 1 FROM area_logs l
  WHERE l.user_id = u.user_id AND l.area_id = a.id AND l.exit_time IS NULL);

-- Aynı kullanıcı ve alanda çakışan ziyaretler
SELECT count(*) FROM area_logs a JOIN area_logs b
  ON a.user_id = b.user_id AND a.area_id = b.area_id AND a.id < b.id
 AND tstzrange(a.entry_time, coalesce(a.exit_time, 'infinity'))
  && tstzrange(b.entry_time, coalesce(b.exit_time, 'infinity'));

-- Çıkışı girişten önce olan
SELECT count(*) FROM area_logs WHERE exit_time < entry_time;
```

### 6. Giriş kayıtları ekranı (http://localhost:8080/#/logs)

Tarayıcıda denendi:

- Kayıtlar en yeni girişten eskiye listeleniyor.
- "Çıkmış" filtresi çalışıyor. Süre sütunu giriş ve çıkış zamanıyla tutarlı (ör. 03:58:35 → 03:58:40 = 5 sn).
- "Daha fazla göster" sıradaki sayfayı ekliyor.
- Saatler yerel saatle (UTC+3) doğru gösteriliyor.
- Konsolda hata yok. Üstteki "kuyrukta 0 konum" bilgisi gerçeği yansıtıyor.

## Açık konular

1. ~~**Sessiz kalan cihazlar hep "İçeride" görünüyor.**~~ **Çözüldü (Soru 10).** Sunucu tarafı seçildi: worker 10 dakika konum göndermeyen scooter'ın açık girişlerini son sinyal anıyla kapatıyor ve `SIGNAL_LOST` diye işaretliyor; kayıtlar ekranında "Sinyal kaybı" etiketi görünüyor. İlk tur, yük testinden kalan 3.515 hayalet kaydın hepsini kapattı.
2. ~~**Geliştirme veritabanında test verisi kaldı.**~~ **Kısmen çözüldü.** `loadtest/run.sh` artık kuyruk boşalınca `load-*` verisini siliyor (`KEEP_DATA=1` ile tutulur); `test-all.sh` tarayıcı testlerinin sürücü, scooter ve kiralamalarını da siliyor. Önceki koşulardan kalan `load-*` kayıtları elle silinmedi; `smoke-test-area` alanı smoke testinin kasıtlı sabit alanı.
3. **İçerideki kayıtlarda süre boş.** Hâlâ açık. Sinyal kaybı çözüldüğü için artık "22 dk, sürüyor" göstermek yanıltıcı olmaz (sessiz cihazın kaydı 10 dakikada kapanıyor).
4. ~~**`npm ci` host'taki npm 10 ile çalışmıyor.**~~ **README düzeltildi.** Hızlı başlangıç artık bağımlılık gerektirmeyen `node api/scripts/seed.mjs` kullanıyor; testler için npm 11 (Node 24+) gerektiği yazıldı. Lock dosyasının kendisi değişmedi.

## Soru ve cevaplar

### Soru 1

> Kullanıcıların mobil uygulama üzerinden aktif oldukları süre boyunca yaklaşık her 5 saniyede bir güncel konum bilgilerini sisteme gönderdiği bir mikroservis geliştirilmesi beklenmektedir. Bu işlem yapıldı mı?

**Cevap: Evet.**

**Mikroservis tarafı** (`api/`, NestJS):
- `POST /locations` konumu alıyor (`api/src/locations/locations.controller.ts:35`). İstek `userId`, `lat`, `lng`, `timestamp` alanlarını taşıyor ve dördü de zorunlu.
- API isteği doğrulayıp kuyruğa ekliyor ve hemen `202` dönüyor. Konumları ayrı worker süreçleri işliyor. Bu yüzden 5 saniyede bir gelen trafik API'yi veritabanı hızına bağlamıyor, ve worker'lar yatayda çoğaltılabiliyor.
- `POST /locations/batch`: Bağlantı koptuğunda biriken konumlar tek istekte, en fazla 100'lük gruplar halinde gönderilebiliyor.
- Kullanıcı başına dakikada 60 istek sınırı var. 5 saniyede bir gönderim dakikada 12 istek eder, sınırın rahatça altında.

**Mobil uygulama tarafı** (case kapsamı dışında, demo):
- Sürücü uygulaması aktifken 5 saniyede bir konum ölçüp gönderiyor (`clients/driver/src/config.ts`, `GPS_INTERVAL_MS = 5000`).
- Bölge sınırı geçildiğinde 5 saniyeyi beklemeden hemen ölçüm yapıyor.

**Doğrulama:**
- `api/test/requirements.e2e-spec.ts`: 100 eşzamanlı kullanıcı 5 saniye aralıkla konum gönderiyor ve doğru sayıda giriş oluşuyor. Alanda kalan bir kullanıcı 5 saniyede bir konum gönderse de tek kayıt açılıyor. Bu testler `test-all.sh` koşusunda geçti.
- k6 yük testinde 5.000 scooter saniyede 2.000 isteğe kadar konum gönderdi. 101.750 konumun hepsi kabul edildi, p99 yanıt süresi 1,6 ms.

**Not:** "Aktif oldukları süre boyunca" kısmı istemci tarafında karşılanıyor. Cihaz konum göndermeyi bıraktığında sunucu bunu fark edip bir şey yapmıyor (bkz. Açık konular, 1. madde).

### Soru 2

> Sistemde önceden tanımlanmış polygon (çokgen) şeklindeki coğrafi alanlar bulunmaktadır. Kullanıcının gönderdiği konumun bu alanlardan birine girmesi durumunda ilgili giriş bilgisi kaydedilmelidir. Bu yapıldı mı?

**Cevap: Evet.**

**Polygon alanlar:**
- Alanlar PostGIS'te `geometry(Polygon, 4326)` olarak saklanıyor (`areas` tablosu). `POST /areas` ile GeoJSON Polygon olarak tanımlanıyor, `GET /areas` ile listeleniyor.
- Veritabanı geçersiz polygonu kabul etmiyor (`CHECK (ST_IsValid(geom))`). Polygon olmayan geometri ve kendini kesen polygon `400` alıyor.
- Alanlar GiST index'li. Her konumda tüm polygonlar taranmıyor, önce index'teki sınırlayıcı kutularla aday alanlar daraltılıyor.
- Ortamda 10 önceden tanımlı alan var (`node api/scripts/seed.mjs`): hizmet bölgesi, sürüş yasak, yavaş bölge, park yasak ve park alanları.

**Giriş kaydı** (`api/src/geofence/`):
1. Worker, konumun içinde bulunduğu alanları bulur: `ST_Contains(a.geom, nokta)` (`geofence.repository.ts:61`).
2. Bunu kullanıcının açık kayıtlarıyla karşılaştırır. Yeni girilen alanlar ve çıkılan alanlar ayrı ayrı çıkarılır.
3. Yeni girilen her alan için `area_logs` tablosuna bir kayıt açılır: kullanıcı, alan ve giriş zamanı. Giriş zamanı, sunucunun işlediği an değil, konumla gönderilen `timestamp` değeridir.
4. Kullanıcı alandan çıkınca aynı kayda `exit_time` yazılır. Alanın içinde kaldığı sürece yeni kayıt açılmaz.
5. Kayıtlar `GET /logs` ile okunuyor. Filtreler: kullanıcı, alan, hâlâ içeride mi, giriş zamanı aralığı.

**Mükerrer ve hatalı kayda karşı korumalar:**
- Aynı kullanıcının konumları kullanıcıya özel bir kilit (`pg_advisory_xact_lock`) altında tek transaction'da işleniyor. Aynı konum farklı worker'larda aynı anda işlense bile tek giriş açılıyor.
- Veritabanı da aynı alanda iki açık kaydı reddediyor: `(user_id, area_id) WHERE exit_time IS NULL` üzerinde unique index var.
- Daha eski bir konum geç gelirse atlanıyor. Böylece durum geriye gitmiyor ve sahte çıkış/giriş oluşmuyor.
- Çıkışı girişten önce olan kayıt veritabanı kısıtıyla engelleniyor.

**Kenar durumlar:**
- **Çakışan alanlar:** Nokta aynı anda iki alanın içindeyse her alan için ayrı kayıt açılıyor.
- **Polygon delikleri (hole):** Delikteki nokta alanın içinde sayılmıyor.
- **Sınır çizgisi:** Tam sınır çizgisi üzerindeki nokta içeride sayılmıyor (`ST_Contains`). Gerçek GPS verisinde pratik bir etkisi yok.

**Doğrulama:**
- `api/test/requirements.e2e-spec.ts` bu maddeyi testlerle kontrol ediyor:
  - `GET /logs` kaydı User ID, Area ID ve Entry Time içeriyor. Entry Time gönderilen timestamp.
  - Alan dışındaki konum kayıt üretmiyor.
  - 5 saniyede bir içeride kalan kullanıcı için tek kayıt tutuluyor.
  - Çakışan alanlarda ayrı kayıtlar açılıyor, delikteki nokta giriş sayılmıyor.
- `test/geofence.e2e-spec.ts` aynı konumu 50 kopya halinde paralel işliyor ve tek giriş oluştuğunu doğruluyor.
- Bu testler `test-all.sh` koşusunda geçti.
- Elle deneme: Kadıköy Hizmet Bölgesi'nin içinde gönderilen konum için `GET /logs` giriş kaydını doğru alan ve giriş zamanıyla döndü.
- Yük testinden sonra 4.034 kaydın hepsi son konumlarla karşılaştırıldı (bkz. "Kayıtların veritabanıyla tutarlılığı"). Tutarsızlık yok: kaçan giriş, hatalı "İçeride" ya da mükerrer kayıt çıkmadı.

### Soru 3

> Aktif kullanıcı sayısının ve buna bağlı olarak oluşan konum trafiğinin zaman içerisinde önemli ölçüde artabileceği varsayılmalıdır.

**Cevap: Evet, sistem trafik artışına göre tasarlanmış ve yük altında doğrulandı.** Sınırları aşağıda ayrıca yazıldı.

**Trafik artışına karşı alınan önlemler:**

| Katman | Önlem |
|---|---|
| API | Konumu veritabanına yazmıyor; doğrulayıp kuyruğa ekliyor ve hemen `202` dönüyor. Ani yükte yanıt süresi veritabanı hızına bağlı kalmıyor. |
| API | Durumsuz (stateless). Birden fazla instance çalıştırılabilir: rate limit sayacı ve canlı yayın Redis üzerinden paylaşılıyor. |
| Kuyruk | Redis/BullMQ. İşleyemediği yükü kuyrukta biriktirip sonra eritiyor. Kuyruk diske yazılıyor (AOF): Redis yeniden başlarsa bekleyen konumlar kaybolmuyor. |
| Worker | API'den ayrı süreç. `docker compose up --scale worker=N` ile yatayda çoğaltılıyor. |
| Worker | 64 kullanıcı şeridi: farklı kullanıcılar paralel, aynı kullanıcı sırayla işleniyor. |
| Veritabanı | Konum başına tek okuma + tek yazma sorgusu. Giriş/çıkış yoksa diske yazmayı beklemiyor (`synchronous_commit = off`, sadece o transaction'da). |
| Veritabanı | GiST index'li alanlar. Alan sayısı binlere çıksa da her konumda tüm polygonlar taranmıyor. |
| Veritabanı | Son konum güncellemeleri HOT (tablo şişmiyor). Giriş kayıtlarında sıkı autovacuum eşikleri. |
| Veri büyümesi | `GET /logs` keyset (cursor) sayfalama kullanıyor. README'deki ölçüme göre 3 milyon kayıtta bile tüm filtreler 2 ms'nin altında, sayfa derinliği hızı etkilemiyor. |
| Aşırı yük | Kuyruk 200.000 işi aşarsa API `503 Retry-After: 5` dönüyor (Redis belleği dolmasın). Kullanıcı başına dakikada 60 istek sınırı (`429`). İstemci `Retry-After` kadar bekleyip tekrar deniyor. |
| Operasyon | Kapanışta (deploy, ölçek küçültme) istek kaybolmuyor. Çöken worker'ın işi ~30 sn içinde başka worker'a geçiyor. Veritabanı kesintisinde işler 5 dakika bekleyip kaldığı yerden devam ediyor. |
| Gözlemlenebilirlik | Prometheus metrikleri (`/metrics`): kuyruk derinliği, en dolu şerit, işleme süreleri. `/health` kuyruk sayaçlarını gösteriyor. |

**Doğrulama (bu oturumda):**
- k6 yük testi: 5.000 scooter, saniyede 2.000 isteğe çıkan yük, 2 worker, 4 CPU'luk Docker ortamı. Sonuçlar:
  - 101.750 konumun hepsi kabul edildi.
  - Hiç hata ya da düşen istek yok.
  - Yanıt süresi p99 1,6 ms.
- Tepe yük (2.000 konum/sn) 30 saniye boyunca sürdü. Kuyruk birikimi en fazla 10 işte kaldı, yani worker'lar yükü anında işledi.
- 5 saniyede bir gönderimde kullanıcı başına saniyede 0,2 konum düşer. Saniyede 2.000 konum, **yaklaşık 10.000 eşzamanlı aktif kullanıcı** eder. Bu ortam o yükü birikme olmadan kaldırdı.
- README'deki önceki ölçüm (2 vCPU'luk ortam, en kötü durum senaryosu `MOVE=teleport`) en az ~5.650 eşzamanlı kullanıcı veriyor.
- Kapanış, çöken worker, veritabanı kesintisi ve `503` backpressure davranışları e2e testleriyle doğrulanıyor. Bu testler `test-all.sh` koşusunda geçti.

**Sınırlar ve ölçülmeyenler:**
- **Gerçek kapasite ölçülmedi.** Bu koşuda worker'lar hiç geride kalmadığı için tavan görülemedi. Daha yüksek yükle (`PEAK_RPS=4000`) ya da en kötü durumla (`MOVE=teleport`) ölçülmesi gerekiyor. Uzun süreli sabit yük (`PROFILE=soak`) hiç koşulmadı; bellek sızıntısı ve tablo şişmesi bu yüzden henüz görülmedi.
- **Tek Postgres son darboğaz.** Worker eklemek, Postgres'in kaldırabildiği yere kadar hız artırır. README'deki ölçümde CPU'nun en büyük payı Postgres'teydi. Bunun ötesi için daha güçlü veritabanı sunucusu, okuma replikası ya da partitioning gerekir; bunlar yapılmadı.
- **Paralellik 64 şeritle sınırlı.** Worker sayısı ne olursa olsun aynı anda en fazla 64 iş işleniyor (`QUEUE_LANES`). Daha fazla paralellik için bu sayı artırılmalı. Değiştirmek için API durdurulup kuyruğun boşalması bekleniyor ve tüm süreçler yeni değerle açılıyor.
- **Tek Redis.** Cluster veya yedekli yapı yok. Redis kapanırsa yeni konumlar kabul edilmiyor. Kuyruk diske yazıldığı için bekleyen konumlar kaybolmuyor.
- **`area_logs` sınırsız büyüyor.** Veri saklama politikası ve partitioning yok. README bunu "bilinçli olarak kapsam dışı" diye listeliyor ve bir tasarım öneriyor. 1 milyon kayıt index'lerle birlikte ~255 MB tutuyor.

### Soru 4

> Proje Nest projesi mi?

**Cevap: Evet, mikroservis (`api/`) bir NestJS projesi.** Sürüm NestJS 12, dil TypeScript. İstemciler (`clients/`) ise Nest değil, React 19 + Vite.

**Kanıt:**
- `api/package.json`: `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `@nestjs/typeorm`, `@nestjs/swagger`, `@nestjs/websockets`, `@nestjs/platform-socket.io` (hepsi 12.x). Geliştirme için `@nestjs/cli` ve `@nestjs/testing`.
- `api/nest-cli.json` var. Derleme `nest build` ile yapılıyor.
- Proje Nest'in modül yapısında: 14 modül (`app.module.ts`, `worker.module.ts`, `locations`, `areas`, `logs`, `geofence`, `queue`, `realtime`, `health`, `metrics`, `security`, `config`, `database`). Controller, servis ve gateway'ler Nest dekoratörleriyle yazılmış (`@Controller`, `@Injectable`, `@WebSocketGateway`).

**Aynı kod tabanından iki süreç çıkıyor:**

| Süreç | Giriş dosyası | Nasıl açılıyor |
|---|---|---|
| API (HTTP + Socket.IO) | `api/src/main.ts` | `NestFactory.create(AppModule)` |
| Worker (HTTP sunucusu yok) | `api/src/worker.ts` | `NestFactory.createApplicationContext(WorkerModule)` |

Worker, Nest'in HTTP sunucusu açmayan uygulama bağlamını kullanıyor. Aynı servisleri ve dependency injection'ı paylaşıyor, sadece kuyruğu dinliyor.

**Yanındaki teknolojiler:** TypeORM (`@nestjs/typeorm` ile), BullMQ (kuyruk), Socket.IO (Nest WebSocket gateway'i), Swagger (`/docs`), Vitest (testler).

### Soru 5

> Projenin dili TypeScript mi? Proje veritabanı PostgreSQL mi?

**Cevap: İkisi de evet.**

**Dil: TypeScript**
- Uygulama kodunun tamamı TypeScript: 228 `.ts`/`.tsx` dosyası. Mikroservis (`api/`, NestJS) ve istemciler (`clients/`, React) aynı dilde.
- `strict` mod açık (`api/tsconfig.json`, `clients/tsconfig.base.json`). TypeScript 6.x.
- Tip kontrolü testlerle birlikte koşuluyor (`api: npm run typecheck`, `clients: npm run typecheck`) ve `test-all.sh` koşusunda geçti.
- JavaScript dosyaları sadece uygulama dışındaki yardımcı betiklerde var (14 dosya):
  - Seed ve smoke betikleri: `api/scripts/*.mjs`, `clients/scripts/smoke.mjs`
  - Tarayıcı e2e testleri: `clients/e2e/*.mjs`
  - k6 yük testi: `loadtest/locations.k6.js`. k6 kendi JavaScript çalışma ortamını kullanır.
  - Yol verisi indirme betiği: `clients/driver/scripts/fetch-roads.mjs`
- Bunlara ek olarak `.claude/skills/k6/examples/` altında 14 k6 örnek dosyası var. Bunlar projenin kodu değil, Claude Code skill'inin örnekleri.

**Veritabanı: PostgreSQL**
- **PostgreSQL 17.6 + PostGIS 3.5.3.** Çalışan container'dan `select version()` ve `postgis_full_version()` ile doğrulandı. İmaj: `imresamu/postgis:17-3.5` (arm64 desteklediği için).
- **Bağlantı:** TypeORM `type: 'postgres'` ile, sürücü `pg` (`api/src/database/typeorm-options.ts`).
- **Tablolar:**
  - `areas`: polygon alanlar, `geometry(Polygon, 4326)`
  - `area_logs`: giriş/çıkış kayıtları
  - `user_last_location`: kullanıcıların son konumu
- **PostgreSQL'e özgü kullanılan özellikler:**
  - PostGIS: `ST_Contains`, `ST_IsValid`, GiST index
  - Kısmi unique index (aynı alanda tek açık giriş)
  - Advisory lock (kullanıcı başına sıra)
  - CTE ile tek sorguda yazma
  - `pg_stat_statements` (sorgu istatistikleri)
- **Redis veritabanı değil,** sadece kuyruk ve canlı yayın için kullanılıyor. Kalıcı verinin tamamı PostgreSQL'de.

### Soru 6

> ORM olarak TypeORM mi kullanıyoruz yoksa Prisma mı?

**Cevap: TypeORM** (1.x, `@nestjs/typeorm` ile). Projede Prisma yok: bağımlılıklarda, şema dosyasında ya da kodda geçmiyor. README'de sadece neden seçilmediği anlatılıyor.

**TypeORM nerede kullanılıyor:**
- **Entity'ler:** `Area` (`api/src/areas/area.entity.ts`), `AreaLog` (`api/src/logs/area-log.entity.ts`), `UserLastLocation` (`api/src/geofence/user-last-location.entity.ts`).
- **Repository:** Alan kaydı ve listeleme TypeORM repository ile yapılıyor (`AreasService`, `@InjectRepository(Area)`).
- **Migration'lar:** TypeORM migration sınıfları, 4 adet (`api/src/database/migrations/`). Migrate ayrı bir süreçte çalışıyor (`node dist/database/migrate.js`).
- **`synchronize: false`:** Şema otomatik değiştirilmiyor, sadece migration'larla değişiyor.
- **Transaction:** Konum işleme `dataSource.transaction(...)` içinde yapılıyor.

**Ham SQL kullanılan yerler:** Performans gereken sorgular TypeORM'un `manager.query()` metoduyla ham SQL olarak yazılmış:
- Konum işleme (`geofence.repository.ts`): tek sorguda okuma, tek CTE sorgusunda yazma, advisory lock.
- Giriş kayıtları listesi (`logs.service.ts`): keyset sayfalama.
- Son konumlar (`latest-locations.service.ts`).

README'ye göre gerekçe: bu sorgular (CTE ile tek sorguda yazma, keyset sayfalama, PostGIS fonksiyonları) ORM'in sorgu kurucusuyla ifade edilemiyor. Bağlantı, transaction ve migration yine TypeORM üzerinden yönetiliyor.

**Neden Prisma değil** (README, "Teknoloji tercihleri"): TypeORM PostGIS `geometry` kolonunu doğrudan destekliyor. Prisma'da bu kolon `Unsupported` kalıyor ve coğrafi sorguların hepsi ham SQL'e dönüşüyordu.

### Soru 7

> Bunların dışında kullanılan ek teknolojiler README içerisinde gerekçesiyle birlikte yazıldı mı?

**Cevap: Kısmen.** Servisin çalışması için gereken ek teknolojilerin hepsi README'nin "Teknoloji tercihleri" bölümünde gerekçesiyle yazılmış. Test, geliştirme araçları ve demo arayüzü için seçilen teknolojilerin çoğu README'de geçiyor, ama neden seçildikleri yazmıyor. Birkaçı hiç geçmiyor.

`api/package.json`, `clients/package.json` ve `docker-compose.yml` içindeki her teknoloji README ile karşılaştırıldı.

**Gerekçesiyle yazılanlar** (README, "Teknoloji tercihleri"):

| Teknoloji | README'deki gerekçe |
|---|---|
| PostGIS | Nokta-polygon kontrolü veritabanında, index ile yapılır. Uygulama belleğinde yapılsaydı worker'ların alan listesini tutarlı tutması ayrı bir problem olurdu. Ayrı servis değil, PostgreSQL eklentisi. |
| Redis + BullMQ | Trafik aktif kullanıcıyla doğru orantılı büyür. API kuyruğa atıp hemen döner, işleme tarafı API'den bağımsız ölçeklenir, başarısız işler tekrar denenir. |
| TypeORM | PostGIS `geometry` kolonunu doğrudan destekliyor; Prisma'da `Unsupported` kalıyor. |
| Socket.IO | Sadece demo istemcilerindeki canlı bildirim için; servisin temel işleyişi buna bağlı değil (`REALTIME_ENABLED=false`). |
| prom-client | Prometheus metrikleri için standart Node kütüphanesi. Log için ek paket kullanılmadığı da yazıyor (NestJS logger, JSON modu). |

**README'de geçen ama gerekçesi yazmayanlar:**

| Teknoloji | Ne için | README'de ne var |
|---|---|---|
| React 19, Vite 8, Leaflet | Demo arayüzleri | Sadece teknoloji tablosunda. Demo uygulamalarının neden eklendiği yazıyor, bu teknolojilerin neden seçildiği yazmıyor. |
| Leaflet-Geoman | Operasyon ekranında alan çizimi | Sadece proje yapısında adı geçiyor. |
| Swagger | API dokümantasyonu (`/docs`) | Sadece adresi. |
| Vitest | Backend ve frontend testleri | Test çatısı olduğu yazıyor. NestJS'in varsayılanı Jest olduğu için neden Vitest seçildiği belirtilmeli. |
| Playwright | Tarayıcı e2e testleri | Test bölümünde adı geçiyor. |
| k6 | Yük testi | Nasıl kullanıldığı ayrıntılı anlatılıyor, neden seçildiği yok. |
| Docker Compose, nginx | Ortam, demo uygulamalarının sunulması | nginx'in rolü (API anahtarını eklemesi) anlatılıyor. |

**README'de hiç geçmeyenler:**

| Teknoloji | Ne için | Not |
|---|---|---|
| oxlint | Lint (`npm run lint`) | ESLint yerine seçilmiş. Yaygın tercihten sapma olduğu için gerekçe yazılmalı. |
| class-validator, class-transformer | İstek doğrulama (DTO'lar) | NestJS'in standart doğrulama yöntemi. |
| ioredis | Redis bağlantısı | BullMQ'nun kullandığı Redis istemcisi. |
| supertest, jsdom, Prettier | Test ve kod biçimi | Standart yardımcı araçlar. |
| `imresamu/postgis` imajı | Postgres container'ı | Gerekçe README'de değil, `docker-compose.yml` içinde yorum olarak var: resmi `postgis/postgis` imajı sadece amd64, bu imaj arm64'ü de destekliyor. |
| `@nestjs/mau` | — | `api/package.json` geliştirme bağımlılıklarında var, ama kodda ve betiklerde hiç kullanılmıyor. NestJS'in bulut deploy aracı. Kalıntı olabilir, kaldırılması düşünülmeli. |

**Öneri:** "Teknoloji tercihleri" bölümüne kısa bir "Araçlar" alt başlığı eklenebilir: Vitest (neden Jest değil), oxlint (neden ESLint değil), k6, Playwright, Swagger ve demo arayüzü için React/Vite/Leaflet, birer cümlelik gerekçeyle. `@nestjs/mau` da ya kaldırılmalı ya da neden durduğu yazılmalı.

### Soru 8

> Şu endpoint'ler projede yer alıyor mu?
> - `/locations`: UserID, Lat, Lng, Timestamp
> - `/areas`: Yeni bir polygon coğrafi alan tanımlanmasını sağlar. Veri modeli ve saklama yöntemi nasıl, yüksek kullanımda mevcut yapı uygun mu?
> - `/areas`: Tanımlı alanları listeliyor mu?
> - `/logs`: Kaydedilmiş alan girişlerini listeliyor mu? Hangi bilgiler yer alıyor? UserID, AreaID, Entry Time dışında başka hangi bilgiler loglanıyor?

**Cevap: Dört endpoint'in hepsi var ve istenen alanlarla çalışıyor.** Her biri çalışan sistemde denendi. Deneme için oluşturulan alan ve kullanıcı sonra silindi.

#### `POST /locations`: Evet

| Alan | Tip | Kural |
|---|---|---|
| `userId` | string | Zorunlu, en fazla 64 karakter, harf/rakam ve `_ . : -` |
| `lat` | number | Zorunlu, -90 ile 90 arası |
| `lng` | number | Zorunlu, -180 ile 180 arası |
| `timestamp` | string | Zorunlu, ISO 8601, saat dilimi zorunlu (`Z` ya da `±hh:mm`). Sunucu saatinden en fazla 60 sn ileride olabilir. |

- Yanıt `202 { jobId, recordedAt }`. Konum kuyruğa alınıyor, worker işliyor.
- Eksik ya da hatalı alan `400` alıyor. Denendi: `timestamp` olmadan gönderilen istek `400` döndü.
- Ek olarak `POST /locations/batch` var: en fazla 100 konum tek istekte (çevrimdışı birikim için).

Küçük bir kusur: `timestamp` eksik olduğunda hata mesajı yanıtta iki kez yazıyor. Aynı mesaj iki ayrı doğrulayıcıya verilmiş (`api/src/common/validation/api-timestamp.ts`: `IsISO8601` ve `Matches`). İşlevi etkilemiyor.

#### `POST /areas`: Evet

- Gövde: `{ name, type, geometry }`. `geometry` GeoJSON Polygon, koordinatlar `[boylam, enlem]` (WGS84).
- `type` şunlardan biri: `NO_RIDE` (sürüş yasak), `SLOW` (yavaş bölge), `NO_PARKING` (park yasak), `PARKING` (park alanı), `SERVICE` (hizmet bölgesi).
- Yanıt `201`: `{ id, name, type, geometry, createdAt }`.
- Polygon olmayan geometri, kendini kesen polygon ya da 10.000'den fazla köşe `400` alıyor. Denendi: `Point` gönderildiğinde `400` döndü.
- Yeni alan oluşturulunca worker'lar hemen kullanıyor, önbellek yok. Denendi: yeni oluşturulan alanın içine gönderilen konum anında giriş kaydı açtı.

#### `GET /areas`: Evet

- Tüm tanımlı alanları geometrileriyle döndürüyor: `id`, `name`, `type`, `geometry`, `createdAt`.
- İsteğe bağlı `type` filtresi var. Denendi: `?type=PARKING` üç park alanını döndürdü.
- Sayfalama yok. README bunu bilinçli bir varsayım olarak yazıyor: alanlar binler mertebesinde ve seyrek değişir.

#### `GET /logs`: Evet

Denemede alana girip çıkan kullanıcı için dönen kayıt:

```json
{
  "id": "4041",
  "userId": "dogrulama-1",
  "areaId": "3fcfd878-…",
  "areaName": "Doğrulama Alanı",
  "areaType": "NO_PARKING",
  "entryTime": "2026-09-28T01:55:52.000Z",
  "exitTime": "2026-09-28T01:55:54.000Z"
}
```

| Alan | İstenen mi? | Açıklama |
|---|---|---|
| `userId` | ✓ İstenen | Kullanıcı kimliği |
| `areaId` | ✓ İstenen | Alan kimliği (UUID) |
| `entryTime` | ✓ İstenen | Alana giriş anı. Sunucu saati değil, konumla gönderilen `timestamp`. |
| `exitTime` | Ek | Alandan çıkış anı. Kullanıcı hâlâ içerideyse `null`. |
| `areaName`, `areaType` | Ek | Alan bilgisi. Ayrıca `/areas` çağırmaya gerek kalmasın diye yanıta ekleniyor (veritabanında ayrıca saklanmıyor, `areas` tablosundan birleştiriliyor). |
| `id` | Ek | Kaydın kimliği |

- **Filtreler:** `userId`, `areaId`, `active` (hâlâ içeride mi), `from`/`to` (giriş zamanı aralığı).
- **Sayfalama:** `limit` ve `cursor`. Yanıtta `nextCursor` dönüyor. Sıralama en yeni girişten eskiye.
- **Veritabanında olup API'de dönmeyen:** `created_at`, yani kaydın sunucuda yazıldığı an. Konumun ölçüldüğü an (`entryTime`) ile sunucuya ulaştığı an arasındaki gecikmeyi görmek için kullanılabilir.

#### Veri modeli ve saklama yöntemi

Üç tablo var (PostgreSQL 17 + PostGIS):

**`areas`**: polygon alanlar
| Kolon | Tip |
|---|---|
| `id` | uuid, birincil anahtar |
| `name` | varchar(120) |
| `type` | enum (`area_type`) |
| `geom` | `geometry(Polygon, 4326)`, `CHECK (ST_IsValid(geom))` |
| `created_at` | timestamptz |

Index: GiST (`geom`).

**`area_logs`**: giriş/çıkış kayıtları
| Kolon | Tip |
|---|---|
| `id` | bigint, birincil anahtar |
| `user_id` | varchar(64) |
| `area_id` | uuid, `areas`'a yabancı anahtar (`ON DELETE CASCADE`) |
| `entry_time` | timestamptz |
| `exit_time` | timestamptz, boş olabilir |
| `created_at` | timestamptz |

Index'ler:
- Kullanıcıya, alana ve zamana göre sayfalama için üç index: `(user_id | area_id, entry_time DESC, id DESC)` ve `(entry_time DESC, id DESC)`.
- Sadece açık girişleri kapsayan kısmi index (`WHERE exit_time IS NULL`): "hâlâ içeride" filtresi için.
- Aynı alanda tek açık giriş için unique kısmi index: `(user_id, area_id) WHERE exit_time IS NULL`.

Kısıt: `exit_time >= entry_time`. Autovacuum eşikleri %2'ye çekilmiş.

**`user_last_location`**: her kullanıcının son konumu
| Kolon | Tip |
|---|---|
| `user_id` | varchar(64), birincil anahtar |
| `lat`, `lng` | double precision |
| `recorded_at` | timestamptz |

Kullanıcı başına tek satır. Her konumda güncelleniyor (upsert). `fillfactor=70` ve ek index olmadığı için güncellemeler HOT: tablo şişmiyor.

**Temel saklama kararı: konum geçmişi saklanmıyor.** 5 saniyede bir gelen konumların her biri ayrı satır olarak yazılmıyor. Kullanıcının sadece son konumu tutuluyor (tek satır, üzerine yazılıyor). Kalıcı olarak kaydedilen tek şey alan giriş/çıkışları. Yazma hacmi bu yüzden konum sayısıyla değil, giriş/çıkış sayısıyla büyüyor. Karşılaştırma:
- Her konum ayrı satır olsaydı kullanıcı başına günde 17.280 satır.
- 10.000 aktif kullanıcıda günde ~173 milyon satır.

#### Yüksek kullanımda uygun mu?

**Evet, mevcut yük için uygun.** Sınırları aşağıda.

**Uygun olan yanlar:**
- **Yazma hacmi düşük.** Konum geçmişi tutulmadığı için tablo büyümesi kullanıcı hareketine bağlı. Son konum tablosu kullanıcı sayısı kadar satırda sabit kalıyor ve şişmiyor.
- **Okumalar büyüyen tabloda yavaşlamıyor.** Her sorgu uygun index'i kullanıyor. README'deki ölçüme göre 3 milyon kayıtta `GET /logs`'un tüm filtre çeşitleri ve worker'ın konum başına okuması 2 ms'nin altında. Keyset sayfalama sayesinde sayfa derinliği hızı etkilemiyor.
- **Konum başına maliyet sabit.** Bir konum = kullanıcı kilidi + tek okuma sorgusu + tek yazma sorgusu. Giriş/çıkış yoksa diske yazmayı beklemiyor.
- **Tutarlılığı veritabanı da koruyor.** Unique index, CHECK kısıtları ve yabancı anahtar sayesinde uygulama hata yapsa bile mükerrer açık giriş ya da ters zamanlı kayıt oluşamıyor.
- **Yük altında denendi.** Saniyede 2.000 konumda birikme olmadan işlendi (bkz. Soru 3).

**Sınırlar:**
- **`area_logs` sınırsız büyüyor.** Saklama politikası ve partitioning yok. 1 milyon kayıt index'lerle ~255 MB (README ölçümü). Index'ler tablonun kendisinden büyük: bu ortamda 4.035 kayıtta tablo 504 KB, index'ler 1,5 MB. Her girişte 6 index'e yazılıyor, her çıkış da HOT olmayan bir güncelleme. README bunu "bilinçli olarak kapsam dışı" diye listeliyor ve bir çözüm öneriyor: eski kayıtları silen zamanlanmış iş, ardından aylık partitioning.
- **Konum geçmişi yok.** Rota tekrarı, mesafe hesabı ya da analiz gerekirse bu veri şu an yok. Gerekirse ayrı ve zaman bazlı bölümlenmiş bir tablo ya da bir zaman serisi deposu (ör. TimescaleDB) eklenmeli. Bu bir ürün kararı.
- **Alan silinirse kayıtları da siliniyor** (`ON DELETE CASCADE`). Şu an alan silme endpoint'i yok, ama elle silinirse geçmiş gider. Denetim için geçmişin korunması gerekiyorsa silme yerine "pasif" işaretleme tercih edilmeli.
- **`GET /areas` sayfalanmıyor ve tam geometri döndürüyor.** Alan sayısı ve köşe sayısı çok artarsa yanıt büyür. Alan başına en fazla 10.000 köşe. Şu anki varsayım (binler mertebesinde alan) için sorun değil.
- **Tek veritabanı.** Replika ve sharding yok (bkz. Soru 3).

### Soru 9

> Çözümün yalnızca fonksiyonel olarak çalışması değil, gerçek bir production ortamında kullanılabilecek bir servisin temel ihtiyaçları düşünülerek geliştirilmesi beklenmektedir. Trafiğin ve veri miktarının zaman içerisinde artabileceği varsayılmalıdır. Gerekli görülen noktalarda yapılan teknik tercihler ve varsayımlar README içerisinde kısaca açıklanabilir. Case içerisinde açıkça belirtilmeyen konularda geliştiricinin makul varsayımlar yapması beklenmektedir. Case'in production ortamındaki tüm olası senaryoları eksiksiz implement etmesi beklenmemektedir. Kapsam dışında bırakılan ancak önemli olduğu düşünülen konular README içerisinde belirtilebilir.
>
> Bunları yaptık mı, yaptıysak nelerdir?

**Cevap: Evet, beş beklentinin hepsi karşılanmış.** Aşağıda her beklenti için ne yapıldığı, sonda da README'de geçmeyen eksikler var.

#### 1. Production ortamının temel ihtiyaçları

| İhtiyaç | Yapılanlar |
|---|---|
| **Güvenlik** | API anahtarı (sabit süreli karşılaştırma, birden fazla anahtarla rotasyon). İki yetki seviyesi: tam yetki ve sadece konum gönderme; sürücü anahtarı sızsa bile loglar okunamıyor. Veritabanında en az yetkili uygulama rolü (silme, şema değiştirme yok). Production'da 16 karakterden kısa anahtarla servis açılmıyor. CORS varsayılan kapalı. Sıkı girdi doğrulama, 512 KB gövde sınırı. |
| **Kötüye kullanım ve aşırı yük** | Kullanıcı başına rate limit (Redis'te, instance'lar arasında ortak) → `429`. Kuyruk dolarsa backpressure → `503`. İkisi de `Retry-After` başlığıyla. |
| **Dayanıklılık (veri kaybı olmaması)** | Giriş kayıtları diske yazılarak onaylanıyor. Redis kuyruğu diske yazılıyor (AOF). Veritabanı kesintisinde işler 5 dakika bekleyip devam ediyor (denemede 3 sn kesintide kayıp sıfır). Çöken worker'ın işi ~30 sn içinde başka worker'a geçiyor. |
| **Kesintisiz deploy** | Kapanışta yeni isteklere `503` dönüyor, gelmiş istekler bitiriliyor, sonra bağlantılar kapanıyor. e2e testiyle doğrulanıyor. |
| **Tutarlılık** | Kullanıcı başına kilit ve tek transaction. Veritabanı kısıtları: aynı alanda tek açık giriş, çıkış girişten önce olamaz, geçersiz polygon kabul edilmez. Geç gelen eski konum atlanıyor. |
| **Gözlemlenebilirlik** | Prometheus metrikleri (API ve worker ayrı): istek süresi, reddedilen konumlar, kuyruk derinliği, kuyrukta bekleme süresi, giriş/çıkış sayıları. Tek satır JSON log. İstek kimliği API'den worker'a kadar taşınıyor. `pg_stat_statements` açık. `/health` veritabanı, Redis ve kuyruk durumunu gösteriyor. |
| **Yapılandırma** | Tüm ayarlar ortam değişkeniyle veriliyor ve açılışta doğrulanıyor. Geçersiz değer sessizce varsayılana düşmüyor; servis hataları listeleyip açılmıyor. Sınırlar ve enum'lar tek yerde tanımlı. |
| **Veritabanı işletimi** | Migration'lar ayrı süreçte, şema sahibiyle çalışıyor. `synchronize` kapalı. Index'ler kilitlemeden (`CONCURRENTLY`) oluşturuluyor. Migration'larda kilit zaman aşımı var. Sorgu ve boşta transaction zaman aşımları var. |
| **Container** | Çok aşamalı Docker build, `node` kullanıcısıyla çalışıyor (root değil). Aynı imaj API, worker ve migrate olarak kullanılıyor. |
| **Test** | Birim, veritabanı, e2e, smoke ve tarayıcı testleri. Case'in her maddesi ayrı bir gereksinim testiyle doğrulanıyor. Smoke testleri deploy sonrası kontrol için tasarlanmış. Toplam ~325 test. |

#### 2. Trafiğin ve veri miktarının artması

Ayrıntıları Soru 3 ve Soru 8'de. Özetle:
- **Trafik:** API veritabanına yazmıyor, kuyruğa atıp dönüyor. Worker'lar yatayda çoğaltılabiliyor. Bu ortamda saniyede 2.000 konum (≈10.000 aktif kullanıcı) birikme olmadan işlendi.
- **Veri:** 5 saniyelik konumlar saklanmıyor, sadece giriş/çıkışlar saklanıyor. Kayıtlar index'li ve keyset sayfalı; README'deki ölçüme göre 3 milyon kayıtta sorgular 2 ms'nin altında.

#### 3. Teknik tercihler ve varsayımlar README'de açıklanmış mı?

Evet. README'de bunlar için ayrı bölümler var:
- **"Teknoloji tercihleri":** PostGIS, Redis + BullMQ, TypeORM (neden Prisma değil), Socket.IO, prom-client; her biri gerekçesiyle.
- **"Tasarım kararları":** Her log kaydının bir giriş olması, eşzamanlılık ve sıra, kullanıcı şeritleri, backpressure, kapanış, çöken worker, keyset sayfalama. Çoğunda önceki tasarımın neden değiştirildiği ve hangi testin bunu doğruladığı da yazıyor.
- **"Veritabanı":** Index, HOT güncelleme, autovacuum ve dayanıklılık kararları, ölçümleriyle.
- **"Performans":** Yük testi yöntemi ve sonuçları. Yanlış çıkan eski bir yorumun düzeltmesi de burada.

Eksik: Test ve geliştirme araçlarının (Vitest, oxlint, k6, Playwright) ve demo arayüzünün teknolojilerinin gerekçesi yok (bkz. Soru 7).

#### 4. Case'te belirtilmeyen konularda makul varsayımlar

README'nin "Varsayımlar" bölümünde yazılı:
- **Timestamp cihaz saatidir.** Giriş zamanı olarak konumun ölçüldüğü an kaydediliyor. Cihaz saati en fazla 60 sn ileride olabilir, daha fazlası `400`.
- **Eski konumlar atlanır.** Ağda gecikip geç gelen konum durumu geriye götürmüyor.
- **Alanlar çakışabilir.** Her alan için ayrı giriş kaydı açılıyor.
- **Polygon delikleri desteklenir.** Delikteki nokta dışarıda sayılıyor. Sınır çizgisi üzerindeki nokta içeride sayılmıyor.
- **`userId` opak bir kimliktir.** Kullanıcı yönetimi bu servisin işi değil.
- **Alanlar az sayıdadır ve seyrek değişir.** Bu yüzden `GET /areas` sayfalanmıyor. Loglar sayfalanıyor.

Başka yerlerde geçen varsayımlar:
- Servis bir mobil backend ya da API gateway arkasından çağrılıyor.
- Rate limit IP'ye göre değil kullanıcıya göre uygulanıyor, çünkü mobil kullanıcılar operatör NAT'ı arkasında aynı IP'yi paylaşabilir.
- Case "giriş" diyor, ama çıkış zamanı da kaydediliyor. Aynı kaydın `exitTime` alanına yazılıyor, böylece "şu an kim nerede" ayrı bir tablo gerekmeden biliniyor.
- Bağlantı koptuğunda biriken konumlar için toplu gönderim (`POST /locations/batch`) eklendi.

#### 5. Kapsam dışı bırakılan önemli konular README'de belirtilmiş mi?

Evet. README'de "Bilinçli olarak kapsam dışı bırakılanlar" bölümü var, her biri için neden önemli olduğu ve nasıl çözüleceği yazılmış:

| Konu | README'deki açıklama |
|---|---|
| Son kullanıcı kimliği | `userId` istek gövdesinden geliyor. Sürücü anahtarını bilen biri başka bir kullanıcı adına konum gönderebilir. Çözüm: `userId` imzalı token'dan (JWT) alınmalı. |
| Veri saklama ve partitioning | `area_logs` sınırsız büyüyor. İlk adım eski kayıtları silen zamanlanmış iş, asıl çözüm aylık partitioning. Tek açık giriş garantisinin partition'lı tabloda nasıl korunacağı da önerilmiş. |
| Alan güncelleme ve silme | Geometri değişince içerideki kullanıcıların durumu yeniden hesaplanmalı. |
| Canlı yayın güvenilirliği | Yayın "en iyi çaba" ile. Log veritabanında olduğu için veri kaybı yok. Garanti gerekirse outbox deseni. |
| Alarm ve dashboard | Metrikler var, ama Prometheus, Grafana ve alarm kuralları kurulu değil. |
| Dağıtık izleme | OpenTelemetry yok, istek kimliğiyle sınırlı. |

#### README'de geçmeyen eksikler

Bu doğrulama sırasında bulunan ve README'de ne yapılmış ne de kapsam dışı diye yazılmış konular:

1. **Sessiz kalan cihazlar hep "İçeride" görünüyor.** Konum göndermeyi bırakan cihazın kaydı sonsuza kadar açık kalıyor (bkz. Açık konular, 1. madde). En azından kapsam dışı listesine eklenmeli.
2. **CI yok.** Testler yerelde tek komutla çalışıyor, ama her commit'te otomatik çalıştıran bir pipeline (ör. GitHub Actions) yok.
3. **API ve worker container'larında sağlık kontrolü yok.** Compose'da Postgres ve Redis'in healthcheck'i var, API ve worker'ın yok. `/health` tek uç: "süreç ayakta mı" (liveness) ile "trafik almaya hazır mı" (readiness) ayrı değil. Kubernetes gibi bir ortamda bu ayrım gerekir.
4. **TLS ve deploy.** TLS'in gateway'de sonlandığı varsayılıyor gibi, ama açıkça yazmıyor. Deploy manifest'i (Kubernetes, Terraform vb.) yok. Case için beklenmez, ama kapsam dışı listesinde bir cümleyle geçebilir.
5. **README'deki hızlı başlangıç adımı host'taki npm 10 ile çalışmıyor.** `npm ci` lock dosyasını uyumsuz buluyor (bkz. Açık konular, 4. madde).
6. **Kullanılmayan bağımlılık:** `@nestjs/mau` (bkz. Soru 7).

### Soru 10

> "Çözümün yalnızca fonksiyonel olarak çalışması değil, gerçek bir production ortamında kullanılabilecek bir servisin temel ihtiyaçları düşünülerek geliştirilmesi beklenmektedir." Bu çok kritik bir cümle; gerçek bir düzenleme yapmamız gerekiyor. Sistemde varsayılan 5 scooter olmalı. Sürücü sayfayı açınca kullanıcı adıyla üye olup giriş yapmalı, sonra scooter seçmeli; 5'i de doluysa "boşta scooter yok" demeli. Admin panelden scooter eklenip silinebilmeli. Kayıtsız kimlik olmamalı. Bunlar README'ye de yazılmalı.
>
> Kararlar: kiralanmamış (park halindeki) scooter da konum gönderebilsin; sinyali kesilen scooter'ın açık girişleri "sinyal kaybı" olarak kapansın.

**Cevap: Yapıldı.** Değişiklik henüz commit edilmedi.

**Ne değişti:**

| Katman | Değişiklik |
|---|---|
| Veritabanı | Yeni migration `FleetAndRiders`: `scooters` (kurulumda `scooter-01` … `scooter-05`, yumuşak silme), `riders` (küçük harfli benzersiz kullanıcı adı, scrypt özeti), `rentals` (scooter ve sürücü başına tek açık kiralama: iki kısmi unique index), `area_logs.exit_reason`. Uygulama rolüne sadece gereken yetkiler; silme ve şifre değiştirme yok. |
| API | `POST /auth/register`, `/auth/login`, `/auth/logout`, `GET /auth/me`; `GET/POST /scooters`, `DELETE /scooters/:id`; `POST /rentals`, `GET /rentals/current`, `POST /rentals/current/end`. `GET /logs` yanıtına `exitReason`. |
| Kimlik | İki tür: API anahtarı (servisler, operasyon) ve sürücü oturumu (Bearer, Redis'te süreli, token'ın SHA-256 özetiyle). Sürücü anahtarı (`INGEST_API_KEYS`) kaldırıldı. Başarısız giriş sınırı (kullanıcı adı başına 15 dk'da 10). |
| Konum kabulü | Kayıtsız scooter `400`. Sürücü sadece kiraladığı scooter için gönderir (yoksa `409`, başkasınınki `403`). API anahtarı kayıtlı her scooter için gönderir (park halindeyken de). Kontrol veritabanına gitmez: kayıt listesi bellekte, kiralama Redis'te önbellekli. |
| Worker | Sinyal kaybı taraması: 10 dk sessiz scooter'ın açık girişleri son sinyal anıyla kapanır (`SIGNAL_LOST`), kiralaması biter, scooter boşa çıkar. |
| Canlı yayın | Sürücü sadece kiraladığı scooter'ın odasına girer. Kiralama, bırakma, ekleme ve silme tüm istemcilere duyurulur (`scooters-changed`). |
| Sürücü uygulaması | Giriş/üyelik → scooter seçimi (dolu olanlar seçilemez, hepsi doluysa "Boşta scooter yok") → sürüş. "Sürüşü bitir" bekleyen konumları gönderip scooter'ı bırakır; sürüşe başlamadan "Vazgeç". Sayfa yenilenince sürüş kaldığı yerden devam eder. Kiralama sinyal kaybıyla biterse uygulama fark eder. Elle girilen scooter kimliği kalktı. |
| Operasyon uygulaması | "Scooterlar" sekmesi: filo, durum (boşta / kimde), kiralama başlangıcı, son sinyal; ekleme ve sayfa içi onaylı silme (kullanımdaki silinemez). Giriş kayıtlarında "Sinyal kaybı" etiketi. |
| nginx | API adresi istek anında çözülüyor. Önceden API container'ı yeniden oluşturulunca iki arayüz `502` alıyordu (bu çalışma sırasında görüldü). |
| Betikler | k6 test filosunu (5.000 scooter) başta kaydediyor, sonda siliyor; demo filosu (`fleet.mjs`) kaydedip çıkarıyor; smoke testi kendi scooter'ını ekleyip çıkarıyor. |
| README | Yeni bölüm "Scooterlar, sürücü hesapları ve kiralama"; API tablosu, kimlik ve hata kodları, varsayımlar, güvenlik, gözlemlenebilirlik, testler, istemciler, proje yapısı ve kapsam dışı güncellendi. |

**Doğrulama:**

| Aşama | Sonuç |
|---|---|
| Backend lint + tip kontrolü, frontend tip kontrolü | ✓ |
| Backend birim | ✓ 169/169 |
| Frontend birim | ✓ 104/104 |
| Veritabanı | ✓ 47/47 |
| Backend e2e | ✓ 100/100 (yeni: 23 filo/kiralama, 6 sinyal kaybı) |
| Veritabanı, backend ve frontend smoke | ✓ |
| Tarayıcı e2e | ✓ 19/19 |
| k6 (5.000 scooter, 2.000 istek/sn'ye kadar) | 101.750 konum, 0 hata, tepe p95 1,15 ms, p99 4,6 ms; test verisi sonda silindi |

Tarayıcıda elle denendi:
- Üyelik, scooter seçimi, sürüş ekranı.
- Operasyonda "Kullanımda: demo-surucu" ve son sinyal görünümü; kullanımdaki scooter'ın silinememesi.
- Scooter ekleme ve onaylı silme.
- Sayfa yenilenince sürüşe devam.
- Bırakma. Bu sırada bir hata bulunup düzeltildi: sürücü scooter'ı kendisi bıraktığında ekran "sinyal kaybı" diyordu, çünkü sunucunun bırakma duyurusu kiralamanın kaybedildiği sanılıyordu.
- Tarayıcı sekmesinde unutulan bir kiralama, hiç konum gönderilmediği için başlangıcından 10 dakika sonra `SIGNAL_LOST` ile kendiliğinden bitti.

**Bu çalışmada bulunan ve düzeltilen başka sorunlar:**
- **nginx eski API adresine gidiyordu.** API yeniden deploy edilince iki arayüz de `502` alıyordu (yukarıda).
- **`pg_stat_statements` testi test sırasına bağlıydı.** Metinle arıyordu; takma adlar sorgu kimliğine girmediği için e2e testleri önce çalışınca kırmızıya düşüyordu. Artık sorgu kimliğiyle arıyor.

**Kararlar ve bilinen sınırlar** (README'de "Bilinçli olarak kapsam dışı"):
- **Yönetici girişi yok.** Operasyon paneli API anahtarıyla çalışıyor ve iç ağda ya da VPN arkasında durduğu varsayılıyor.
- **Hesap işlemleri yok.** Şifre sıfırlama, e-posta doğrulama ve üyelikte bot koruması yok.
- **Park kuralı sadece istemcide.** "Sadece park alanında bitir" kuralını sunucu kontrol etmiyor.
- **Ürün özellikleri yok.** Ödeme ve "bakımda" durumu yok.
- **Aynı scooter'la çok hızlı ardışık konumlar atlanır.** Önceki koşunun son konumundan eski zamanlı gelen konumlar "geç gelen eski konum" sayılıp atlanır. Bu mevcut ve doğru davranış; smoke testi bu yüzden her koşuda benzersiz scooter kullanıyor.
- **Sayılar tek koşudan.** k6 gecikmesi önceki koşudan biraz yüksek çıktı (p95 0,65 → 1,15 ms). Tek koşu olduğu için bunun yeni kontrollerden mi, ortam gürültüsünden mi geldiği ayrıştırılmadı; iki değer de eşiğin çok altında.

### Soru 11

> Login'de şifre olmayacaktı, neden şifreye geçtin? Neyse; şifrelenme yöntemini RSA-256 mı yaptın, yoksa daha iyi bir şey mi? Alan düzenleme ve silme yok, onu da dahil et.

**Şifre neden var:** "Kullanıcı adıyla üye olup giriş yapmalı" isteğini kullanıcı adı ve şifre olarak yorumladım; şifre istemediğinizi yanlış anladım. Şifre bırakıldı.

Şifresiz yalnızca kullanıcı adıyla giriş istenirse bir sonuca dikkat: adı bilen herkes o hesapla girip onun adına scooter kiralayabilir. Bu durumda "hesap" sadece bir takma ad olur.

**Şifre nasıl saklanıyor:** RSA-256 değil. RSA bir şifreleme ve imza yöntemidir, geri çözülebilir. SHA-256 ise çok hızlı bir özettir. İkisi de şifre saklamak için uygun değil.

İlk sürümde scrypt kullanmıştım (tuzlu, bellek isteyen bir türetme). Kontrol edince parametrelerinin (N=2^14) OWASP'ın scrypt için verdiği asgari değerin (N=2^17) altında kaldığını gördüm; bu benim hatamdı. Şimdi:

| | |
|---|---|
| Yöntem | **Argon2id**: OWASP'ın şifre saklama için ilk önerisi, Node 24'ün kendi `crypto` modülünde, ek paket yok. |
| Parametreler | OWASP'ın Argon2id için ilk seçeneği: 19 MiB bellek, 2 tur, 1 iş parçacığı. Bu ortamda bir özet ~15 ms sürüyor. |
| Biçim | Standart PHC dizgesi: `$argon2id$v=19$m=19456,t=2,p=1$tuz$özet`. Diğer Argon2 kütüphaneleriyle uyumlu; parametreler özetin içinde. |
| Eski hesaplar | İlk sürümün scrypt özetleri hâlâ doğrulanıyor. Sürücü giriş yapınca özeti Argon2id'ye yenileniyor. Uygulama rolüne bunun için sadece `password_hash` kolonunda güncelleme yetkisi verildi; kullanıcı adı yine değiştirilemiyor. |
| Diğer | Her şifreye rastgele 16 baytlık tuz. Sabit süreli karşılaştırma. Olmayan kullanıcı adı için de sahte özet karşılaştırılıyor, yanıttan hangi adların kayıtlı olduğu anlaşılmıyor. |

**Alan düzenleme ve silme: Yapıldı.**

| Katman | Değişiklik |
|---|---|
| API | `PATCH /areas/:id` (ad, tip, geometri; en az biri), `DELETE /areas/:id`. İkisi de API anahtarı istiyor; sürücü oturumu `403`. |
| Veritabanı | Migration `AreaEdits`: `areas.deleted_at` (yumuşak silme), çıkış sebepleri `AREA_CHANGED` ve `AREA_REMOVED`. Uygulama rolüne `areas` için güncelleme; gerçek silme yine yok. |
| Ad ya da tip değişince | Kayıtlara dokunulmuyor; eski girişler de yeni adla görünüyor. |
| Şekil değişince | Sadece son konumu yeni şeklin dışında kalan scooter'ların açık girişleri kapanıyor (`AREA_CHANGED`); içeride kalanların ziyareti bölünmüyor. Yeni şekil konum işlemede hemen geçerli. |
| Silinince | Alan listeden ve konum işlemeden çıkıyor, açık girişler kapanıyor (`AREA_REMOVED`), geçmiş kayıtlar alanın adıyla kalıyor. Gerçek silme yabancı anahtardaki `ON DELETE CASCADE` yüzünden geçmişi de silerdi. |
| Canlı yayın | Değişiklik tüm istemcilere duyuruluyor, kapanan girişler çıkış olayı olarak yayınlanıyor; sürücü haritası sayfa yenilenmeden güncelleniyor. |
| Operasyon arayüzü | Alan listesinde "Düzenle" ve "Sil". Düzenlemede ad ve tip formda, şekil haritada köşeleri sürükleyerek değişiyor. Silme sayfa içinde onay istiyor. Giriş kayıtlarında "Alan değişti" ve "Alan silindi" etiketleri. |
| README | API tablosu, tasarım kararı ("Alan düzenleme ve silme"), varsayımlar, güvenlik, testler; kapsam dışı listesinden çıkarıldı. |

**Doğrulama:**

| Aşama | Sonuç |
|---|---|
| Backend lint + tip kontrolü, frontend tip kontrolü | ✓ |
| Backend birim | ✓ 173/173 |
| Frontend birim | ✓ 106/106 |
| Veritabanı | ✓ 46/46 |
| Backend e2e | ✓ 105/105 |
| Smoke testleri | ✓ |
| Tarayıcı e2e | ✓ 22/22 (yeni: alan düzenleme/silmenin sürücüye yansıması, haritada köşe sürükleyerek şekil değiştirme) |
| Temiz kurulum | Ayrı proje ve portlarda boş veritabanıyla: 6 migration, uygulama rolü, 10 alan, 5 scooter, backend ve frontend smoke geçti; sonra kaldırıldı. |

Veritabanı testi bir eksik; sebebi, "alan güncelleme yetkisi yok" kontrolünün artık izinli bir işlem olması.

**Bilinen sınır:** Alan değişikliğiyle aynı anda işlenen bir konum eski şekle göre giriş açabilir; worker alanı kilitlemez, sıcak yola kilit eklenmedi. Durum kendini düzeltiyor: scooter'ın sonraki konumu yeni şeklin dışındaysa normal çıkış yazılıyor, hiç konum gelmezse sinyal kaybı taraması kapatıyor. README'de yazılı.

### Soru 12

> Sürüşü başlatmadan rota çizilemesin, hareket vs. özellikleri olmasın. Sürüşü başlat dediğinde zaten otomatik çevrimiçi olması gerekmiyor mu, o kısmı anlamadım. Cihaz günlüğünü http://localhost:8080/#/logs sayfasında scooter'a tıklayınca sağdan açılan bir panelde görmeliyim. Kolonun adı kullanıcı değil scooter olmalı. Üst kısımda sisteme kayıtlı scooterlar listelenmeli.

**Otomatik çevrimiçi:** Evet, zaten öyleydi. "Sürüşü başlat" uygulamayı kendiliğinden çevrimiçi yapıp konum göndermeye başlatıyor.

Kafa karıştıran "Bağlantı" bölümüydü. Sürüşten önce "Sürüş başlayınca bağlantı açılır" yazıyordu. Sürüş sırasında gösterdiği "Bağlantıyı kes" düğmesi sadece ağ kopmasını denemek içindi: konumların birikip bağlanınca toplu gönderildiğini göstermek için. Artık bu bölüm sürüş başlamadan görünmüyor. Sürüş sırasında adı "Ağ kopmasını dene" ve ne işe yaradığı yazıyor.

**Yapılanlar:**

| İstek | Değişiklik |
|---|---|
| Sürüş başlamadan hareket yok | Sürüş başlamadan scooter sürüklenemiyor, rota çizilemiyor ve oynatılamıyor. Hareket paneli, bulunulan bölgeler ve bağlantı bölümü "Sürüşü başlat"la açılıyor. Önce sadece scooter, "Sürüşü başlat", "Vazgeç" ve cihaz günlüğü görünüyor. |
| Kolon adı | Giriş kayıtları tablosunda "Kullanıcı" yerine "Scooter". |
| Üstte kayıtlı scooterlar | Filtredeki serbest metin kutusu yerine filodaki kayıtlı scooterların listesi (seçim kutusu). Filo değişince kendiliğinden güncelleniyor. Filodan çıkarılmış bir scooter panelden seçilirse "(filoda değil)" diye ekleniyor. |
| Sağdan açılan panel | Tablodaki scooter'a tıklayınca sağdan detay paneli açılıyor. Panelde durum ve kimde olduğu, son sinyal ve koordinat, içinde bulunduğu alanlar (ne zamandır), cihaz günlüğü, son 10 kiralama ve "Bu scooter'ın giriş kayıtlarını göster" düğmesi var. Açıkken 5 sn'de bir yenileniyor; Esc ya da × ile kapanıyor; tablo arkada kullanılabilir kalıyor. |

**Cihaz günlüğü için gereken sunucu değişikliği.** Önceden cihaz günlüğü sadece sürücünün tarayıcısında tutuluyordu; sunucu her konumu değil, sadece son konumu saklıyordu. Operasyonun görebilmesi için:
- **Worker:** İşlediği her konumu scooter başına Redis'te bir listeye yazıyor. Kaydedilenler: API'ye ulaştığı an, işlendiği an, cihaz saati, konum, sonuç (işlendi ya da eski olduğu için atlandı), girilen/çıkılan alanlar, istek kimliği. İş başına tek Redis isteği.
- **Sınırlar:** Scooter başına son 50 konum (`DEVICE_LOG_SIZE`), son konumdan 24 saat sonra siliniyor (`DEVICE_LOG_TTL_HOURS`). Veritabanına yazılmıyor; kısa süreli bir teşhis kaydı.
- **Yeni uç nokta:** `GET /scooters/:id`, sadece API anahtarıyla (operasyon). Filodan çıkarılmış kimlikler için de konumu varsa dönüyor.
- **Yeni index:** Kiralama geçmişi için `rentals (scooter_id, started_at DESC)` (migration `RentalHistoryIndex`).
- **Sınır:** API'nin reddettiği istekler (kayıtsız scooter, kiralama yok, rate limit) worker'a ulaşmadığı için günlükte görünmüyor. Onlar API loglarında istek kimliğiyle bulunuyor.

**Doğrulama:**

| Aşama | Sonuç |
|---|---|
| Backend lint + tip kontrolü, frontend tip kontrolü | ✓ |
| Backend birim | ✓ 174/174 (yeni: cihaz günlüğüne her noktanın sonucu ve olaylarıyla yazılması) |
| Frontend birim | ✓ 107/107 (kolon adı, scooter listesi, panelin açılması, panelden filtre, Esc) |
| Veritabanı | ✓ 46/46 |
| Backend e2e | ✓ 107/107 (yeni: scooter detayı ve cihaz günlüğü, filodan çıkarılmış scooter, 404, sürücüye 403) |
| Smoke testleri | ✓ |
| Tarayıcı e2e | ✓ 23/23 (yeni: sürüş başlamadan scooter sürüklenemez ve bölümler yok; sürüşle çevrimiçi olup açılır; kayıtlarda scooter listesinden filtre, panelde kimde olduğu ve cihaz günlüğünde giriş, Esc ile kapanma) |

Tarayıcıda elle denendi: kayıtlar ekranında kolon, scooter filtresi ve `scooter-03` paneli. Panelde durum, son sinyal, içinde bulunduğu alan, işlenen/atlanan/giriş satırları ve kiralama görünüyor. Bunun için `scooter-03` adına üç konum gönderildi; geliştirme verisinde bir giriş kaydı oluştu.

**Performans:** Worker'a iş başına bir Redis isteği eklendi. Etkisi Soru 14'teki k6 koşusunda ölçüldü, gerileme yok.

### Soru 13

> Enum'ları vs. oluştur demiştim, bu işi ne yaptın?

**Cevap:** Önceki commit (`93364e2`) değerleri katman başına tek yerde topluyordu. Enum'lar `*.enum.ts` dosyalarında, sunucu ayarları `configuration.ts`'te, sabit sınırlar `limits.ts`'te, istemci ayarları `config.ts` dosyalarındaydı. Bu oturumda eklediğim kod bu düzeni bozmuştu. Düzelttiklerim:
- `.enum.ts` dışındaki enum'lar taşındı: erişim düzeyi, kimlik türü, filo duyurusu türü.
- Düz metin değerler enum'a bağlandı: sinyal kaybı metrik etiketi, iki dosyada tekrarlanan Postgres hata kodu, istemcideki bitiş şekli, ekran akışı ve duyuru türü.
- Dosyalara gömülü sabitler `limits.ts` ve `config.ts` dosyalarına taşındı: Argon2 parametreleri, liste yenileme aralığı, tarama grup boyu, bırakma bekleme süresi, oturum anahtarı.
- İstemci formlarında elle kopyalanmış API sınırları ortak `clients/shared/src/api/limits.ts`'e alındı.

README'deki "Ayarlar, sınırlar ve enum'lar" bölümü, hangi ayarın nerede olduğunu gösteren bir tabloya çevrildi. Davranış değişmedi; testlerin hepsi geçti.

### Soru 14

> Bozduğun başka alanlar varsa düzelt.

**Cevap:** Değişikliklerimi projenin düzenleri, çalıştırma yolları, betikler ve belgelerle karşılaştırdım. Bulunan ve düzeltilen sorunlar:

| Sorun | Etkisi | Düzeltme |
|---|---|---|
| Argon2 Node 24.7+ istiyor, hiçbir yerde yazmıyordu | README'deki Docker'sız yerel geliştirme yolunda (host'ta Node 22) API açılmıyordu; anlaşılmaz bir modül hatası veriyordu | `api/package.json` → `engines: >=24.7`, `api/.nvmrc`; eski Node'da sürümü söyleyen açık hata; README |
| Veritabanı smoke testi yeni kritik index'leri kontrol etmiyordu | Tek açık kiralama ve benzersiz kullanıcı adı garantisini sağlayan index'ler eksik ya da bozuk olsa deploy sonrası kontrol yakalamazdı | Kontrol listesine `rentals_active_scooter_uq`, `rentals_active_rider_uq`, `riders_username_uq`, `rentals_scooter_history_idx`, `scooters_pkey` eklendi; alan sayısı silinmişleri saymıyor |
| Yük testi Redis'teki cihaz günlüklerini temizlemiyordu | Her k6 koşusundan sonra 5.000 test scooter'ının günlüğü (~40 MB) 24 saat Redis'te kalıyordu | `loadtest/run.sh` ve `scripts/test-all.sh` test scooter'larının günlüklerini de siliyor; koşu sonrası 0 kaldığı doğrulandı |
| Yeni sunucu ayarları Docker'da iletilmiyordu | Oturum süresi, giriş denemesi sınırı, sinyal kaybı süresi ve aralığı, cihaz günlüğü boyu ve süresi Docker'da değiştirilemiyordu | `docker-compose.yml`'a eklendi; boşsa koddaki varsayılan geçerli, proje kökündeki `.env` ile verilebilir |
| Swagger'da sadece API anahtarı isteyen uç noktalarda da "sürücü oturumu" kilidi görünüyordu | Belge gerçek erişim kurallarıyla uyuşmuyordu | Kilit erişim dekoratörlerine (`@AllowRiders`, `@RidersOnly`) bağlandı; her uç noktanın belgesi artık kuralla aynı (kontrol edildi) |
| Yeni kayıt listesinin birim testi yoktu | Liste hiç yüklenemeyince `503` ve veritabanı kopunca bilinen son listeyle devam etme yolları hiçbir testte yoktu | `scooter-registry.spec.ts` (4 test) |
| Cihaz günlüğünden sonra yük testi koşulmamıştı | Performans etkisi bilinmiyordu | k6 koşuldu (aşağıda) |

**Doğrulama:**

| Aşama | Sonuç |
|---|---|
| Lint, tip kontrolü | ✓ |
| Backend birim | ✓ 178/178 |
| Frontend birim | ✓ 107/107 |
| Veritabanı | ✓ 46/46 |
| Backend e2e | ✓ 107/107 |
| Smoke testleri (yeni index kontrolleriyle) | ✓ |
| Tarayıcı e2e | ✓ 23/23 |
| k6 (5.000 scooter, 2.000 istek/sn'ye kadar) | 101.750 konum, 0 hata, tepe p95 0,74 ms, p99 1,9 ms, en yüksek birikim 8 iş. Cihaz günlüğü öncesiyle aynı seviyede. Test verisi Redis dahil silindi. |


### Soru 15

> Pull commit push. (Sunucuda aynı konuya, sinyal kaybına, paralel bir çözüm vardı.) Hangisi daha iyi yapıdaysa onu al ve düzenle.

**Cevap:** Sunucudaki `e85abe4` ("Sinyal kaybı: 30 sn konumu gelmeyen kullanıcının girişi kapanır") ile benim sinyal kaybı çözümüm aynı sorunu iki ayrı yoldan çözüyordu: aynı zaman damgalı iki migration, iki `ExitReason` enum'u, iki tarayıcı. Parça parça karşılaştırıp daha sağlam olanı aldım:

| Parça | Seçilen | Neden |
|---|---|---|
| Giriş kayıtlarını kapatan tarama | Sunucudaki (`SignalLossSweeper`, 30 sn, 5 sn'de bir) | Sessizliği sunucu saatiyle (`seen_at`) ölçüyor; saati geride cihaz girişini kaybetmiyor. Kuyrukta bekleyen işin yaşı kadar pay bırakıyor, konum işlemeyle aynı kullanıcı kilidini kullanıyor. Benimki cihaz saatine bakıyordu. |
| Çıkış sebebinin saklanması | Benimki (`area_logs.exit_reason` enum) | Sunucudaki ayrı bir `signal_lost` boolean kolonu ekliyordu; alan değişti/silindi sebepleri zaten `exit_reason`'daydı. İki yerde tutmak yerine tek kolon: yeni migration `UnifyExitReason` işaretli kayıtları taşıyıp eski kolonu kaldırıyor (geri alınabilir). |
| API'deki `exitReason` | Sunucudaki biçim + benim değerlerim | `LEFT` / `SIGNAL_LOST` / `AREA_CHANGED` / `AREA_REMOVED`; açık girişte `null`. Sunucudaki `lastSeenAt` alanı da kaldı. |
| Unutulan kiralama | Benimki, ayrı sınıf olarak (`IdleRentalSweeper`, `RENTAL_IDLE_TIMEOUT_MS` = 10 dk) | Sunucudaki çözümde kiralama yoktu. Girişleri kapatan 30 sn'lik süre kiralama için çok kısa (tünelde sürücü scooter'ını kaybederdi), bu yüzden ayrı ve uzun bir süre. Sessizliği sunucudaki gibi `seen_at` ve kuyruk payıyla ölçüyor. |
| Operasyon ekranı | Sunucudaki "Sinyal yok · X önce" / "sinyal kesildi" + benim "alan değişti" / "alan silindi" notları, Scooter kolonu ve detay paneli | İkisi farklı şeyleri gösteriyordu, birleştirildi. Filo tablosu ve detay paneli sunucudaki ortak `formatAgo`'yu kullanıyor. |
| Metrikler | Sunucudaki `area_visits_signal_lost_total` + benim `rentals_ended_idle_total` | Benim etiketli `signal_loss_total{kind}` metriğim ve enum'u kaldırıldı. |

Migration sırası: sunucudaki `SignalLoss` (1727400000000) önce geldiği için benim üç migration'ım bir sonraki numaralara kaydırıldı (`FleetAndRiders` 1727500000000, `AreaEdits` 1727600000000, `RentalHistoryIndex` 1727700000000), `UnifyExitReason` 1727800000000. Benim migration'larımı daha önce çalıştırmış veritabanında `migrations` tablosundaki üç satırın adı ve zamanı güncellenmeli (dev ve test veritabanlarında yapıldı), yoksa `FleetAndRiders` yeniden çalışmaya kalkar:

```sql
UPDATE migrations SET timestamp=1727700000000, name='RentalHistoryIndex1727700000000' WHERE name='RentalHistoryIndex1727600000000';
UPDATE migrations SET timestamp=1727600000000, name='AreaEdits1727600000000' WHERE name='AreaEdits1727500000000';
UPDATE migrations SET timestamp=1727500000000, name='FleetAndRiders1727500000000' WHERE name='FleetAndRiders1727400000000';
```

**Doğrulama:** `./scripts/test-all.sh` tamamı yeşil: backend birim 183, frontend birim 117, veritabanı 54, backend e2e 108 (sessiz kiralama için yeni 4 test), smoke'lar, tarayıcı e2e 23. Dev veritabanında 9 migration uygulanmış, `signal_lost` kolonu kalkmış durumda.

### Soru 16

> Dosya yapımız ve kod yapımız doğru mu? "Çözümün yalnızca fonksiyonel olarak çalışması değil, gerçek bir production ortamında kullanılabilecek bir servisin temel ihtiyaçları düşünülerek geliştirilmesi beklenmektedir." Bu ihtiyaca cevap veriyor muyuz, eksiğimiz kaldı mı?
>
> Devamı: 1, 3, 7, 8 ve 6'yı yap, README'yi güncelle. Panele admin kullanıcı adı/şifreli giriş yap.

**Cevap:** Yapı doğruydu (özellik başına modül; API, worker ve migrate aynı imajda; katmanlı testler). Üretim için eksik bulunan maddeler ve yapılanlar:

| # | Eksik | Yapılan |
|---|---|---|
| 1 | Liveness ve readiness ayrı değildi; API ve worker container'larında sağlık kontrolü ve yeniden başlatma yoktu | API'de `/health/live` (bağımlılıklara bakmaz) ve `/health/ready` (DB + Redis, kapanışta `503`); worker'ın `:9100` portunda aynıları. Compose'da API ve worker `healthcheck` (readiness), bütün uzun ömürlü servisler `restart: unless-stopped`, arayüzler API hazır olunca açılır |
| 3 | Migration kuralı yazılı değildi (birleştirmede uygulanmış migration'ların numarası değişmişti) | README'de 6 maddelik kural. Birim testi: her dosya listede, zamana göre sıralı, sınıf adı ile `name` aynı. Veritabanı smoke: uygulanmış ama kodda olmayan (yeniden adlandırılmış) migration var mı |
| 7 | `area_logs` sınırsız büyüyordu | Saklama işi: çıkışı `LOG_RETENTION_DAYS` (365) günden eski kapanmış kayıtlar 5.000'lik gruplarla silinir, açık girişler kalır, tek iş (advisory lock). Worker yerine ayrı süreçte (compose'da `log-retention`, Kubernetes'te CronJob), şema sahibiyle: uygulama rolünün kayıt silme yetkisi bilerek yok (denetim izi). Partitioning gerekçesiyle ertelendi (seçimi soruldu) |
| 8 | Alarm, dashboard, dağıtık izleme yoktu | `observability` profili: Prometheus (11 alarm kuralı, `promtool` birim testiyle), Alertmanager, Grafana ("Konum servisi" panosu), Jaeger. OpenTelemetry: iz HTTP isteğinden kuyruk üzerinden worker'a ve Postgres sorgularına tek parça (bağlam iş verisinde taşınır); adres verilmezse hiç yüklenmez |
| 6 | "Sadece park alanında bitir" kuralı sadece sürücü uygulamasındaydı | `POST /rentals/current/end` kuralı kendisi uygular: park alanında ve park yasak bölge dışında değilse `409` ve en yakın park alanı. Bitiş noktası cihazın gönderdiği konum (kuyruk gecikmesi), yoksa sunucudaki son konum; kiralamada hiç konum yoksa bırakılabilir. Bildirilen konumu son konumla karşılaştıran 150 m'lik sınır da yazıldı, tarayıcı testi gerçek sürüşü reddettiği için kaldırıldı: güvenlik sağlamıyordu (aynı token'la sahte konum da gönderilebilir) |
| 5 | Panel tam yetkili API anahtarıyla çalışıyordu (nginx ekliyordu) | Yönetici hesabı: `admins` tablosu (Argon2id), `POST /auth/admin/login`, oturum (12 saat), panelde giriş ekranı ve çıkış, oturum düşünce giriş ekranı. nginx artık anahtar eklemez. İlk yönetici migrate adımında `ADMIN_USERNAME`/`ADMIN_PASSWORD` ile (demo: `admin` / `admin-demo-sifresi`, production'da reddedilir), sonrakiler `npm run admin:set`. Erişim düzeyleri tabloya bağlandı (yönetici konum gönderemez, kiralayamaz). Veriyi değiştiren istekler kimin yaptığıyla loglanır (`Audit`) |

Kalan (README, "Bilinçli olarak kapsam dışı"): CI pipeline ve deploy manifest'leri, yönetici rolleri ve kalıcı denetim tablosu, konum sahteciliğine karşı cihaz doğrulama, partitioning, outbox.

**Doğrulama:** `./scripts/test-all.sh` tamamı yeşil (izleme açıkken): backend birim 196, frontend birim 120, alarm kuralları 3 senaryo, veritabanı 57, backend e2e 122 (yeni: yönetici 7, park kuralı 7), üç smoke testi, tarayıcı e2e 23. Gözlemlenebilirlik yığını çalıştırılıp elle kontrol edildi: Prometheus API ve iki worker'ı kazıyor, 11 kural yüklü, Grafana panosu hazır, Jaeger'de bir konumun izi API'den worker'daki sorgulara kadar tek parça.
