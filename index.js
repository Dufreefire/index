const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

// --- KIỂM TRA BIẾN MÔI TRƯỜNG ---
if (!process.env.BOT_TOKEN) {
    console.error("❌ LỖI: BOT_TOKEN không tồn tại trong Environment Variables!");
    process.exit(1);
}

// --- CẤU TRÚC DỮ LIỆU ---
const DATA_PATH = path.join(__dirname, 'database.json');
const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;

// --- HỆ THỐNG QUẢN LÝ DỮ LIỆU ---
let db = { users: {}, products: [] };

async function loadDB() {
    try {
        if (await fs.exists(DATA_PATH)) {
            db = await fs.readJson(DATA_PATH);
            console.log('✅ Đã tải dữ liệu thành công từ database.json');
        } else {
            await saveDB();
        }
    } catch (err) {
        console.error('❌ Lỗi tải DB:', err);
    }
}

async function saveDB() {
    try {
        await fs.writeJson(DATA_PATH, db, { spaces: 2 });
    } catch (err) {
        console.error('❌ Lỗi lưu DB:', err);
    }
}

// --- KHỞI TẠO SERVER GIỮ BOT SỐNG ---
const app = express();
app.get('/', (req, res) => res.send('THUETOOLVIP BOT IS RUNNING!'));
app.listen(process.env.PORT || 3000, () => console.log("🌐 Server web đã sẵn sàng"));

// --- TIỆN ÍCH ---
const money = (val) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

const mainMenu = () => Markup.inlineKeyboard([
    [Markup.button.callback('🎮 Mua Acc Game', 'list_acc'), Markup.button.callback('🛠 Mua Bản Hack', 'list_hack')],
    [Markup.button.callback('🔑 Thuê Key Tool', 'list_key'), Markup.button.callback('💳 Nạp Tiền', 'deposit')],
    [Markup.button.callback('👤 Thông Tin', 'user_info'), Markup.button.callback('⚠️ Báo Lỗi', 'report')],
    [Markup.button.url('🌐 Admin', 'https://t.me/thuetoolvip1')]
]);

// --- XỬ LÝ START ---
bot.start(async (ctx) => {
    const uid = ctx.from.id.toString();
    if (!db.users[uid]) {
        db.users[uid] = {
            telegramId: uid,
            username: ctx.from.username || "NoName",
            balance: 0,
            history: []
        };
        await saveDB();
    }
    ctx.replyWithMarkdown(`👋 **Chào mừng ${ctx.from.first_name}!**\n💰 Số dư: \`${money(db.users[uid].balance)}\`\n🛒 Chọn dịch vụ bên dưới:`, mainMenu());
});

// --- HIỂN THỊ SẢN PHẨM ---
const renderProducts = async (ctx, type) => {
    const products = db.products.filter(p => p.type === type);
    if (!products.length) return ctx.reply("Hệ thống đang cập nhật hàng, vui lòng quay lại sau.");

    for (const p of products) {
        const inStock = p.stock.length;
        const caption = `📌 **${p.name}**\n💰 Giá: ${money(p.price)}\n📝 Mô tả: ${p.description}\n📊 Tình trạng: ${inStock > 0 ? `Còn ${inStock}` : '❌ Hết hàng'}`;
        
        const btns = [];
        if (inStock > 0) btns.push([Markup.button.callback(`🛒 Mua ngay`, `buy_${p.id}`)]);
        btns.push([Markup.button.callback('⬅️ Quay lại', 'back')]);

        try {
            if (p.image) {
                await ctx.replyWithPhoto(p.image, { caption, parse_mode: 'Markdown', ...Markup.inlineKeyboard(btns) });
            } else {
                await ctx.replyWithMarkdown(caption, Markup.inlineKeyboard(btns));
            }
        } catch (e) {
            console.error("Lỗi gửi sản phẩm:", e.message);
        }
    }
};

bot.action('list_acc', ctx => renderProducts(ctx, 'acc'));
bot.action('list_hack', ctx => renderProducts(ctx, 'hack'));
bot.action('list_key', ctx => renderProducts(ctx, 'key'));

// --- MUA HÀNG ---
bot.action(/^buy_(.+)$/, async (ctx) => {
    const pId = ctx.match[1];
    const uid = ctx.from.id.toString();
    const user = db.users[uid];
    const product = db.products.find(p => p.id === pId);

    if (!product || product.stock.length === 0) return ctx.answerCbQuery("❌ Đã hết hàng!", { show_alert: true });
    if (user.balance < product.price) return ctx.answerCbQuery("⚠️ Không đủ tiền, hãy nạp thêm!", { show_alert: true });

    const dataPaid = product.stock.shift();
    user.balance -= product.price;
    user.history.push({ name: product.name, date: new Date() });
    await saveDB();

    await ctx.replyWithMarkdown(
        `✅ **GIAO DỊCH THÀNH CÔNG!**\n\n` +
        `📦 Sản phẩm: *${product.name}*\n` +
        `💰 Đã thanh toán: *${money(product.price)}*\n` +
        `--------------------------\n` +
        `🔑 **NỘI DUNG (ẤN ĐỂ COPY):**\n\`${dataPaid}\`\n` +
        `--------------------------\n` +
        `📖 **HD:** ${product.instruction || 'Liên hệ Admin'}`,
        Markup.inlineKeyboard([[Markup.button.callback('🏠 Về Menu', 'back')]])
    );

    bot.telegram.sendMessage(ADMIN_ID, `🔔 **DOANH THU:** ${uid} mua ${product.name} (${money(product.price)})`).catch(() => {});
});

