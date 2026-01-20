const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

// --- ĐIỀN THÔNG TIN CỦA BẠN VÀO ĐÂY ---
const BOT_TOKEN = '8551122673:AAEr8vR0YjMjVkATv6Csi7f6qsVdj2q_2do'; // Dán Token từ BotFather vào đây
const ADMIN_ID = '8144161968'; // Dán ID Telegram của bạn vào đây (Ví dụ: '12345678')
const PORT = process.env.PORT || 3000; 

// --- CẤU TRÚC DỮ LIỆU ---
const DATA_PATH = path.join(__dirname, 'database.json');
const bot = new Telegraf(BOT_TOKEN);

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
app.listen(PORT, () => console.log(`🌐 Server đang chạy tại Port: ${PORT}`));

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
        } catch (e) { console.error("Lỗi gửi sản phẩm:", e.message); }
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
    if (user.balance < product.price) return ctx.answerCbQuery("⚠️ Không đủ tiền!", { show_alert: true });

    const dataPaid = product.stock.shift();
    user.balance -= product.price;
    user.history.push({ name: product.name, date: new Date() });
    await saveDB();

    await ctx.replyWithMarkdown(`✅ **MUA THÀNH CÔNG!**\n\n📦 SP: *${product.name}*\n🔑 **NỘI DUNG:**\n\`${dataPaid}\``,
        Markup.inlineKeyboard([[Markup.button.callback('🏠 Về Menu', 'back')]])
    );
    bot.telegram.sendMessage(ADMIN_ID, `🔔 KHÁCH ${uid} MUA ${product.name}`).catch(() => {});
});

// --- NẠP TIỀN ---
bot.action('deposit', async (ctx) => {
    const stk = "0362781497"; 
    const name = "NGUYEN VAN DU";
    const desc = `VIP${ctx.from.id}`;
    const qr = `https://img.vietqr.io/image/vpbank-${stk}-compact2.jpg?addInfo=${desc}&accountName=${encodeURIComponent(name)}`;
    ctx.replyWithPhoto(qr, {
        caption: `💳 **NẠP TIỀN**\n🏦 VPBANK\n🔢 STK: \`${stk}\`\n👤 Chủ TK: **${name}**\n📝 Nội dung: \`${desc}\``,
        parse_mode: 'Markdown'
    });
});

// --- ADMIN CONTROL ---
bot.on('photo', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID.toString()) return;
    const caption = ctx.message.caption;
    if (caption && caption.startsWith('/add')) {
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
        ctx.reply("✅ Đã thêm sản phẩm!");
    }
});

bot.command('duyet', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID.toString()) return;
    const [_, targetId, amount] = ctx.message.text.split(' ');
    if (db.users[targetId]) {
        db.users[targetId].balance += parseInt(amount);
        await saveDB();
        ctx.reply(`✅ Đã nạp ${amount} cho ${targetId}`);
    }
});

bot.command('up', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID.toString()) return;
    const input = ctx.message.text.split('/up ')[1].split('|');
    const p = db.products.find(x => x.name === input[0].trim());
    if (p) {
        p.stock.push(...input[1].split(',').map(s => s.trim()));
        await saveDB();
        ctx.reply("✅ Đã cập nhật kho!");
    }
});

bot.command('backup', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID.toString()) return;
    ctx.replyWithDocument({ source: DATA_PATH });
});

bot.on('document', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID.toString()) return;
    if (ctx.message.caption === '/restore') {
        const fileLink = await bot.telegram.getFileLink(ctx.message.document.file_id);
        const response = await axios.get(fileLink.href);
        db = response.data;
        await saveDB();
        ctx.reply("✅ Đã khôi phục dữ liệu!");
    }
});

bot.action('back', async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    const uid = ctx.from.id.toString();
    ctx.replyWithMarkdown(`👋 **Chào mừng!**\n💰 Số dư: \`${money(db.users[uid].balance)}\``, mainMenu());
});

// --- KHỞI CHẠY ---
loadDB().then(() => {
    bot.launch().then(() => console.log("🚀 BOT IS RUNNING!")).catch(err => console.error(err));
});
