const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

/**
 * ==========================================================
 * 🛡️ CẤU HÌNH TRUNG TÂM - SHOP XTABOY VN
 * ==========================================================
 */
const BOT_TOKEN = '8497777064:AAGt1C6asCO0p_T58rNDyn5ygqp1LZ6hHLA';
const ADMIN_ID = '6182555207';
const BRAND_NAME = 'SHOP XTABOY VN';
const DB_FILE = path.join(__dirname, 'database.json');

const bot = new Telegraf(BOT_TOKEN);

// Khởi tạo bộ nhớ tạm và cấu trúc dữ liệu
let db = {
    users: {},
    products: [],
    bank: { 
        stk: "0399226892", 
        name: "NGUYEN VAN TRUONG", 
        bankName: "MB" 
    },
    system: {
        welcome_id: null, // Lưu trữ File_ID của ảnh banner
        status: "🟢 Hệ thống vận hành ổn định",
        revenue: 0,
        transactions: 0
    }
};

/**
 * ==========================================================
 * 📦 LAYER 1: QUẢN LÝ DỮ LIỆU & ĐỒNG BỘ HÓA
 * ==========================================================
 */
async function initDatabase() {
    try {
        if (await fs.exists(DB_FILE)) {
            const data = await fs.readJson(DB_FILE);
            db = { ...db, ...data };
            console.log(`[${BRAND_NAME}] ✅ Đã tải cơ sở dữ liệu.`);
        } else {
            await saveToDisk();
            console.log(`[${BRAND_NAME}] 🆕 Khởi tạo file DB mới.`);
        }
    } catch (e) { console.error("Lỗi Init DB:", e); }
}

async function saveToDisk() {
    try { await fs.writeJson(DB_FILE, db, { spaces: 4 }); } 
    catch (e) { console.error("Lỗi Save DB:", e); }
}

const formatCurrency = (val) => new Intl.NumberFormat('vi-VN', { 
    style: 'currency', currency: 'VND' 
}).format(val);

/**
 * ==========================================================
 * 🔄 LAYER 2: AUTO-UPDATE ENGINE (CHẠY NGẦM)
 * ==========================================================
 */
// Hệ thống tự động kiểm tra trạng thái kho hàng sau mỗi 30 giây
setInterval(async () => {
    db.products.forEach(p => {
        p.outOfStock = p.stock.length === 0;
    });
    // Tự động sao lưu dữ liệu đề phòng Render restart
    await saveToDisk();
}, 30000);

/**
 * ==========================================================
 * 🖥️ LAYER 3: GIAO DIỆN NGƯỜI DÙNG CHUYÊN NGHIỆP
 * ==========================================================
 */
const getHomeKeyboard = () => Markup.inlineKeyboard([
    [
        Markup.button.callback('🎮 TÀI KHOẢN GAME', 'view_acc'),
        Markup.button.callback('🛠️ PHẦN MỀM HACK', 'view_hack')
    ],
    [
        Markup.button.callback('🔑 THUÊ KEY TOOL', 'view_key'),
        Markup.button.callback('💳 NẠP TIỀN VÍ', 'view_deposit')
    ],
    [
        Markup.button.callback('👤 TRANG CÁ NHÂN', 'view_profile'),
        Markup.button.callback('📜 LỊCH SỬ MUA', 'view_history')
    ],
    [
        Markup.button.url('🤝 LIÊN HỆ ADMIN', 'https://t.me/thuetoolvip1'),
        Markup.button.callback('📊 THỐNG KÊ', 'view_stats')
    ]
]);

