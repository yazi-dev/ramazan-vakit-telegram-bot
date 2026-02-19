# 🌙 Ramazan Vakit Hatırlatıcı & Yönetim Botu

![Node.js](https://img.shields.io/badge/Node.js-LTS-green)
![Telegram](https://img.shields.io/badge/Telegram-Bot%20API-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

Bu proje, Ramazan ayı boyunca dünya genelindeki şehirler için **İmsak** ve **İftar** vakitlerini takip eden, kullanıcılara vakit yaklaşırken (30 dk kala ve tam vaktinde) otomatik bildirim gönderen profesyonel bir Telegram botudur.

## ✨ Öne Çıkan Özellikler

- 🌍 **Global Destek:** Dünya üzerindeki tüm şehirler için Aladhan API üzerinden güncel vakitleri çeker.
- 🔔 **Otomatik Bildirim:** Sahur ve İftar vakitlerinde kullanıcıyı veya grubu otomatik uyarır.
- 📱 **Gelişmiş Panel:** Tamamen butonlarla kontrol edilen (Inline Keyboard) kullanıcı dostu arayüz.
- 👥 **Grup Desteği:** Botu gruplara ekleyebilir ve `/setup` komutuyla gruba özel vakit bildirimleri kurabilirsiniz.
- 🔐 **Güvenli Yönetim:** Admin paneli üzerinden sistem istatistiklerini takip etme ve iki aşamalı veritabanı sıfırlama.
- 🗄️ **Kalıcı Veri:** SQLite veritabanı ile kullanıcı tercihleri bot kapansa bile silinmez.

## 🛠 Kurulum

1. **Depoyu klonlayın:**
   ```bash
   git clone [https://github.com/kullaniciadi/ramazan-vakit-bot.git](https://github.com/kullaniciadi/ramazan-vakit-bot.git)
   cd ramazan-vakit-bot