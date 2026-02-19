require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const cron = require('node-cron');
const moment = require('moment-timezone');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// --- AYARLAR ---
const GITHUB_URL = "https://github.com/KULLANICI_ADIN/PROJE_ADIN"; 
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const TIMEZONE = 'Europe/Istanbul';

const bot = new Telegraf(BOT_TOKEN);
let db;

/**
 * 🗄️ Veritabanı Başlatma
 */
async function initDb() {
    db = await open({ filename: './database.sqlite', driver: sqlite3.Database });
    await db.exec(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY, 
        city TEXT, 
        country TEXT, 
        type TEXT
    )`);
}

/**
 * 🌍 API Servisi (Tek günlük vakitler)
 */
async function getPrayerTimes(city, country) {
    try {
        const url = `https://api.aladhan.com/v1/timingsByCity?city=${city}&country=${country}&method=13`;
        const { data } = await axios.get(url);
        return data.data.timings;
    } catch (e) { return null; }
}

/**
 * 🌍 API Servisi (Aylık Takvim)
 */
async function getMonthlyVakit(city, country) {
    try {
        const now = moment().tz(TIMEZONE);
        const url = `https://api.aladhan.com/v1/calendarByCity/${now.year()}/${now.month() + 1}`;
        const { data } = await axios.get(url, {
            params: { city, country, method: 13 }
        });
        return data.data;
    } catch (e) { return null; }
}

/**
 * 🌙 Ramazan Ayı Verilerini Çeken Fonksiyon
 */
async function getRamazanImsakiye(city, country) {
    try {
        const now = moment().tz(TIMEZONE);
        const currentYear = now.year();

        // Tüm yılın verisini çekiyoruz
        const url = `https://api.aladhan.com/v1/calendarByCity/${currentYear}`;
        const response = await axios.get(url, {
            params: { 
                city, 
                country, 
                method: 13, // Diyanet
                annual: true 
            },
            timeout: 10000 // 10 saniye zaman aşımı (Pterodactyl için önemli)
        });

        if (!response.data || !response.data.data) {
            console.error("API'den boş veri döndü.");
            return null;
        }

        const ramazanDays = [];
        const allMonths = response.data.data;

        // API verisi aylara göre (1'den 12'ye kadar) dizilmiştir
        for (let m = 1; m <= 12; m++) {
            if (allMonths[m]) {
                allMonths[m].forEach(day => {
                    // Hicri ayı "Ramadan" olanları bul
                    if (day.date.hijri.month.en === "Ramadan") {
                        ramazanDays.push(day);
                    }
                });
            }
        }

        console.log(`✅ ${city} için ${ramazanDays.length} günlük Ramazan verisi hazırlandı.`);
        return ramazanDays;

    } catch (e) { 
        console.error("🔴 İmsakiye API Hatası:", e.message);
        return null; 
    }
}
/**
 * 🎮 Gelişmiş Ana Panel
 */
const mainMenu = async (ctx) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [ctx.chat.id]);
    
    // EĞER KAYIT YOKSA BUTONLARI GÖSTERME, SADECE SETUP REHBERİ
    if (!user) {
        return ctx.reply(
            "🌙 **Ramazan Botuna Hoş Geldiniz!**\n\nSistemi kullanabilmek için önce konumunuzu ayarlamanız gerekmektedir.\n\n" +
            "📍 **Kurulum İçin:**\n`/setup Sehir Ulke` komutunu gönderin.\n" +
            "_(Örnek: `/setup Istanbul Turkey`)_", 
            { parse_mode: 'Markdown' }
        );
    }

    const statusEmoji = '🟢 Aktif';
    const welcomeText = `🌙 **Ramazan Yönetim Paneli**\n\n` +
                        `👤 **Durum:** ${statusEmoji}\n` +
                        `📍 **Konum:** ${user.city}, ${user.country}\n` +
                        `🕒 **Sistem:** ${moment().tz(TIMEZONE).format('HH:mm')}\n\n` +
                        `✨ _Vakitleri aşağıdan takip edebilirsiniz._`;

    const buttons = [
        [Markup.button.callback('📍 Vakitleri Gör', 'vakit_gor'), Markup.button.callback('⏳ İftara Kalan', 'kalan_gor')],
        [Markup.button.callback('🔔 Bildirim Testi', 'test_notif'), Markup.button.callback('📅 Detaylı İmsakiye', 'imsakiye_gor')],
        [Markup.button.callback('📜 Günün Duası', 'dua_gor'), Markup.button.callback('📊 İstatistik', 'stats_gor')],
        [Markup.button.url('💻 GitHub', GITHUB_URL)]
    ];

    if (ctx.from.id === ADMIN_ID) {
        buttons.push([Markup.button.callback('⚠️ TEHLİKELİ ALAN', 'admin_danger')]);
    }

    if (ctx.callbackQuery) {
        return ctx.editMessageText(welcomeText, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    } else {
        return ctx.reply(welcomeText, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
    }
};

// --- KOMUTLAR ---
bot.start((ctx) => mainMenu(ctx));
bot.command('panel', (ctx) => mainMenu(ctx));

bot.command('setup', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply("⚠️ Kullanım: `/setup Sehir Ulke` (Örn: /setup Istanbul Turkey)", { parse_mode: 'Markdown' });
    
    await db.run('INSERT OR REPLACE INTO users (id, city, country, type) VALUES (?, ?, ?, ?)', 
        [ctx.chat.id, args[1], args[2], ctx.chat.type]);
    
    ctx.reply(`✅ Kayıt başarılı! \n📍 ${args[1]}, ${args[2]} ayarlandı.`);
    return mainMenu(ctx);
});

