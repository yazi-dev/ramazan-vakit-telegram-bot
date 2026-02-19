require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const cron = require('node-cron');
const moment = require('moment-timezone');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// --- AYARLAR ---
const GITHUB_URL = "https://github.com/yazi-dev/ramazan-vakit-telegram-bot"; 
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const TIMEZONE = 'Europe/Istanbul';

const bot = new Telegraf(BOT_TOKEN);
let db;

async function initDb() {
    db = await open({ filename: './database.sqlite', driver: sqlite3.Database }); // [cite: 4]
    // notifications sütunu eklendi: 1 aktif, 0 kapalı 
    await db.exec(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY, 
        city TEXT, 
        country TEXT, 
        type TEXT,
        notifications INTEGER DEFAULT 1
    )`); // 
}

async function getPrayerTimes(city, country) {
    try {
        const url = `https://api.aladhan.com/v1/timingsByCity?city=${city}&country=${country}&method=13`;
        const { data } = await axios.get(url);
        return data.data.timings;
    } catch (e) { return null; }
}

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

async function getImsakiyeData(city, country) {
    try {
        const url = `https://api.aladhan.com/v1/calendarByCity/2026/2`; // Şubat
        const url2 = `https://api.aladhan.com/v1/calendarByCity/2026/3`; // Mart
        
        const [resFeb, resMar] = await Promise.all([
            axios.get(url, { params: { city, country, method: 13 } }),
            axios.get(url2, { params: { city, country, method: 13 } })
        ]);

        // Şubat 20'den Mart 15'e kadar filtreleme
        const febDays = resFeb.data.data.filter(d => parseInt(d.date.gregorian.day) >= 19);
        const marDays = resMar.data.data.filter(d => parseInt(d.date.gregorian.day) <= 15);
        
        return [...febDays, ...marDays];
    } catch (e) { return null; }
}

/**
 * 🎮 Ana Panel
 */
const mainMenu = async (ctx) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [ctx.chat.id]); // [cite: 21]

    if (!user) {
        return ctx.reply(
            "🌙 **Ramazan Botuna Hoş Geldiniz!**\n\nSistemi kullanabilmek için önce konumunuzu ayarlamanız gerekmektedir.\n\n" +
            "📍 **Kurulum İçin:**\n`/setup Sehir Ulke` komutunu gönderin.\n" +
            "_(Örnek: `/setup Istanbul Turkey`)_", 
            { parse_mode: 'Markdown' }
        ); // [cite: 21, 22]
    }

    const notifyStatus = user.notifications === 0 ? '🔴 Kapalı' : '🔔 Açık';
    const welcomeText = `🌙 **Ramazan Yönetim Paneli**\n\n` +
                        `📍 **Konum:** ${user.city}, ${user.country}\n` +
                        `🔔 **Bildirimler:** ${notifyStatus}\n` +
                        `🕒 **Sistem:** ${moment().tz(TIMEZONE).format('HH:mm')}\n\n` +
                        `✨ _Vakitleri aşağıdan takip edebilirsiniz._`; // [cite: 23, 24]

    const buttons = [
        [Markup.button.callback('📍 Vakitleri Gör', 'vakit_gor'), Markup.button.callback('⏳ Kalan Vakit', 'kalan_gor')],
        [Markup.button.callback(user.notifications === 0 ? '🔔 Bildirimleri Aç' : '🔕 Bildirimleri Kapat', 'toggle_notify')],
        [Markup.button.callback('📅 Detaylı İmsakiye', 'imsakiye_gor'), Markup.button.callback('📜 Günün Duası', 'dua_gor')],
        [Markup.button.callback('📊 İstatistik', 'stats_gor'), Markup.button.url('💻 GitHub', GITHUB_URL)]
    ]; // 

    if (ctx.from.id === ADMIN_ID) {
        buttons.push([Markup.button.callback('⚠️ TEHLİKELİ ALAN', 'admin_danger')]); // [cite: 26]
    }

    if (ctx.callbackQuery) {
        return ctx.editMessageText(welcomeText, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }); // [cite: 27]
    } else {
        return ctx.reply(welcomeText, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }); // [cite: 28]
    }
};

