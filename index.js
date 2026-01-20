const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

// --- CẤU HÌNH ĐƯỜNG DẪN FILE DỮ LIỆU ---
const DATA_PATH = path.join(__dirname, 'database.json');

// --- KHỞI TẠO SERVER GIỮ BOT SỐNG ---
const app = express();
app.get('/', (req, res) => res.send('THUETOOLVIP BOT IS RUNNING WITH JSON!'));
app.listen(process.env.PORT || 3000);

// --- HỆ THỐNG QUẢN LÝ DỮ LIỆU JSON ---
let db = {
    users: {},    // Lưu thông tin người dùng
    products: []  // Lưu danh sách sản phẩm
};

// Hàm tải dữ liệu từ file
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

// Hàm lưu dữ liệu vào file
async function saveDB() {
    try {
        await fs.writeJson(DATA_PATH, db, { spaces: 2 });
    } catch (err) {
        console.error('❌ Lỗi lưu DB:', err);
    }
}

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID; 

// --- TIỆN ÍCH ---
const money = (val) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

// --- MENU CHÍNH ---
const mainMenu = () => Markup.inlineKeyboard([
    [Markup.button.callback('🎮 Mua Acc Game', 'list_acc'), Markup.button.callback('🛠 Mua Bản Hack', 'list_hack')],
    [Markup.button.callback('🔑 Thuê Key Tool', 'list_key'), Markup.button.callback('💳 Nạp Tiền', 'deposit')],
    [Markup.button.callback('👤 Thông Tin', 'user_info'), Markup.button.callback('⚠️ Báo Lỗi', 'report')],
    [Markup.button.url('🌐 Admin', '@thuetoolvip1')]
]);

// --- XỬ LÝ LỆNH START ---
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

// --- HIỂN THỊ DANH SÁCH & TRẠNG THÁI KHO ---
const renderProducts = async (ctx, type) => {
    const products = db.products.filter(p => p.type === type);
    if (!products.length) return ctx.reply("Hệ thống đang cập nhật hàng, vui lòng quay lại sau.");

    for (const p of products) {
        const inStock = p.stock.length;
        const caption = `📌 **${p.name}**\n💰 Giá: ${money(p.price)}\n📝 Mô tả: ${p.description}\n📊 Tình trạng: ${inStock > 0 ? `Còn ${inStock}` : '❌ Hết hàng'}`;
        
        const btns = [];
        if (inStock > 0) btns.push([Markup.button.callback(`🛒 Mua ngay`, `buy_${p.id}`)]);
        btns.push([Markup.button.callback('⬅️ Quay lại', 'back')]);

        if (p.image) {
            await ctx.replyWithPhoto(p.image, { caption, parse_mode: 'Markdown', ...Markup.inlineKeyboard(btns) });
        } else {
            await ctx.replyWithMarkdown(caption, Markup.inlineKeyboard(btns));
        }
    }
};

bot.action('list_acc', (ctx) => renderProducts(ctx, 'acc'));
bot.action('list_hack', (ctx) => renderProducts(ctx, 'hack'));
bot.action('list_key', (ctx) => renderProducts(ctx, 'key'));

// --- XỬ LÝ THANH TOÁN & TRẢ HÀNG ---
bot.action(/^buy_(.+)$/, async (ctx) => {
    const pId = ctx.match[1];
    const uid = ctx.from.id.toString();
    const user = db.users[uid];
    const product = db.products.find(p => p.id === pId);

    if (!product || product.stock.length === 0) return ctx.answerCbQuery("❌ Đã hết hàng!");
    if (user.balance < product.price) return ctx.answerCbQuery("⚠️ Không đủ tiền, hãy nạp thêm!");

    // Trừ tiền và lấy hàng từ kho
    const dataPaid = product.stock.shift();
    user.balance -= product.price;
    user.history.push({ name: product.name, date: new Date() });
    
    await saveDB();

    // THÔNG BÁO CHO NGƯỜI MUA
    await ctx.replyWithMarkdown(
        `✅ **GIAO DỊCH THÀNH CÔNG!**\n\n` +
        `📦 Sản phẩm: *${product.name}*\n` +
        `💰 Đã thanh toán: *${money(product.price)}*\n` +
        `--------------------------\n` +
        `🔑 **NỘI DUNG SẢN PHẨM (COPY DƯỚI ĐÂY):**\n` +
        `\`${dataPaid}\`\n` +
        `--------------------------\n` +
        `📖 **HƯỚNG DẪN & LINK CÀI ĐẶT:**\n${product.instruction || 'Liên hệ Admin'}`,
        Markup.inlineKeyboard([[Markup.button.callback('🏠 Về Menu', 'back')]])
    );

    // THÔNG BÁO CHO ADMIN
    bot.telegram.sendMessage(ADMIN_ID, `🔔 **THÔNG BÁO DOANH THU**\n👤 Khách: ${uid}\n🛒 Mua: ${product.name}\n💰 Tiền: ${money(product.price)}`);
});

