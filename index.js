const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const cron = require('node-cron');

/**
 * ==========================================================
 * 🛡️ CẤU HÌNH HỆ THỐNG GỐC - SHOP XTABOY VN
 * ==========================================================
 */
const BOT_TOKEN = '8497777064:AAGt1C6asCO0p_T58rNDyn5ygqp1LZ6hHLA';
const ADMIN_ID = '6182555207';
const BRAND_NAME = 'SHOP XTABOY VN';

const DATA_PATH = path.join(__dirname, 'database.json');
const bot = new Telegraf(BOT_TOKEN);

// Khởi tạo trạng thái hệ thống
let db = {
    users: {},
    products: [],
    bank: { stk: "0399226892", name: "NGUYEN VAN TRUONG", bankName: "MB" },
    config: { 
        welcome_image: null, 
        status: "🚀 Hoạt động", 
        version: "2.0.5",
        last_update: new Date().toLocaleString('vi-VN')
    },
    logs: []
};

/**
 * ==========================================================
 * 📦 MODULE 1: QUẢN LÝ DỮ LIỆU & AUTO-SAVE
 * ==========================================================
 */
async function syncDatabase() {
    try {
        if (await fs.exists(DATA_PATH)) {
            const currentData = await fs.readJson(DATA_PATH);
            db = { ...db, ...currentData };
            console.log(`[${BRAND_NAME}] 📥 Đồng bộ cơ sở dữ liệu hoàn tất.`);
        } else {
            await saveDatabase();
        }
    } catch (err) { console.error(`[${BRAND_NAME}] ❌ Lỗi đồng bộ:`, err); }
}

async function saveDatabase() {
    try { 
        db.config.last_update = new Date().toLocaleString('vi-VN');
        await fs.writeJson(DATA_PATH, db, { spaces: 4 }); 
    } catch (err) { console.error(`[${BRAND_NAME}] ❌ Lỗi lưu trữ:`, err); }
}

const toVND = (val) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val);

/**
 * ==========================================================
 * 🤖 MODULE 2: AUTO-UPDATE & SYSTEM MAINTENANCE
 * ==========================================================
 */
// Tự động kiểm tra hệ thống mỗi phút (Auto Update Status)
cron.schedule('* * * * *', async () => {
    console.log(`[${BRAND_NAME}] 🔄 Đang thực thi Auto-Update hệ thống...`);
    // Kiểm tra hàng tồn kho, nếu hết hàng tự động cập nhật trạng thái
    db.products.forEach(p => {
        if (p.stock.length === 0) p.status = "Hết hàng";
        else p.status = "Còn hàng";
    });
    await saveDatabase();
});

/**
 * ==========================================================
 * 🖥️ MODULE 3: GIAO DIỆN NGƯỜI DÙNG (PREMIUM UI)
 * ==========================================================
 */
const MainMenuKeyboard = () => Markup.inlineKeyboard([
    [Markup.button.callback('🎮 TÀI KHOẢN GAME', 'nav_acc'), Markup.button.callback('🛠️ PHẦN MỀM HACK', 'nav_hack')],
    [Markup.button.callback('🔑 THUÊ KEY TOOL', 'nav_key'), Markup.button.callback('💳 NẠP TIỀN VÍ', 'nav_deposit')],
    [Markup.button.callback('👤 THÔNG TIN', 'nav_profile'), Markup.button.callback('📜 LỊCH SỬ', 'nav_history')],
    [Markup.button.url('🤝 HỖ TRỢ TRỰC TUYẾN', 'https://t.me/thuetoolvip1')]
]);

/**
 * ==========================================================
 * 🤖 MODULE 4: XỬ LÝ LỆNH NGƯỜI DÙNG
 * ==========================================================
 */

bot.start(async (ctx) => {
    const uid = ctx.from.id.toString();
    if (!db.users[uid]) {
        db.users[uid] = { id: uid, balance: 0, totalBuy: 0, history: [], date: new Date().toLocaleDateString('vi-VN') };
        await saveDatabase();
    }

    const welcomeMsg = 
        `✨ **XIN CHÀO QUÝ KHÁCH ĐẾN VỚI ${BRAND_NAME}** ✨\n` +
        `──────────────────────────\n` +
        `👋 Quý khách: **${ctx.from.first_name}**\n` +
        `💰 Số dư hiện tại: \`${toVND(db.users[uid].balance)}\`\n` +
        `🆔 Mã định danh: \`${uid}\`\n` +
        `📡 Trạng thái: \`${db.config.status}\`\n` +
        `──────────────────────────\n` +
        `Chúng tôi tự hào là đơn vị cung cấp giải pháp Game tự động hàng đầu. Vui lòng chọn dịch vụ:`;

    if (db.config.welcome_image) {
        await ctx.replyWithPhoto(db.config.welcome_image, { caption: welcomeMsg, parse_mode: 'Markdown', ...MainMenuKeyboard() });
    } else {
        await ctx.replyWithMarkdown(welcomeMsg, MainMenuKeyboard());
    }
});

