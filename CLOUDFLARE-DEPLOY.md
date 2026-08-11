# Kadim Vadi · Cloudflare kurulumu

Proje Cloudflare Pages Functions ve D1 kullanır. Oyun dosyaları Pages üzerinden, kimlik doğrulama, bulut kayıt ve leaderboard ise aynı domain altındaki `/api/*` rotalarından sunulur.

## Hazır altyapı

- Pages proje adı: `kadim-vadi`
- D1 veritabanı: `kadim-vadi-db`
- D1 kimliği: `4e30465f-47ae-42c2-b769-499ad92063ec`
- Üretim domaini: `https://kadim-vadi.pages.dev`
- API sağlık kontrolü: `/api/health`
- Oyun sürümü: `v61-alpha`

## Downtown tarafı

Yalnız gerçekten kullanılan uygulama iznini aç:

- `bank.charge`: Market ödemeleri. Ücretli kullanıcı adı değişimi, sunucuda ödeme doğrulaması tamamlanana kadar kapalıdır.

Oyuncuyu eşlemek için kullanılan `phone.identity.token()` ayrıca izin istemez. Kullanıcı adları Kadim Vadi profilinde tutulduğu için `identity.name`, `phone.identity` veya `citizen.identity` açılmamalıdır.

Downtown UCP uygulama detaylarından servis anahtarını al. Anahtarı kaynak koda, GitHub'a veya sohbet mesajına koyma. Cloudflare Dashboard'da **Workers & Pages → kadim-vadi → Settings → Variables and Secrets** bölümünde şu secret'ı oluştur:

- Ad: `DOWNTOWN_SERVICE_KEY`
- Değer: Downtown servis anahtarı

Preview ortamı da kullanılacaksa secret'ı hem Production hem Preview için ekle.

## Harici API domainleri

Downtown uygulama kaydında aşağıdaki origin'leri harici API domainleri listesine ekle:

- `https://phone-gw.downtownrpg.com` — Downtown SDK ve kimlik doğrulaması.
- `https://kadim-vadi.pages.dev` — telefon paketinden yapılan D1/API çağrıları.

Gerçek oyun telefonu dış asset isteklerini güvenilir biçimde göstermediği için PNG/GIF/JSON assetleri ile telefon için 48 kbps MP3'e sıkıştırılmış bütün kullanılan sesler UCP paketine dahil edilir. `kadim-vadi.pages.dev` yalnız bulut kayıt ve leaderboard API'si için gereklidir. GitHub, jsDelivr veya R2 için ek domain izni gerekmez.

UCP'ye yüklenecek paketi üretmek için `npm run build:ucp` çalıştır. `ucp-package` klasörünün **içeriğini** ZIP'le; `index.html` ZIP kökünde olmalıdır. Derleme 8 MB sınırını aşarsa hata verir. Normal Pages dağıtımı için `npm run build` kullanılmaya devam eder.

## D1 migration

Yerel test:

```bash
npm run db:migrate:local
```

Üretim veritabanı:

```bash
npm run db:migrate:remote
```

## Kontrol ve yayın

```bash
npm install
npm run check
npm run cf:deploy:preview
```

Preview doğrulandıktan sonra:

```bash
npm run cf:deploy
```

GitHub bağlantılı Pages kurulumu kullanılacaksa build komutu `npm run check`, çıktı klasörü `dist` olmalıdır. D1 binding adı `DB` olarak kalmalıdır. Kaynak kod, migration ve test dosyaları `dist` dışında tutulduğu için web üzerinden yayınlanmaz.

## Güvenlik notları

- Downtown kimlik token'ı sunucuda doğrulanır; D1'e açık `characterId` ile doğrudan yazılamaz.
- Yalnız Downtown telefonunda doğrulanmış oturumlar profil, bulut kayıt ve leaderboard uçlarına erişebilir. Normal tarayıcı oyunu yalnız `localStorage` üzerinde çalışır; D1'e oyuncu yazmaz, sıralamayı okuyamaz ve sıralamaya girmez.
- Uygulama oturum token'ları D1'de yalnız SHA-256 özetiyle ve en fazla 15 dakika tutulur.
- Bulut kaydı 200 KB ile sınırlıdır ve revision kontrolü aynı kaydın iki cihazda sessizce ezilmesini engeller. Çakışmada oyuncu Ayarlar'dan bulut kaydını veya bu cihazdaki kaydı açıkça seçer.
- Kullanıcı adı 3-16 karakterdir, benzersizdir ve hesap başına yalnızca bir kez seçilebilir; oluşturma ekranında boş bırakılırsa Market profilinden daha sonra ücretsiz seçilebilir.
- Vadi Sıralaması haftalık dönemler halinde tutulur ve D1 tarafından UTC gün başına en fazla bir kez snapshot olarak yenilenir.
- Satın alınan kozmetik kimlikleri oyun kaydından ayrı `player_cosmetics` tablosunda hesaba bağlı tutulur.
- Telefon içi `bank.charge` sunucuda doğrulanabilir makbuz sunmadığı için ücretli isim değişimi hem arayüzde hem API'de kapalıdır. Downtown OAuth ödeme istemcisi ve imzalı callback yapılandırıldığında yeniden açılmalıdır; yalnız istemci başarısına güvenilmemelidir.
- Her Downtown karakteri için en fazla beş etkin uygulama oturumu tutulur; böylece telefon/cihaz geçişi çalışırken oturum tablosu sınırsız büyümez.
- Leaderboard şimdilik ödülsüz betadır; oyun ilerlemesi istemci tarafından üretildiği için ödüllü rekabet öncesinde sunucu tarafı savaş doğrulaması gerekir.
