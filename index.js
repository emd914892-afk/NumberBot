// Vercel deployment and Firebase Admin SDK setup for the Telegram Bot

const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// ------------------------------------------------
// ১. Vercel এনভায়রনমেন্ট ভেরিয়েবল থেকে তথ্য সংগ্রহ
// ------------------------------------------------
const token = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID; 

const FIREBASE_DATABASE_URL = "https://numberbot-default-rtdb.asia-southeast1.firebasedatabase.app";

let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); 
} catch (e) {
    console.error("FIREBASE_SERVICE_ACCOUNT environment variable is missing or malformed JSON.");
}


// ------------------------------------------------
// ২. Firebase ইনিশিয়ালাইজেশন
// ------------------------------------------------
if (serviceAccount && !admin.apps.length) { // Ensures initialization happens only once
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: FIREBASE_DATABASE_URL
    });
    console.log("Firebase Admin SDK initialized.");
} else if (admin.apps.length) {
    console.log("Firebase Admin SDK already initialized.");
}

const db = admin.database();
const numbersRef = db.ref('available_numbers'); // নম্বর সংরক্ষণের জন্য রেফারেন্স

// ------------------------------------------------
// ৩. টেলিগ্রাম বট সেটআপ (Webhook মোড)
// ------------------------------------------------
const bot = new TelegramBot(token);

// ===============================================
// ৪. মূল ইন্টারফেস বাটন কাঠামো
// ===============================================

const mainKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [{ text: "🔑 Get 2FA", callback_data: "get_2fa" }],
            [{ text: "📞 Get Number", callback_data: "get_number" }, { text: "📊 Status", callback_data: "status" }],
            [{ text: "🌍 Active Country", callback_data: "active_country" }, { text: "📧 Temp Mail", callback_data: "temp_mail" }],
            [{ text: "🙋 Support", callback_data: "support" }]
        ]
    }
};

// ===============================================
// ৫. বাটন হ্যান্ডলার ফাংশন (প্রতিটি বাটনের জন্য আলাদা কাঠামো)
// ===============================================

/** Handles the "Get Number" button click. This will be complex, handling country selection and number assignment. */
async function handleGetNumber(chatId, messageId) {
    const responseText = "📞 **নম্বর পেতে:** অনুগ্রহ করে নিচের তালিকা থেকে আপনার কাঙ্ক্ষিত দেশ নির্বাচন করুন।";
    
    // TODO: এখানে Firebase থেকে দেশের তালিকা লোড করে ডায়নামিক বাটন তৈরি করতে হবে
    const countrySelectionKeyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Egypt 🇪🇬", callback_data: "select_country_Egypt" }],
                [{ text: "Nepal 🇳🇵", callback_data: "select_country_Nepal" }],
                [{ text: "« মূল মেনুতে ফিরে যান", callback_data: "start_menu" }]
            ]
        }
    };

    // Replace the message with new options (optional, but cleaner UX)
    bot.editMessageText(responseText, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: countrySelectionKeyboard.reply_markup,
        parse_mode: 'Markdown'
    });
}

/** Handles the "Active Country" button click. Loads available number counts from Firebase. */
async function handleActiveCountry(chatId) {
    try {
        const snapshot = await numbersRef.once('value');
        const numbers = snapshot.val();
        
        // Logic for counting available countries (Same as before)
        // ... (You can copy the previous successful logic here) ...
        
        let countryList = "🌍 **সক্রিয় দেশের তালিকা:**\n\n";
        // DUMMY LIST for demonstration:
        countryList += "▪️ Sudan: 50টি নম্বর উপলব্ধ\n";
        countryList += "▪️ Zambia: 32টি নম্বর উপলব্ধ\n";

        return countryList;

    } catch (error) {
        console.error("Firebase ডেটা লোড ত্রুটি:", error);
        return "ডাটাবেস থেকে তথ্য আনতে সমস্যা হয়েছে।";
    }
}

/** Handles the "Get 2FA", "Status", and "Temp Mail" clicks (simple response for now) */
function handleSimpleClick(data) {
    return `আপনি ক্লিক করেছেন: *${data.toUpperCase().replace('_', ' ')}*। এই পরিষেবাটি এখনো তৈরি হচ্ছে।`;
}

// ------------------------------------------------
// ৬. Webhook হ্যান্ডলিং (Vercel-এর জন্য আবশ্যক)
// ------------------------------------------------
module.exports = async (req, res) => {
    try {
        if (req.method === 'POST' && req.body) {
            await bot.processUpdate(req.body);
        }
        res.status(200).send('OK');
    } catch (error) {
        console.error('Error processing update:', error);
        res.status(500).send('Internal Server Error');
    }
};