// Xử lý xem danh sách sản phẩm
const renderList = async (ctx, type) => {
    const list = db.products.filter(p => p.type === type);
    if (list.length === 0) return ctx.reply("🏮 Danh mục này hiện đang trong quá trình bảo trì. Xin quý khách vui lòng quay lại sau!");

    for (const item of list) {
        const stock = item.stock.length;
        const msg = `💎 **SẢN PHẨM: ${item.name.toUpperCase()}**\n` +
                    `────────────────────\n` +
                    `💰 Giá niêm yết: \`${toVND(item.price)}\`\n` +
                    `📝 Mô tả: ${item.description}\n` +
                    `📊 Tình trạng: ${stock > 0 ? `✅ Còn ${stock}` : '❌ Tạm hết hàng'}\n` +
                    `────────────────────`;
        
        const btns = stock > 0 ? [[Markup.button.callback('🛒 MUA NGAY', `buy_${item.id}`)], [Markup.button.callback('⬅️ QUAY LẠI', 'back')]] : [[Markup.button.callback('⬅️ QUAY LẠI', 'back')]];
        
        if (item.image) await ctx.replyWithPhoto(item.image, { caption: msg, parse_mode: 'Markdown', ...Markup.inlineKeyboard(btns) });
        else await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard(btns));
    }
};

bot.action('nav_acc', ctx => renderList(ctx, 'acc'));
bot.action('nav_hack', ctx => renderList(ctx, 'hack'));
bot.action('nav_key', ctx => renderList(ctx, 'key'));

// Xử lý nạp tiền chuyên nghiệp
bot.action('nav_deposit', async (ctx) => {
    const { stk, name, bankName } = db.bank;
    const memo = `XTABOY${ctx.from.id}`;
    const qr = `https://img.vietqr.io/image/${bankName}-${stk}-compact2.jpg?addInfo=${memo}&accountName=${encodeURIComponent(name)}`;
    
    ctx.replyWithPhoto(qr, { 
        caption: `💳 **THÔNG TIN THANH TOÁN TỰ ĐỘNG**\n\n` +
                 `🏦 Ngân hàng: **${bankName}**\n` +
                 `🔢 Số tài khoản: \`${stk}\`\n` +
                 `👤 Chủ tài khoản: **${name}**\n` +
                 `📝 Nội dung chuyển: \`${memo}\` (Bắt buộc)\n\n` +
                 `⚠️ **GHI CHÚ:** Hệ thống tự động kiểm tra giao dịch mỗi 60 giây. Quý khách vui lòng chuyển đúng nội dung.`,
        parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ QUAY LẠI', 'back')]])
    });
});

/**
 * ==========================================================
 * 👑 MODULE 5: QUẢN TRỊ VIÊN CẤP CAO (ADMIN SUPREME)
 * ==========================================================
 */
const isAdmin = (ctx) => ctx.from.id.toString() === ADMIN_ID;

// --- XỬ LÝ HÌNH ẢNH TỰ ĐỘNG (AUTO-UP) ---
bot.on('photo', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const caption = ctx.message.caption || "";
    const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;

    // Lệnh 1: Thiết lập Banner Start
    if (caption === '/setbanner') {
        db.config.welcome_image = photoId;
        await saveDatabase();
        return ctx.reply("✨ [Hệ thống] Đã cập nhật ảnh đại diện Shop thành công!");
    }

    // Lệnh 2: Thêm sản phẩm kèm ảnh trực tiếp
    if (caption.startsWith('/add')) {
        try {
            const [type, name, price, desc, inst] = caption.replace('/add ', '').split('|').map(s => s.trim());
            db.products.push({ 
                id: Date.now().toString(), 
                type, name, 
                price: parseInt(price), 
                description: desc, 
                instruction: inst, 
                image: photoId, 
                stock: [] 
            });
            await saveDatabase();
            ctx.reply(`✅ Đã niêm yết thành công sản phẩm: **${name}**`);
        } catch (e) { ctx.reply("❌ Lỗi định dạng! Vui lòng dùng: /add loại|tên|giá|mô tả|hd"); }
    }
});

// --- CÁC LỆNH ĐIỀU KHIỂN HỆ THỐNG ---

