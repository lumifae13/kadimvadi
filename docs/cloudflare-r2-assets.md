# Kadim Vadi R2 asset akışı

Oyun görselleri ve sesleri `kadim-vadi-assets` bucket'ında sürümlü anahtarlarla tutulur. v61 için URL biçimi `/game-assets/v61/<img-dalı-yolu>` şeklindedir. Tarayıcıya R2 anahtarı veya gizli bilgi verilmez; Pages Function dosyaları aynı origin üzerinden okur.

## İlk kurulum

1. Cloudflare hesabında R2'yi etkinleştir.
2. `npx wrangler r2 bucket create kadim-vadi-assets` çalıştır.
3. Güncel `img` dalını getir: `git fetch origin img:refs/remotes/origin/img`.
4. Ön kontrol: `npm run assets:r2:dry-run`.
5. Yükleme: `npm run assets:r2:sync`.
6. `npm run check` sonrasında önce preview deploy et ve asset isteklerini doğrula.

`img` dalı geçiş tamamlanana kadar geri dönüş kaynağı olarak korunur. Asset dosyaları uygulama deposuna veya build paketine kopyalanmaz.

## Yeni asset sürümü

Asset içeriği aynı yollarla değiştirilecekse yeni bir önek kullan (`v62` gibi), yükleme komutuna `--prefix v62` ver ve hem `ASSET_VERSION_PREFIX` hem de `ASSET_URL` değerini aynı sürüme yükselt. Böylece uzun süreli tarayıcı önbelleği eski dosyaları göstermez.