// Xử lý lệnh /start
bot.start(async (ctx) => {
    const uid = ctx.from.id.toString();
    if (!db.users[uid]) {
        db.users[uid] = {
            id: uid,
            name: ctx.from.first_name,
            balance: 0,
            spent: 0,
            orders: [],
            joinDate: new Date().toLocaleDateString('vi-VN')
        };
        await saveToDisk();
    }

    const welcomeMsg = 
        `✨ **KÍNH CHÀO QUÝ KHÁCH ĐẾN VỚI ${BRAND_NAME}** ✨\n` +
        `──────────────────────────\n` +
        `👋 Xin chào: **${ctx.from.first_name}**\n` +
        `💰 Số dư hiện tại: \`${formatCurrency(db.users[uid].balance)}\`\n` +
        `🆔 Mã khách hàng: \`${uid}\`\n` +
        `📡 Trạng thái: \`${db.system.status}\`\n` +
        `──────────────────────────\n` +
        `Quý khách vui lòng chọn danh mục dịch vụ bên dưới để bắt đầu:`;

    if (db.system.welcome_id) {
        await ctx.replyWithPhoto(db.system.welcome_id, { caption: welcomeMsg, parse_mode: 'Markdown', ...getHomeKeyboard() });
    } else {
        await ctx.replyWithMarkdown(welcomeMsg, getHomeKeyboard());
    }
});

/**
 * ==========================================================
 * 🛍️ LAYER 4: MODULE BÁN HÀNG TỰ ĐỘNG
 * ==========================================================
 */
const renderProductCategory = async (ctx, category) => {
    const items = db.products.filter(p => p.type === category);
    if (items.length === 0) return ctx.reply("🏮 Danh mục này đang được cập nhật sản phẩm. Quý khách vui lòng quay lại sau!");

    for (const p of items) {
        const stockSize = p.stock.length;
        const infoMsg = 
            `💎 **SẢN PHẨM: ${p.name.toUpperCase()}**\n` +
            `────────────────────\n` +
            `💰 Giá bán: \`${formatCurrency(p.price)}\`\n` +
            `📝 Mô tả: ${p.description}\n` +
            `📊 Kho hàng: ${stockSize > 0 ? `✅ Còn ${stockSize}` : '❌ Hết hàng'}\n` +
            `────────────────────`;

        const actionBtns = stockSize > 0 
            ? [[Markup.button.callback('🛒 MUA NGAY', `buy_${p.id}`)], [Markup.button.callback('⬅️ QUAY LẠI', 'nav_back')]]
            : [[Markup.button.callback('⬅️ QUAY LẠI', 'nav_back')]];

        if (p.image) {
            await ctx.replyWithPhoto(p.image, { caption: infoMsg, parse_mode: 'Markdown', ...Markup.inlineKeyboard(actionBtns) });
        } else {
            await ctx.replyWithMarkdown(infoMsg, Markup.inlineKeyboard(actionBtns));
        }
    }
};

bot.action('view_acc', ctx => renderProductCategory(ctx, 'acc'));
bot.action('view_hack', ctx => renderProductCategory(ctx, 'hack'));
bot.action('view_key', ctx => renderProductCategory(ctx, 'key'));

// Xử lý thanh toán
bot.action(/^buy_(.+)$/, async (ctx) => {
    const pId = ctx.match[1];
    const uid = ctx.from.id.toString();
    const p = db.products.find(x => x.id === pId);

    if (!p || p.stock.length === 0) return ctx.answerCbQuery("🏮 Xin lỗi, sản phẩm vừa hết hàng!");
    if (db.users[uid].balance < p.price) return ctx.answerCbQuery("⚠️ Tài khoản không đủ số dư. Vui lòng nạp thêm!", { show_alert: true });

    // Trừ tiền và lấy mã
    const deliveredCode = p.stock.shift();
    db.users[uid].balance -= p.price;
    db.users[uid].spent += p.price;
    db.users[uid].orders.push({ name: p.name, code: deliveredCode, time: new Date().toLocaleString('vi-VN') });
    
    db.system.revenue += p.price;
    db.system.transactions += 1;
    await saveToDisk();

    await ctx.replyWithMarkdown(
        `✅ **THANH TOÁN THÀNH CÔNG**\n` +
        `────────────────────\n` +
        `📦 Sản phẩm: *${p.name}*\n` +
        `💰 Số dư còn lại: *${formatCurrency(db.users[uid].balance)}*\n` +
        `────────────────────\n` +
        `🔑 **NỘI DUNG SẢN PHẨM:**\n\n` +
        `\`${deliveredCode}\`\n\n` +
        `────────────────────\n` +
        `📌 **HƯỚNG DẪN:** ${p.instruction}`,
        Markup.inlineKeyboard([[Markup.button.callback('🏠 VỀ TRANG CHỦ', 'nav_back')]])
    );

    bot.telegram.sendMessage(ADMIN_ID, `💰 **DOANH THU MỚI:**\n👤 Khách: ${uid}\n🛍️ Mua: ${p.name}\n💵 Thu: ${formatCurrency(p.price)}`);
});