// --- AKSİYONLAR ---

bot.action('vakit_gor', async (ctx) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [ctx.chat.id]);
    const calendar = await getMonthlyVakit(user.city, user.country);
    if (!calendar) return ctx.answerCbQuery("Vakitler alınamadı.");

    const todayIndex = moment().tz(TIMEZONE).date() - 1;
    const t = calendar[todayIndex].timings;
    const clean = (time) => time.split(' ')[0];

    let text = `📅 **Bugün (${calendar[todayIndex].date.readable}):**\n` +
               `🌅 İmsak: ${clean(t.Fajr)}\n` +
               `🕛 Öğle: ${clean(t.Dhuhr)}\n` +
               `🕒 İkindi: ${clean(t.Asr)}\n` +
               `🌇 İftar: ${clean(t.Maghrib)}\n` +
               `🌙 Yatsı/Teravih: ${clean(t.Isha)}`;

    ctx.editMessageText(text, { 
        parse_mode: 'Markdown', 
        ...Markup.inlineKeyboard([Markup.button.callback('⬅️ Geri', 'back_home')]) 
    });
});


// --- MANEVİ İÇERİK HAVUZU ---
const maneviIcerik = [
    {
        baslik: "🍽️ Yemek & İftar Duası",
        icerik: "Allahümme leke sumtü ve bike âmentü ve aleyke tevekkeltü ve alâ rızkıke eftartü. (Allah'ım! Senin rızan için oruç tuttum, Sana inandım, Sana güvendim ve Senin rızkınla iftar ettim.)"
    },
    {
        baslik: "🌙 Sahur Duası",
        icerik: "Allahümme eczil lenâ fîhi'l-ecra ve e'ınnâ fîhi ala's-sıyâmi ve'l-kıyâm. (Allah'ım! Bu ayda ecrimizi bol eyle; oruç tutmak ve ibadet etmek için bize yardım eyle.)"
    },
    {
        baslik: "✨ Günün Hadis-i Şerifi",
        icerik: "Oruçlu için iki sevinç vardır: Biri iftar ettiği zamanki sevinci, diğeri de Rabbine kavuştuğu zamanki sevincidir. (Buhârî, Savm 9)"
    },
    {
        baslik: "📖 Kur'an-ı Kerim'den",
        icerik: "Rabbimiz! Bize dünyada da güzellik ver, ahirette de güzellik ver. Bizi ateş azabından koru. (Bakara, 201)"
    },
    {
        baslik: "🤲 Mağfiret Duası",
        icerik: "Allahümme inneke afüvvün tuhibbü'l-afve fa'fü annî. (Allah'ım! Şüphesiz sen affedicisin, affetmeyi seversin, beni de affet.)"
    },
    {
        baslik: "🍞 Şükür Duası",
        icerik: "Elhamdülillahi'llezî et'amenâ ve sekânâ ve cealenâ müslimîn. (Bizi yediren, içiren ve Müslüman kılan Allah'a hamdolsun.)"
    }
];

// --- AKSİYON GÜNCELLEMESİ ---

// --- İSTATİSTİK BUTONU GÜNCELLEMESİ ---