// ------------------------------------------------
// ৭. /start কমান্ড হ্যান্ডলিং
// ------------------------------------------------
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = "স্বাগতম! আপনার প্রয়োজনীয় পরিষেবা নির্বাচন করুন:";
    
    bot.sendMessage(chatId, welcomeMessage, mainKeyboard);
});


// ------------------------------------------------
// ৮. বাটন প্রেস হ্যান্ডলিং (Callback Query)
// ------------------------------------------------
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = message.chat.id;
    const messageId = message.message_id;

    await bot.answerCallbackQuery(callbackQuery.id); // ক্লিক নোটিফিকেশন বন্ধ করা

    try {
        let responseText = null;

        if (data === 'get_number') {
            await handleGetNumber(chatId, messageId); // Call dedicated function
            return; 
        } else if (data === 'active_country') {
            responseText = await handleActiveCountry(chatId); // Call dedicated function
        } else if (data === 'support') {
            responseText = "🙋 সাপোর্টের জন্য: @YourAdminUsername";
        } else if (['get_2fa', 'status', 'temp_mail'].includes(data)) {
            responseText = handleSimpleClick(data);
        } else if (data === 'start_menu') {
             // Return to main menu if coming from a nested menu
             const welcomeMessage = "আপনি মূল মেনুতে ফিরে এসেছেন। আপনার প্রয়োজনীয় পরিষেবা নির্বাচন করুন:";
             await bot.editMessageText(welcomeMessage, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: mainKeyboard.reply_markup,
                parse_mode: 'Markdown'
            });
            return;
        } else if (data.startsWith('select_country_')) {
            // TODO: Here you will handle the final selection of a country.
             responseText = `আপনি নির্বাচন করেছেন: ${data.split('_')[2]}। এখন সার্ভিস নির্বাচন করুন।`;
        }

        if (responseText) {
            // Send the response if it's not handled by editMessageText
            bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
        }
        
    } catch (error) {
        console.error("Callback Query ত্রুটি:", error);
        bot.sendMessage(chatId, "একটি সিস্টেম ত্রুটি ঘটেছে।");
    }
});


// ------------------------------------------------
// ৯. /bulkadd অ্যাডমিন কমান্ড (বাল্ক ডেটা ইনপুট)
// ------------------------------------------------
bot.onText(/\/bulkadd (.+)/s, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString(); 

    // অ্যাডমিন যাচাই
    if (!ADMIN_ID || userId !== ADMIN_ID) {
        return bot.sendMessage(chatId, "অনুমতি নেই।");
    }

    const inputData = match[1].trim(); 
    
    if (!inputData) {
        return bot.sendMessage(chatId, "ফরম্যাট ভুল। অনুগ্রহ করে স্প্রেডশীট থেকে ডেটা কপি করে এই ফরম্যাটে দিন:\n`CountryName, CountryCode, Service(Wp/Fb/Ig/Gm), Number`\nউদাহরণ:\n`India, +91, Wp+Tg, 9876543210\nUSA, +1, Fb+Gm, 1234567890`");
    }
    
    const lines = inputData.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length === 0) {
        return bot.sendMessage(chatId, "কোনো বৈধ ডেটা পাওয়া যায়নি।");
    }

    const updates = {};
    let successfulAdds = 0;
    
    lines.forEach((line) => {
        const parts = line.split(',').map(p => p.trim()); 

        if (parts.length >= 4) {
            const [country, countryCode, services, number] = parts;

            if (country && countryCode && services && number) {
                const newKey = numbersRef.push().key; 
                
                updates[newKey] = {
                    country: country,
                    countryCode: countryCode,
                    services: services,
                    code: number, 
                    status: 'available',
                    added_by: userId,
                    timestamp: admin.database.ServerValue.TIMESTAMP
                };
                successfulAdds++;
            }
        }
    });
    
    if (successfulAdds === 0) {
        return bot.sendMessage(chatId, "কোনো বৈধ লাইন প্রক্রিয়া করা সম্ভব হয়নি। ফরম্যাট চেক করুন।");
    }
    
    try {
        await numbersRef.update(updates); 
        bot.sendMessage(chatId, `✅ **সফলভাবে ${successfulAdds}টি নম্বর যোগ করা হয়েছে!**\n\n*(মোট ${lines.length}টি লাইনের মধ্যে)*`);

    } catch (error) {
        console.error("Firebase বাল্ক সেভ ত্রুটি:", error);
        bot.sendMessage(chatId, "নম্বর যোগ করার সময় ত্রুটি: " + error.message);
    }
});