// --- NẠP TIỀN ---
bot.action('deposit', async (ctx) => {
    const stk = "0362781497"; 
    const name = "NGUYEN VAN DU";
    const desc = `VIP${ctx.from.id}`;
    const qr = `https://img.vietqr.io/image/vpbank-${stk}-compact2.jpg?addInfo=${desc}&accountName=${encodeURIComponent(name)}`;

    ctx.replyWithPhoto(qr, {
        caption: `💳 **NẠP TIỀN TỰ ĐỘNG**\n\n🏦 **VPBANK**\n🔢 STK: \`${stk}\`\n👤 Chủ TK: **${name}**\n📝 Nội dung: \`${desc}\` (Bắt buộc)\n\n*Hệ thống tự động cộng tiền.*`,
        parse_mode: 'Markdown'
    });
});

// --- ADMIN: THÊM HÀNG ---
bot.on('photo', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID?.toString()) return;
    const caption = ctx.message.caption;
    if (caption && caption.startsWith('/add')) {
        try {
            const parts = caption.split('|');
            const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            db.products.push({
                id: Date.now().toString(),
                type: parts[0].replace('/add ', '').trim(),
                name: parts[1].trim(),
                price: parseInt(parts[2]),
                description: parts[3].trim(),
                image: photoId,
                instruction: parts[4].trim(),
                stock: []
            });
            await saveDB();
            ctx.reply("✅ Đã thêm sản phẩm thành công!");
        } catch (e) { ctx.reply("❌ Lỗi cú pháp /add"); }
    }
});

bot.command('duyet', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID?.toString()) return;
    const [_, targetId, amount] = ctx.message.text.split(' ');
    if (db.users[targetId]) {
        db.users[targetId].balance += parseInt(amount);
        await saveDB();
        ctx.reply(`✅ Đã nạp ${money(parseInt(amount))} cho ${targetId}`);
        bot.telegram.sendMessage(targetId, `🎉 Bạn đã được cộng *${money(parseInt(amount))}*`, { parse_mode: 'Markdown' }).catch(() => {});
    } else ctx.reply("❌ Sai ID!");
});

bot.command('up', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID?.toString()) return;
    try {
        const input = ctx.message.text.split('/up ')[1].split('|');
        const name = input[0].trim();
        const stockData = input[1].split(',').map(s => s.trim());
        const p = db.products.find(x => x.name === name);
        if (p) {
            p.stock.push(...stockData);
            await saveDB();
            ctx.reply(`✅ Đã nạp ${stockData.length} hàng vào kho ${name}`);
        }
    } catch (e) { ctx.reply("❌ Lỗi cú pháp /up"); }
});

// --- BACKUP / RESTORE ---
bot.command('backup', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID?.toString()) return;
    await saveDB();
    ctx.replyWithDocument({ source: DATA_PATH }).catch(e => ctx.reply(e.message));
});

bot.on('document', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID?.toString()) return;
    if (ctx.message.caption === '/restore') {
        const fileLink = await bot.telegram.getFileLink(ctx.message.document.file_id);
        const response = await axios.get(fileLink.href);
        db = response.data;
        await saveDB();
        ctx.reply("✅ Đã khôi phục dữ liệu!");
    }
});

bot.action('user_info', ctx => {
    const user = db.users[ctx.from.id.toString()];
    ctx.replyWithMarkdown(`👤 **HỒ SƠ**\n🆔 ID: \`${ctx.from.id}\`\n💰 Số dư: *${money(user.balance)}*`);
});

bot.action('back', async (ctx) => {
    try {
        await ctx.deleteMessage();
    } catch (e) {}
    const uid = ctx.from.id.toString();
    ctx.replyWithMarkdown(`👋 **Chào mừng ${ctx.from.first_name}!**\n💰 Số dư: \`${money(db.users[uid].balance)}\``, mainMenu());
});

// --- KHỞI CHẠY ---
loadDB().then(() => {
    bot.launch().then(() => console.log("🚀 BOT IS LIVE!")).catch(err => console.error("Lỗi Launch:", err));
});

// Dừng an toàn
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
