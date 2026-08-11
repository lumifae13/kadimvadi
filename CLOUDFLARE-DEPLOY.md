# Kadim Vadi · Cloudflare kurulumu

Proje Cloudflare Pages Functions ve D1 kullanır. Oyun dosyaları Pages üzerinden, kimlik doğrulama, bulut kayıt ve leaderboard ise aynı domain altındaki `/api/*` rotalarından sunulur.

## Hazır altyapı

- Pages proje adı: `kadim-vadi`
- D1 veritabanı: `kadim-vadi-db`
- D1 kimliği: `4e30465f-47ae-42c2-b769-499ad92063ec`
- Üretim domaini: `https://kadim-vadi.pages.dev`
- API sağlık kontrolü: `/api/health`
- Oyun sürümü: `v63-alpha`

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

PNG/GIF/JSON assetleri ve telefon için sıkıştırılmış MP3 sesleri aynı Cloudflare Pages origin'inden, `https://kadim-vadi.pages.dev/game-assets/v63/` altında sunulur. Kaynak dosyalar GitHub deposunda tutulur; Netlify, GitHub Raw, jsDelivr veya R2 çalışma zamanında kullanılmaz. Böylece telefon yalnız iki harici origin'e ihtiyaç duyar ve asset sürümü değiştiğinde eski önbelleğe takılmaz.

Normal Pages dağıtımı için `npm run build` kullanılır. Build, telefon seslerini oluşturur ve yalnız yayınlanması gereken `index.html`, `_headers` ve `game-assets` içeriğini `dist` klasörüne alır.

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

Telefon paketini doğrulamak için geçici olarak `https://kadim-vadi.pages.dev/?asset-test=1` Bundle URL'siyle **Telefonumda Dene** kullanılabilir. Başla düğmesinden sonra ekranda `v63-alpha`, görsel, fetch, ses ve SDK sonuçları görünür. Yayındaki uygulamalar başvuru anında arşivlendiği için canlı hostu güncellemek tek başına kurulu uygulamayı yenilemez; yeni sürüm için UCP'den güncelleme başvurusu gerekir.

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