bot.action('stats_gor', async (ctx) => {
    const count = await db.get('SELECT COUNT(*) as c FROM users');
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);

    const statsText = `📊 **Bot İstatistikleri**\n\n` +
                      `👤 Kullanıcı Sayısı: ${count.c}\n` +
                      `⏱️ Çalışma Süresi: ${h}s ${m}dk\n` +
                      `✅ Durum: Aktif\n\n` +
                      `⭐ Bu proje açık kaynaklıdır ve GitHub üzerinden geliştirilmektedir.`;
    ctx.editMessageText(statsText, {
        parse_mode: 'Markdown', 
        ...Markup.inlineKeyboard([
            [Markup.button.url('⭐ GitHub\'da Yıldızla', GITHUB_URL)],
            [Markup.button.callback('⬅️ Geri', 'back_home')]
        ]) 
    });
});


bot.action('imsakiye_gor', async (ctx) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [ctx.chat.id]);
    const calendar = await getMonthlyVakit(user.city, user.country);

    let listText = `📅 **${user.city} Aylık İmsakiye**\n\`Tarih      | İmsak | İftar\`\n`;

    listText += `\`--------------------------\`\n`;

    // Sadece 30 günlük veriyi listele
    calendar.slice(0, 30).forEach(day => {
        const d = day.date.gregorian.day;
        const imsak = day.timings.Fajr.split(' ')[0];
        const iftar = day.timings.Maghrib.split(' ')[0];
        listText += `\`${d} Şub/Mar  | ${imsak} | ${iftar}\`\n`;
    });

    ctx.editMessageText(listText, { 
        parse_mode: 'MarkdownV2', // Tablo görünümü için kod bloğu kullanıyoruz
        ...Markup.inlineKeyboard([Markup.button.callback('⬅️ Geri', 'back_home')]) 
    });
});

bot.action('kalan_gor', async (ctx) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [ctx.chat.id]);
    const v = await getPrayerTimes(user.city, user.country);
    const now = moment().tz(TIMEZONE);
    const iftar = moment(v.Maghrib.split(' ')[0], 'HH:mm');

    let msg = now.isAfter(iftar) ? "🌙 Bugünkü iftar vakti geçti. Allah kabul etsin!" : 
              `⏳ **İftara Kalan Süre:**\n${moment.duration(iftar.diff(now)).hours()} saat ${moment.duration(iftar.diff(now)).minutes()} dakika kaldı.`;

    ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([Markup.button.callback('⬅️ Geri', 'back_home')]) });
});

bot.action('test_notif', async (ctx) => {
    await ctx.answerCbQuery("🔔 Test gönderiliyor...");
    ctx.reply(`🧪 **Bildirim Testi Başarılı!**\nVakit geldiğinde böyle mesaj alacaksınız.`);
});

bot.action('back_home', (ctx) => mainMenu(ctx));

// --- TEHLİKELİ ALAN (2 AŞAMALI) ---
bot.action('admin_danger', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery("Yetkisiz!");
    ctx.editMessageText("🚨 **KRİTİK UYARI!**\nVeritabanını silmek üzeresiniz. Bu işlem GERİ ALINAMAZ!", 
        Markup.inlineKeyboard([
            [Markup.button.callback('🔥 EVET, SİL', 'db_clear_confirm'), Markup.button.callback('❌ VAZGEÇ', 'back_home')]
        ]));
});

bot.action('db_clear_confirm', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await db.run('DELETE FROM users');
    ctx.answerCbQuery("Sıfırlandı!");
    ctx.editMessageText("✅ Veritabanı başarıyla temizlendi.");
});

// --- CRON ---
cron.schedule('* * * * *', async () => {
    const users = await db.all('SELECT * FROM users');
    const now = moment().tz(TIMEZONE).format('HH:mm');

    for (const u of users) {
        const v = await getPrayerTimes(u.city, u.country);
        if (!v) continue;
        const fajr = v.Fajr.split(' ')[0];
        const maghrib = v.Maghrib.split(' ')[0];

        const s30 = moment(fajr, 'HH:mm').subtract(30, 'minutes').format('HH:mm');
        const i30 = moment(maghrib, 'HH:mm').subtract(30, 'minutes').format('HH:mm');

        const send = (m) => bot.telegram.sendMessage(u.id, m + `\n\n_🤖 [GitHub](${GITHUB_URL})_`, { parse_mode: 'Markdown' }).catch(() => {});

        if (now === s30) send(`🌙 **Sahura 30 dk kaldı!** (${u.city})`);
        if (now === fajr) send(`📢 **İmsak Vakti!** (${u.city})`);
        if (now === i30) send(`⏳ **İftara 30 dk kaldı!** (${u.city})`);
        if (now === maghrib) send(`🏮 **İftar Vakti!** (${u.city}) Afiyet olsun.`);
    }
}, { timezone: TIMEZONE });

initDb().then(() => {
    bot.launch();
    console.log("🚀 Ramazan Botu Aktif!");
});