// Cài đặt trạng thái Shop: /setstatus [Nội dung]
bot.command('setstatus', async (ctx) => {
    if (!isAdmin(ctx)) return;
    db.config.status = ctx.message.text.replace('/setstatus ', '');
    await saveDatabase();
    ctx.reply("✅ Đã cập nhật trạng thái hệ thống!");
});

// Kiểm tra kho hàng nhanh: /checkstock
bot.command('checkstock', async (ctx) => {
    if (!isAdmin(ctx)) return;
    let report = "📊 **BÁO CÁO KHO HÀNG**\n\n";
    db.products.forEach(p => {
        report += `• ${p.name}: ${p.stock.length} sản phẩm\n`;
    });
    ctx.reply(report);
});

// Duyệt tiền: /duyet [ID] [Tiền]
bot.command('duyet', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const [_, uid, amt] = ctx.message.text.split(' ');
    if (db.users[uid]) {
        db.users[uid].balance += parseInt(amt);
        await saveDatabase();
        ctx.reply(`✅ Đã nạp ${toVND(amt)} vào ID: ${uid}`);
        bot.telegram.sendMessage(uid, `🎉 **${BRAND_NAME} XIN THÔNG BÁO:**\nTài khoản của quý khách đã được cộng thành công: **${toVND(amt)}**.\nChúc quý khách mua sắm vui vẻ!`);
    }
});

// Cập nhật hàng loạt: /up [Tên SP] | [Mã1, Mã2, Mã3]
bot.command('up', async (ctx) => {
    if (!isAdmin(ctx)) return;
    try {
        const [name, rawStock] = ctx.message.text.replace('/up ', '').split('|').map(s => s.trim());
        const product = db.products.find(x => x.name === name);
        if (product) {
            const items = rawStock.split(',').map(s => s.trim());
            product.stock.push(...items);
            await saveDatabase();
            ctx.reply(`✅ Đã nạp thêm ${items.length} đơn vị hàng vào kho **${name}**`);
        }
    } catch (e) { ctx.reply("❌ Cú pháp: /up Tên SP | mã1, mã2"); }
});

// Sao lưu khẩn cấp: /backup
bot.command('backup', (ctx) => {
    if (isAdmin(ctx)) ctx.replyWithDocument({ source: DATA_PATH }, { caption: `📅 Backup ${BRAND_NAME} - ${new Date().toLocaleString()}` });
});

/**
 * ==========================================================
 * 📁 MODULE 6: TIỆN ÍCH NGƯỜI DÙNG & LỊCH SỬ
 * ==========================================================
 */
bot.action('nav_profile', ctx => {
    const user = db.users[ctx.from.id.toString()];
    ctx.replyWithMarkdown(`👤 **THÔNG TIN TÀI KHOẢN**\n──────────────────\n🆔 Mã khách hàng: \`${ctx.from.id}\`\n💰 Số dư ví: *${toVND(user.balance)}*\n📅 Ngày đăng ký: *${user.date}*\n──────────────────`, Markup.inlineKeyboard([[Markup.button.callback('🏠 TRỞ LẠI', 'back')]]));
});

bot.action('nav_history', ctx => {
    const user = db.users[ctx.from.id.toString()];
    if (!user.history || user.history.length === 0) return ctx.answerCbQuery("🏮 Quý khách chưa có giao dịch nào!");
    let log = "📜 **LỊCH SỬ GIAO DỊCH GẦN NHẤT**\n\n";
    user.history.slice(-5).forEach(h => {
        log += `🛒 ${h.name}\n💰 Giá: ${toVND(h.price)}\n⏰ ${h.time}\n\n`;
    });
    ctx.reply(log, Markup.inlineKeyboard([[Markup.button.callback('🏠 TRỞ LẠI', 'back')]]));
});

bot.action('back', async (ctx) => {
    try { await ctx.deleteMessage(); } catch (e) {}
    bot.handleUpdate({ message: { ...ctx.update.callback_query.message, text: '/start', from: ctx.from }, update_id: 0 });
});

/**
 * ==========================================================
 * 🌐 MODULE 7: KHỞI TẠO SERVER & KẾT NỐI
 * ==========================================================
 */
const app = express();
app.get('/', (req, res) => res.send(`🤖 ${BRAND_NAME} Automation System is Working...`));
app.listen(process.env.PORT || 3000);

syncDatabase().then(() => {
    bot.launch();
    console.log(`🚀 [${BRAND_NAME}] HỆ THỐNG ĐÃ ONLINE - VERSION ${db.config.version}`);
});