/**
 * ==========================================================
 * 💳 LAYER 5: MODULE NẠP TIỀN & THÔNG TIN
 * ==========================================================
 */
bot.action('view_deposit', async (ctx) => {
    const { stk, name, bankName } = db.bank;
    const memo = `XTABOY${ctx.from.id}`;
    const qrUrl = `https://img.vietqr.io/image/${bankName}-${stk}-compact2.jpg?addInfo=${memo}&accountName=${encodeURIComponent(name)}`;
    
    const depositMsg = 
        `💳 **HỆ THỐNG NẠP TIỀN VÍ**\n` +
        `────────────────────\n` +
        `🏦 Ngân hàng: **${bankName}**\n` +
        `🔢 Số tài khoản: \`${stk}\`\n` +
        `👤 Chủ tài khoản: **${name}**\n` +
        `📝 Nội dung nạp: \`${memo}\` (Bắt buộc)\n` +
        `────────────────────\n` +
        `⚠️ **LƯU Ý:**\n` +
        `- Chuyển khoản đúng nội dung để được cộng tiền tự động.\n` +
        `- Tiền sẽ được cộng sau 1-3 phút khi hệ thống nhận được.`;

    ctx.replyWithPhoto(qrUrl, { caption: depositMsg, parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ QUAY LẠI', 'nav_back')]]) });
});

bot.action('view_profile', ctx => {
    const u = db.users[ctx.from.id.toString()];
    const msg = `👤 **THÔNG TIN KHÁCH HÀNG**\n──────────────────\n🆔 ID: \`${u.id}\`\n💰 Số dư: *${formatCurrency(u.balance)}*\n💸 Đã chi: *${formatCurrency(u.spent)}*\n📅 Ngày tham gia: *${u.joinDate}*`;
    ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([[Markup.button.callback('🏠 VỀ TRANG CHỦ', 'nav_back')]]));
});

bot.action('view_history', ctx => {
    const u = db.users[ctx.from.id.toString()];
    if (u.orders.length === 0) return ctx.answerCbQuery("🏮 Quý khách chưa mua sản phẩm nào!");
    let log = "📜 **LỊCH SỬ 5 ĐƠN HÀNG GẦN NHẤT**\n\n";
    u.orders.slice(-5).reverse().forEach((o, i) => {
        log += `${i+1}. 📦 *${o.name}*\n🔑 \`${o.code}\`\n⏰ ${o.time}\n\n`;
    });
    ctx.replyWithMarkdown(log, Markup.inlineKeyboard([[Markup.button.callback('⬅️ QUAY LẠI', 'nav_back')]]));
});

/**
 * ==========================================================
 * 👑 LAYER 6: QUYỀN HẠN QUẢN TRỊ VIÊN (ADMIN SUPREME)
 * ==========================================================
 */
const checkIsAdmin = (ctx) => ctx.from.id.toString() === ADMIN_ID;

// Xử lý gửi ảnh trực tiếp từ Telegram (Tự up ảnh)
bot.on('photo', async (ctx) => {
    if (!checkIsAdmin(ctx)) return;
    const caption = ctx.message.caption || "";
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

    // Thiết lập ảnh bìa Start
    if (caption === '/setbanner') {
        db.system.welcome_id = fileId;
        await saveToDisk();
        return ctx.reply("✨ [Hệ thống] Đã cập nhật ảnh bìa thành công!");
    }

    // Thêm sản phẩm kèm ảnh: /add loại|tên|giá|mô tả|hd
    if (caption.startsWith('/add')) {
        try {
            const [type, name, price, desc, inst] = caption.replace('/add ', '').split('|').map(s => s.trim());
            db.products.push({
                id: Date.now().toString(),
                type: type, // acc, hack, key
                name: name,
                price: parseInt(price),
                description: desc,
                instruction: inst,
                image: fileId,
                stock: []
            });
            await saveToDisk();
            ctx.reply(`✅ Đã niêm yết: **${name}**`);
        } catch (e) { ctx.reply("❌ Lỗi định dạng! Mẫu: /add loại|tên|giá|mô tả|hd"); }
    }
});

// Duyệt tiền cho khách: /duyet [ID] [Tiền]
bot.command('duyet', async (ctx) => {
    if (!checkIsAdmin(ctx)) return;
    const [_, uid, amt] = ctx.message.text.split(' ');
    if (db.users[uid]) {
        db.users[uid].balance += parseInt(amt);
        await saveToDisk();
        ctx.reply(`✅ Đã nạp ${formatCurrency(amt)} cho ID: ${uid}`);
        bot.telegram.sendMessage(uid, `🎉 **${BRAND_NAME} THÔNG BÁO:**\nTài khoản của quý khách đã được cộng thành công: **${formatCurrency(amt)}**.\nChúc quý khách mua sắm vui vẻ!`);
    } else ctx.reply("❌ Sai ID!");
});

// Nạp kho: /up [Tên SP] | [Mã1, Mã2...]
bot.command('up', async (ctx) => {
    if (!checkIsAdmin(ctx)) return;
    try {
        const [name, rawData] = ctx.message.text.replace('/up ', '').split('|').map(s => s.trim());
        const p = db.products.find(x => x.name.toLowerCase() === name.toLowerCase());
        if (p) {
            const list = rawData.split(',').map(s => s.trim());
            p.stock.push(...list);
            await saveToDisk();
            ctx.reply(`✅ Đã nạp thêm ${list.length} mã vào kho **${name}**`);
        } else ctx.reply("❌ Không tìm thấy sản phẩm này.");
    } catch (e) { ctx.reply("❌ Cú pháp: /up Tên SP | mã1, mã2"); }
});

// Thông báo toàn dân: /all [Nội dung]
bot.command('all', async (ctx) => {
    if (!checkIsAdmin(ctx)) return;
    const text = ctx.message.text.replace('/all ', '');
    const userIds = Object.keys(db.users);
    ctx.reply(`🚀 Bắt đầu gửi thông báo tới ${userIds.length} người...`);
    for (const uid of userIds) {
        try {
            await bot.telegram.sendMessage(uid, `📣 **THÔNG BÁO TỪ ADMIN**\n\n${text}`, { parse_mode: 'Markdown' });
        } catch (e) {}
    }
    ctx.reply("✅ Đã hoàn tất chiến dịch thông báo.");
});

bot.command('thongke', (ctx) => {
    if (checkIsAdmin(ctx)) ctx.reply(`📊 **THỐNG KÊ DOANH THU**\n\n💰 Tổng thu: ${formatCurrency(db.system.revenue)}\n🛍️ Số đơn: ${db.system.transactions}\n👤 Tổng khách: ${Object.keys(db.users).length}`);
});

bot.action('nav_back', async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    bot.handleUpdate({ message: { ...ctx.update.callback_query.message, text: '/start', from: ctx.from }, update_id: 0 });
});

/**
 * ==========================================================
 * 🌐 LAYER 7: SERVER WEB & KHỞI CHẠY
 * ==========================================================
 */
const app = express();
app.get('/', (req, res) => res.send(`${BRAND_NAME} System Active`));
app.listen(process.env.PORT || 3000);

initDatabase().then(() => {
    bot.launch();
    console.log(`🚀 [${BRAND_NAME}] ĐÃ TRỰC TUYẾN!`);
});
