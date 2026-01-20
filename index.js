const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const axios = require('axios');
require('dotenv').config();

// --- KHỞI TẠO SERVER GIỮ BOT SỐNG ---
const app = express();
app.get('/', (req, res) => res.send('THUETOOLVIP BOT IS RUNNING!'));
app.listen(process.env.PORT || 3000);

// --- KẾT NỐI DATABASE ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ DB Error:', err));

// --- CẤU TRÚC DỮ LIỆU ---
const User = mongoose.model('User', {
    telegramId: String,
    username: String,
    balance: { type: Number, default: 0 },
    history: Array
});

const Product = mongoose.model('Product', {
    type: String, // 'acc', 'hack', 'key'
    name: String,
    price: Number,
    description: String,
    image: String,
    instruction: String, // Link cài đặt hoặc hướng dẫn
    stock: { type: Array, default: [] } // Danh sách acc/key để bán
});

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID; // Lấy từ biến môi trường

// --- TIỆN ÍCH ---
const money = (val) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

// --- MENU CHÍNH ---
const mainMenu = () => Markup.inlineKeyboard([
    [Markup.button.callback('🎮 Mua Acc Game', 'list_acc'), Markup.button.callback('🛠 Mua Bản Hack', 'list_hack')],
    [Markup.button.callback('🔑 Thuê Key Tool', 'list_key'), Markup.button.callback('💳 Nạp Tiền', 'deposit')],
    [Markup.button.callback('👤 Thông Tin', 'user_info'), Markup.button.callback('⚠️ Báo Lỗi', 'report')],
    [Markup.button.url('🌐 Dev', '@thuetoolvip1')]
]);

// --- XỬ LÝ LỆNH START ---
bot.start(async (ctx) => {
    let user = await User.findOne({ telegramId: ctx.from.id });
    if (!user) {
        user = new User({ telegramId: ctx.from.id, username: ctx.from.username });
        await user.save();
    }
    ctx.replyWithMarkdown(`👋 **Chào mừng ${ctx.from.first_name}!**\n💰 Số dư: \`${money(user.balance)}\`\n🛒 Chọn dịch vụ bên dưới:`, mainMenu());
});

// --- HIỂN THỊ DANH SÁCH & TRẠNG THÁI KHO ---
const renderProducts = async (ctx, type) => {
    const products = await Product.find({ type });
    if (!products.length) return ctx.reply("Hệ thống đang cập nhật hàng, vui lòng quay lại sau.");

    for (const p of products) {
        const inStock = p.stock.length;
        const caption = `📌 **${p.name}**\n💰 Giá: ${money(p.price)}\n📝 Mô tả: ${p.description}\n📊 Tình trạng: ${inStock > 0 ? `Còn ${inStock}` : '❌ Hết hàng'}`;
        
        const btns = [];
        if (inStock > 0) btns.push([Markup.button.callback(`🛒 Mua ngay`, `buy_${p._id}`)]);
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
    const user = await User.findOne({ telegramId: ctx.from.id });
    const product = await Product.findById(pId);

    if (!product || product.stock.length === 0) return ctx.answerCbQuery("❌ Đã hết hàng!");
    if (user.balance < product.price) return ctx.answerCbQuery("⚠️ Không đủ tiền, hãy nạp thêm!");

    // Trừ tiền và lấy hàng từ kho
    const dataPaid = product.stock.shift();
    user.balance -= product.price;
    await user.save();
    await product.save();

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
    bot.telegram.sendMessage(ADMIN_ID, `🔔 **THÔNG BÁO DOANH THU**\n👤 Khách: ${ctx.from.id}\n🛒 Mua: ${product.name}\n💰 Tiền: ${money(product.price)}`);
});

// --- NẠP TIỀN TỰ ĐỘNG VPBANK ---
bot.action('deposit', async (ctx) => {
    const stk = "0362781497"; // SỐ TK VPBANK
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

// --- ADMIN PANEL (THÊM HÀNG CÓ ẢNH QUA BOT) ---
// Cú pháp: /add [Loại] [Tên] [Giá] [Mô tả] [Hướng dẫn] - Sau đó gửi ảnh kèm caption
bot.on('photo', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID.toString()) return;
    
    const caption = ctx.message.caption;
    if (caption && caption.startsWith('/add')) {
        const parts = caption.split('|'); // /add type|name|price|desc|instr
        const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const photoUrl = await bot.telegram.getFileLink(photoId);

        const newP = new Product({
            type: parts[0].replace('/add ', '').trim(),
            name: parts[1].trim(),
            price: parseInt(parts[2]),
            description: parts[3].trim(),
            image: photoUrl.href,
            instruction: parts[4].trim()
        });
        await newP.save();
        ctx.reply("✅ Đã thêm sản phẩm có ảnh thành công!");
    }
});

// --- ADMIN DUYỆT TIỀN ---
bot.command('duyet', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID.toString()) return;
    const [_, targetId, amount] = ctx.message.text.split(' ');
    const user = await User.findOneAndUpdate({ telegramId: targetId }, { $inc: { balance: parseInt(amount) } }, { new: true });
    
    if (user) {
        ctx.reply(`✅ Đã nạp ${money(parseInt(amount))} cho ${targetId}`);
        bot.telegram.sendMessage(targetId, `🎉 **THÔNG BÁO NẠP TIỀN**\n\nTài khoản của bạn đã được cộng: *${money(parseInt(amount))}*\nSố dư mới: *${money(user.balance)}*`, { parse_mode: 'Markdown' });
    }
});

// --- THÊM KHO (STOCK) ---
bot.command('up', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID.toString()) return;
    const input = ctx.message.text.split('/up ')[1].split('|');
    const name = input[0].trim();
    const stockData = input[1].split(',').map(s => s.trim());

    const p = await Product.findOne({ name });
    if (p) {
        p.stock.push(...stockData);
        await p.save();
        ctx.reply(`✅ Đã nạp thêm ${stockData.length} tài khoản vào kho ${name}`);
    }
});

bot.action('back', (ctx) => ctx.editMessageCaption(`🔥 **CỬA HÀNG - MENU CHÍNH**`, mainMenu()));

bot.launch();
