# OSNIT APEX WEB — VDS'siz gerçek sürüm

Bu paket, OSNIT APEX'in VDS/VPS gerektirmeyen üretim mimarisidir.

## Mimari

- **Frontend:** HTML/CSS/JS + Leaflet
- **Hosting:** Cloudflare Pages
- **Serverless API:** Cloudflare Pages Functions
- **Veritabanı:** Cloudflare D1
- **Kimlik doğrulama:** Pages Functions + HttpOnly/Secure session cookie + PBKDF2-SHA-256
- **Canlı açık veri:** GDELT, CoinGecko, USGS Earthquakes, NASA EONET
- **DNS:** Google DNS-over-HTTPS üzerinden serverless proxy
- **IPv4 bilgi:** ipwho.is üzerinden serverless proxy

Ayrı VDS/VPS çalıştırılmaz.

## 1. Cloudflare hesabı

Cloudflare'de ücretsiz/uygun bir hesap aç ve Pages + D1 erişiminin olduğu hesaba giriş yap.

Bilgisayarda Node.js kurulu olmalı. Telefonda Termux kullanıyorsan:

```bash
pkg update
pkg install nodejs git
```

Ardından:

```bash
npm login
npx wrangler login
```

Tarayıcı üzerinden Cloudflare yetkilendirmesi tamamlanır.

## 2. D1 veritabanı oluştur

Proje klasöründe:

```bash
npx wrangler d1 create osnit-apex
```

Komutun verdiği `database_id` değerini `wrangler.toml` içindeki:

```toml
database_id = "REPLACE_WITH_YOUR_D1_DATABASE_ID"
```

alanına yaz.

## 3. Tabloları oluştur

Uzak/production D1 için:

```bash
npx wrangler d1 migrations apply osnit-apex --remote
```

Başarılı olunca `users`, `sessions` ve `records` tabloları oluşur.

## 4. İlk yayın

```bash
npx wrangler pages project create osnit-apex-web
npx wrangler pages deploy . --project-name osnit-apex-web
```

Komutun verdiği `*.pages.dev` adresini aç.

## 5. Özel domain

Cloudflare Pages panelinden istediğin domaini projeye bağla. SSL/TLS Cloudflare tarafından yönetilir.

## 6. Telefon/Termux ile yayın

ZIP'i çıkardıktan sonra proje klasörüne gir:

```bash
cd osnit-apex-web
npx wrangler login
npx wrangler d1 create osnit-apex
# wrangler.toml içindeki database_id'yi doldur
npx wrangler d1 migrations apply osnit-apex --remote
npx wrangler pages project create osnit-apex-web
npx wrangler pages deploy . --project-name osnit-apex-web
```

## 7. Yerel test

D1'i lokal kullanarak:

```bash
npx wrangler d1 migrations apply osnit-apex --local
npx wrangler pages dev . --d1 DB=osnit-apex
```

Tarayıcıdan Wrangler'ın verdiği localhost adresini aç.

## 8. Çalışan özellikler

- Gerçek kayıt/kullanıcı oluşturma ve giriş
- HttpOnly/Secure oturum cookie'si
- Sunucu tarafı parola hashleme
- Vaka CRUD
- Hedef CRUD
- Bulgu/not CRUD
- JSON dışa aktarma
- Global harita
- USGS deprem verisi
- NASA EONET olayları
- Türkiye/dünya GDELT haberleri
- BTC/ETH piyasa verisi
- DNS A kaydı sorgusu
- IPv4 bilgi sorgusu
- Google/Bing/Brave açık web araması bağlantıları
- 20 dil seçeneği altyapısı
- PWA manifesti
- Güvenlik başlıkları
- Sistem sağlık kontrolü
- Komut paleti
- Mobil uyum

## 9. Önemli güvenlik notları

- Frontend içine özel API anahtarı koyma.
- `wrangler.toml` içindeki D1 ID'si gizli parola değildir; yine de paylaşırken hesabına ait diğer bilgileri yayınlama.
- Şifreleri frontend/localStorage'a kaydetme.
- `localStorage` ile gerçek auth yapılmaz; bu sürümde auth D1 + serverless session kullanır.
- Arama/OSINT özellikleri yalnızca yetkili ve yasal kullanım için tasarlanmıştır.
- Yetkisiz erişim, hesap ele geçirme, şifre kırma veya gizli kişisel veri çıkarma özellikleri eklenmemiştir.

## 10. Veri kaynakları

Uygulama dış kaynakların erişilebilirliğine ve kullanım şartlarına bağlıdır. Bir sağlayıcı erişimi keserse uygulamanın geri kalan bölümleri çalışmaya devam eder.