// --- KOMUTLAR ---
bot.start((ctx) => mainMenu(ctx));
bot.command('panel', (ctx) => mainMenu(ctx)); // [cite: 29]

bot.command('setup', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 3) return ctx.reply("⚠️ Kullanım: `/setup Sehir Ulke` (Örn: /setup Istanbul Turkey)", { parse_mode: 'Markdown' }); // [cite: 30]
    
    await db.run('INSERT OR REPLACE INTO users (id, city, country, type, notifications) VALUES (?, ?, ?, ?, 1)', 
        [ctx.chat.id, args[1], args[2], ctx.chat.type]); // [cite: 30]
    
    ctx.reply(`✅ Kayıt başarılı! \n📍 ${args[1]}, ${args[2]} ayarlandı.`);
    return mainMenu(ctx); // [cite: 30]
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

// --- AKSİYONLAR ---
bot.action('toggle_notify', async (ctx) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [ctx.chat.id]);
    const nextStatus = user.notifications === 0 ? 1 : 0;
    await db.run('UPDATE users SET notifications = ? WHERE id = ?', [nextStatus, ctx.chat.id]);
    await ctx.answerCbQuery(nextStatus === 1 ? "🔔 Bildirimler Açıldı" : "🔕 Bildirimler Kapatıldı");
    return mainMenu(ctx);
});


// --- İSTATİSTİK BUTONU GÜNCELLEMESİ ---
bot.action('stats_gor', async (ctx) => {
    const count = await db.get('SELECT COUNT(*) as c FROM users'); // [cite: 37]
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60); // [cite: 37]

    const statsText = `📊 **Bot İstatistikleri**\n\n` +
                      `👤 Kullanıcı Sayısı: ${count.c}\n` +
                      `⏱️ Çalışma Süresi: ${h}s ${m}dk\n` +
                      `✅ Durum: Aktif\n\n` +
                      `⭐ Bu proje açık kaynaklıdır.`; // [cite: 38]
    ctx.editMessageText(statsText, {
        parse_mode: 'Markdown', 
        ...Markup.inlineKeyboard([
            [Markup.button.url('⭐ GitHub\'da Yıldızla', GITHUB_URL)],
            [Markup.button.callback('⬅️ Geri', 'back_home')]
        ]) 
    }); // [cite: 39]
});


bot.action('imsakiye_gor', async (ctx) => {
    try {
        const user = await db.get('SELECT * FROM users WHERE id = ?', [ctx.chat.id]);
        const days = await getImsakiyeData(user.city, user.country);
        
        if (!days) return ctx.answerCbQuery("Veri alınamadı.");

        // Tablo başlığı - Markdown formatına uygun
        let text = `📅 *${user.city} İmsakiyesi*\n\n` +
                   `\`Trh  | İms | Gûn | Öğl | İkn | İft | Yat\`\n` +
                   `\`-------------------------------------\`\n`;

        days.forEach(d => {
            // Sayı olan değerleri stringe çevirip öyle padStart uyguluyoruz
            const gun = String(d.date.gregorian.day).padStart(2, '0');
            const ay = String(d.date.gregorian.month.number).padStart(2, '0');
            
            // Vakitleri parçalara ayırıp temizliyoruz (Örn: 05:45)
            const ims = d.timings.Fajr.split(' ')[0];
            const gunes = d.timings.Sunrise.split(' ')[0];
            const ogl = d.timings.Dhuhr.split(' ')[0];
            const ikn = d.timings.Asr.split(' ')[0];
            const ift = d.timings.Maghrib.split(' ')[0];
            const yat = d.timings.Isha.split(' ')[0];
            
            // Satır yapısını oluşturuyoruz
            text += `\`${gun}.${ay} |${ims}|${gunes}|${ogl}|${ikn}|${ift}|${yat}\`\n`;
        });

        await ctx.editMessageText(text, { 
            parse_mode: 'Markdown', 
            ...Markup.inlineKeyboard([Markup.button.callback('⬅️ Geri', 'back_home')]) 
        });
    } catch (e) {
        console.error("İmsakiye Görüntüleme Hatası:", e);
        ctx.answerCbQuery("Bir hata oluştu.");
    }
});

