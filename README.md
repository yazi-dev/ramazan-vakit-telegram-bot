# 🌙 Ramazan Vakit Hatırlatıcı & Yönetim Botu

![GitHub stars](https://img.shields.io/github/stars/yazi-dev/ramazan-vakit-telegram-bot?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-LTS-green)
![Telegram](https://img.shields.io/badge/Telegram-Bot%20API-blue)
![Telegram Bot](https://img.shields.io/badge/Telegram-Bot-blue?style=flat-square&logo=telegram)
![License](https://img.shields.io/badge/License-MIT-yellow)

Bu proje, Ramazan ayı boyunca dünya genelindeki şehirler için **İmsak** ve **İftar** vakitlerini takip eden, kullanıcılara vakit yaklaşırken (30 dk kala ve tam vaktinde) otomatik bildirim gönderen profesyonel bir Telegram botudur.

---

## ✨ Öne Çıkan Özellikler

- 🌍 **Global Bildirim:** Dünya üzerindeki tüm şehirler için Aladhan API üzerinden güncel vakitleri çeker.
- 🔔 **Otomatik Bildirim:** Sahur ve İftar vakitlerinde kullanıcıyı veya grubu otomatik uyarır.
- 📱 **Gelişmiş Panel:** Tamamen butonlarla kontrol edilen (Inline Keyboard) kullanıcı dostu arayüz.
- 👥 **Grup Desteği:** Botu gruplara ekleyebilir ve `/setup` komutuyla gruba özel vakit bildirimleri kurabilirsiniz.
- 🔐 **Güvenli Yönetim:** Admin paneli üzerinden sistem istatistiklerini takip etme ve iki aşamalı veritabanı sıfırlama.
- 🗄️ **Kalıcı Veri:** SQLite veritabanı ile kullanıcı tercihleri bot kapansa bile silinmez.
- 💬 **Kullanıcı Dostu Arayüz:** Inline butonlar veya basit komutlarla kolay kullanım.

---

## 🛠️ Kurulum ve Çalıştırma

Projeyi kendi sunucunuzda veya yerel makinenizde çalıştırmak için aşağıdaki adımları izleyin:

### 1. Depoyu Klonlayın
```bash
git clone [https://github.com/yazi-dev/ramazan-vakit-telegram-bot.git](https://github.com/yazi-dev/ramazan-vakit-telegram-bot.git)
cd ramazan-vakit-telegram-bot