// --- NẠP TIỀN TỰ ĐỘNG VPBANK ---
bot.action('deposit', async (ctx) => {
    const stk = "0362781497"; 
    const name = "NGUYEN VAN DU";
    const desc = `VIP${ctx.from.id}`;
    const qr = `https://img.vietqr.io/image/vpbank-${stk}-compact2.jpg?addInfo=${desc}&accountName=${encodeURIComponent(name)}`;

    ctx.replyWithPhoto(qr, {
        caption: `💳 **NẠP TIỀN TỰ ĐỘNG (VPBANK)**\n\n` +
        `🏦 Ngân hàng: **VPBANK**\n` +
        `🔢 Số TK: \`${stk}\`\n` +
        `👤 Chủ TK: **${name}**\n` +
        `📝 Nội dung: \`${desc}\` (Bắt buộc)\n\n` +
        `*Hệ thống tự động cộng tiền sau khi nhận được chuyển khoản.*`,
        parse_mode: 'Markdown'
    });
});

// --- ADMIN PANEL: THÊM HÀNG ---
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
            image: photoId, // Sử dụng file_id để gửi ảnh nhanh hơn
            instruction: parts[4].trim(),
            stock: []
        });
        await saveDB();
        ctx.reply("✅ Đã thêm sản phẩm mới thành công!");
    }
});

// --- ADMIN PANEL: DUYỆT TIỀN ---
bot.command('duyet', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID.toString()) return;
    const [_, targetId, amount] = ctx.message.text.split(' ');
    if (db.users[targetId]) {
        db.users[targetId].balance += parseInt(amount);
        await saveDB();
        ctx.reply(`✅ Đã nạp ${money(parseInt(amount))} cho ${targetId}`);
        bot.telegram.sendMessage(targetId, `🎉 **THÔNG BÁO NẠP TIỀN**\n\nTài khoản của bạn đã được cộng: *${money(parseInt(amount))}*\nSố dư mới: *${money(db.users[targetId].balance)}*`, { parse_mode: 'Markdown' });
    } else {
        ctx.reply("❌ Không tìm thấy User ID này!");
    }
});

// --- ADMIN PANEL: THÊM KHO (STOCK) ---
bot.command('up', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID.toString()) return;
    const input = ctx.message.text.split('/up ')[1].split('|');
    const name = input[0].trim();
    const stockData = input[1].split(',').map(s => s.trim());

    const p = db.products.find(x => x.name === name);
    if (p) {
        p.stock.push(...stockData);
        await saveDB();
        ctx.reply(`✅ Đã nạp thêm ${stockData.length} tài khoản vào kho ${name}`);
    }
});

// --- HỆ THỐNG SAO LƯU (BACKUP/RESTORE) ---
bot.command('backup', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID.toString()) return;
    await saveDB();
    await ctx.replyWithDocument({ source: DATA_PATH }, { caption: "📂 **BẢN SAO LƯU DỮ LIỆU (database.json)**" });
});

bot.on('document', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID.toString()) return;
    if (ctx.message.caption === '/restore') {
        const fileLink = await bot.telegram.getFileLink(ctx.message.document.file_id);
        const response = await axios.get(fileLink.href);
        db = response.data;
        await saveDB();
        ctx.reply("✅ **KHÔI PHỤC DỮ LIỆU THÀNH CÔNG!**");
    }
});

bot.action('user_info', async (ctx) => {
    const user = db.users[ctx.from.id.toString()];
    ctx.replyWithMarkdown(`👤 **THÔNG TIN TÀI KHOẢN**\n\n🆔 ID: \`${ctx.from.id}\`\n💰 Số dư: *${money(user.balance)}*`);
});

bot.action('back', (ctx) => {
    const uid = ctx.from.id.toString();
    ctx.editMessageCaption(`👋 **Chào mừng ${ctx.from.first_name}!**\n💰 Số dư: \`${money(db.users[uid].balance)}\``, mainMenu());
});

// Chạy khởi động
loadDB().then(() => {
    bot.launch();
    console.log("🚀 BOT IS RUNNING WITHOUT MONGO!");
});