// --- kalan_gor fonksiyonu için anlık saniye düzeltmesi ---
bot.action('kalan_gor', async (ctx) => {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [ctx.chat.id]);
    const v = await getPrayerTimes(user.city, user.country);
    if (!v) return ctx.answerCbQuery("Veri alınamadı.");

    const now = moment().tz(TIMEZONE);
    // Vakitleri bugünün tarihiyle birleştirip moment nesnesine çeviriyoruz
    const today = now.format('YYYY-MM-DD');
    const iftarTime = moment.tz(`${today} ${v.Maghrib.split(' ')[0]}`, 'YYYY-MM-DD HH:mm', TIMEZONE);
    const sahurTime = moment.tz(`${today} ${v.Fajr.split(' ')[0]}`, 'YYYY-MM-DD HH:mm', TIMEZONE);

    let target, label;

    if (now.isBefore(sahurTime)) {
        target = sahurTime; 
        label = "İmsaka";
    } else if (now.isBefore(iftarTime)) {
        target = iftarTime; 
        label = "İftara";
    } else {
        // İftar geçtiyse yarının imsak vaktini hedefle
        target = sahurTime.clone().add(1, 'days'); 
        label = "Sahura";
    }

    const duration = moment.duration(target.diff(now));
    const text = `⏳ *${label} Kalan Süre:*\n\n` +
                 `✅ *${duration.hours()} saat ${duration.minutes()} dakika ${duration.seconds()} saniye*`;

    await ctx.editMessageText(text, { 
        parse_mode: 'Markdown', 
        ...Markup.inlineKeyboard([Markup.button.callback('⬅️ Geri', 'back_home')]) 
    });
});

bot.action('test_notif', async (ctx) => {
    await ctx.answerCbQuery("🔔 Test gönderiliyor...");
    ctx.reply(`🧪 **Bildirim Testi Başarılı!**\nVakit geldiğinde böyle mesaj alacaksınız.`);
});

bot.action('back_home', (ctx) => mainMenu(ctx)); // [cite: 45]

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

// --- CRON BİLDİRİMLERİ ---
cron.schedule('* * * * *', async () => {
    const users = await db.all('SELECT * FROM users'); // 
    const now = moment().tz(TIMEZONE).format('HH:mm');

    for (const u of users) {
        if (u.notifications === 0) continue; // Bildirimleri kapalı olanı atla 

        const v = await getPrayerTimes(u.city, u.country); // 
        if (!v) continue;
        const fajr = v.Fajr.split(' ')[0];
        const maghrib = v.Maghrib.split(' ')[0];

        const s30 = moment(fajr, 'HH:mm').subtract(30, 'minutes').format('HH:mm'); // 
        const i30 = moment(maghrib, 'HH:mm').subtract(30, 'minutes').format('HH:mm'); // [cite: 48]

        const send = (m) => bot.telegram.sendMessage(u.id, m + `\n\n_🤖 [GitHub](${GITHUB_URL})_`, { parse_mode: 'Markdown' }).catch(() => {});

        if (now === s30) send(`🌙 **Sahura 30 dk kaldı!** (${u.city})`); // [cite: 48]
        if (now === fajr) send(`📢 **İmsak Vakti!** (${u.city})`); // [cite: 48]
        if (now === i30) send(`⏳ **İftara 30 dk kaldı!** (${u.city})`); // [cite: 48]
        if (now === maghrib) send(`🏮 **İftar Vakti!** (${u.city}) Afiyet olsun.`); // [cite: 48, 49]
    }
}, { timezone: TIMEZONE }); // [cite: 49]

initDb().then(() => {
    bot.launch();
    console.log("🚀 Ramazan Botu Aktif!");
});
