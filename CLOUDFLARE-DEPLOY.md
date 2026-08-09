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

- `bank.charge`: Market ödemeleri ve ücretli kullanıcı adı değişimi.

Oyuncuyu eşlemek için kullanılan `phone.identity.token()` ayrıca izin istemez. Kullanıcı adları Kadim Vadi profilinde tutulduğu için `identity.name`, `phone.identity` veya `citizen.identity` açılmamalıdır.

Downtown UCP uygulama detaylarından servis anahtarını al. Anahtarı kaynak koda, GitHub'a veya sohbet mesajına koyma. Cloudflare Dashboard'da **Workers & Pages → kadim-vadi → Settings → Variables and Secrets** bölümünde şu secret'ı oluştur:

- Ad: `DOWNTOWN_SERVICE_KEY`
- Değer: Downtown servis anahtarı

Preview ortamı da kullanılacaksa secret'ı hem Production hem Preview için ekle.

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
- Bulut kaydı 200 KB ile sınırlıdır ve revision kontrolü aynı kaydın iki cihazda sessizce ezilmesini engeller.
- Kullanıcı adı 3-16 karakterdir, benzersizdir ve isim değiştirme isteği ödeme öncesi 10 dakika rezerve edilir.
- Downtown ödeme doğrulama makbuzu sunmadığı için ücretli isim değişiminin sunucu tarafında ödeme kanıtı henüz doğrulanamaz. Downtown işlem kimliği/makbuz doğrulaması sağladığında commit rotasına eklenmelidir.
- Leaderboard şimdilik ödülsüz betadır; oyun ilerlemesi istemci tarafından üretildiği için ödüllü rekabet öncesinde sunucu tarafı savaş doğrulaması gerekir.
