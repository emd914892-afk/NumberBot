/**
 * Telegram OTP/Virtual Number Bot
 * Deployed on Vercel using Webhook and integrated with Firebase Realtime Database (Admin SDK).
 * * USER CREDENTIALS (Must be set as Vercel Environment Variables):
 * BOT_TOKEN: 8531791297:AAGl4Rdj2pA3FhsO4tLIGcufxJDVUPyyWNs
 * ADMIN_ID: 7895816348
 * FIREBASE_SERVICE_ACCOUNT: (The provided large JSON block)
 */

const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');

// ------------------------------------------------
// 1. ENVIRONMENT VARIABLE SETUP
// ------------------------------------------------
const token = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID; 

const FIREBASE_DATABASE_URL = "https://numberbot-default-rtdb.asia-southeast1.firebasedatabase.app";

let serviceAccount;
try {
    // Safely parse the JSON string from Vercel's environment variable
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); 
} catch (e) {
    console.error("FIREBASE_SERVICE_ACCOUNT environment variable is missing or malformed JSON.");
}


// ------------------------------------------------
// 2. FIREBASE INITIALIZATION (Admin SDK)
// ------------------------------------------------
if (serviceAccount && !admin.apps.length) { 
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: FIREBASE_DATABASE_URL
    });
    console.log("Firebase Admin SDK initialized successfully.");
} else if (!admin.apps.length) {
    console.error("Firebase initialization failed due to missing service account data.");
}

const db = admin.database();
const numbersRef = db.ref('available_numbers'); // Reference for storing numbers

// ------------------------------------------------
// 3. TELEGRAM BOT SETUP (Webhook Mode)
// ------------------------------------------------
const bot = new TelegramBot(token);

// ===============================================
// 4. MAIN INTERFACE KEYBOARD STRUCTURE
// ===============================================

const mainKeyboard = {
    reply_markup: {
        inline_keyboard: [
            // Row 1: Get 2FA (Full width)
            [{ text: "🔑 Get 2FA", callback_data: "get_2fa" }],
            
            // Row 2: Get Number (Left) | Status (Right)
            [{ text: "📞 Get Number", callback_data: "get_number" }, { text: "📊 Status", callback_data: "status" }],
            
            // Row 3: Active Country (Left) | Temp Mail (Right)
            [{ text: "🌍 Active Country", callback_data: "active_country" }, { text: "📧 Temp Mail", callback_data: "temp_mail" }],
            
            // Row 4: Support (Full width)
            [{ text: "🙋 Support", callback_data: "support" }]
        ]
    }
};

// ===============================================
// 5. BUTTON HANDLER FUNCTIONS
// ===============================================

/** Fetches available countries from Firebase and sends a dynamic keyboard for selection. */
async function handleGetNumber(chatId, messageId) {
    const responseText = "📞 **Get Number:** Please select your desired country from the list below.";
    
    try {
        const snapshot = await numbersRef.once('value');
        const numbers = snapshot.val();
        
        if (!numbers) {
            return bot.sendMessage(chatId, "No numbers are currently available.");
        }

        const availableCountries = {};
        for (const key in numbers) {
            const num = numbers[key];
            if (num && num.status === 'available' && num.country) {
                availableCountries[num.country] = true;
            }
        }

        const countryButtons = Object.keys(availableCountries)
            .sort()
            .map(country => [{ 
                text: country, 
                callback_data: `select_country_${country.replace(/\s/g, '')}` 
            }]);
        
        // Add back button
        countryButtons.push([{ text: "« Back to Main Menu", callback_data: "start_menu" }]);

        const countrySelectionKeyboard = {
            reply_markup: { inline_keyboard: countryButtons }
        };

        // Edit the message to show country options
        bot.editMessageText(responseText, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: countrySelectionKeyboard.reply_markup,
            parse_mode: 'Markdown'
        });

    } catch (error) {
        console.error("Error fetching countries for Get Number:", error);
        bot.sendMessage(chatId, "A system error occurred while loading countries.");
    }
}

/** Fetches available number counts and lists them. */
async function handleActiveCountry(chatId) {
    try {
        const snapshot = await numbersRef.once('value');
        const numbers = snapshot.val();
        
        if (!numbers) {
            return "🌍 Sorry, no countries are currently active.";
        }

        const countryCounts = {};
        
        for (const key in numbers) {
            const number = numbers[key];
            if (number && number.status === 'available') { 
                const country = number.country;
                countryCounts[country] = (countryCounts[country] || 0) + 1;
            }
        }

        let countryList = "🌍 **List of Active Countries:**\n\n";
        
        if (Object.keys(countryCounts).length === 0) {
            countryList += "No numbers are currently available.";
        } else {
            const sortedCountries = Object.keys(countryCounts).sort();
            sortedCountries.forEach(country => {
                countryList += `▪️ ${country}: ${countryCounts[country]} numbers available\n`;
            });
        }
        return countryList;

    } catch (error) {
        console.error("Firebase data loading error:", error);
        return "Failed to retrieve information from the database.";
    }
}

/** Handles the "Get 2FA", "Status", and "Temp Mail" clicks with a generic message. */
function handleSimpleClick(data) {
    return `You clicked: *${data.toUpperCase().replace('_', ' ')}*. This service is still under development.`;
}

// ------------------------------------------------
// 6. WEBHOOK HANDLER (Required for Vercel)
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
// 7. /start COMMAND HANDLER
// ------------------------------------------------
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const welcomeMessage = "Welcome! Please select your required service:";
    
    bot.sendMessage(chatId, welcomeMessage, mainKeyboard);
});


// ------------------------------------------------
// 8. CALLBACK QUERY HANDLER (Button Clicks)
// ------------------------------------------------
bot.on('callback_query', async (callbackQuery) => {
    const message = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = message.chat.id;
    const messageId = message.message_id;

    await bot.answerCallbackQuery(callbackQuery.id); 

    try {
        let responseText = null;

        if (data === 'get_number') {
            await handleGetNumber(chatId, messageId); 
            return; 
        } else if (data === 'active_country') {
            responseText = await handleActiveCountry(chatId); 
        } else if (data === 'support') {
            responseText = "🙋 For support: @YourAdminUsername";
        } else if (['get_2fa', 'status', 'temp_mail'].includes(data)) {
            responseText = handleSimpleClick(data);
        } else if (data === 'start_menu') {
             // Return to main menu if coming from a nested menu
             const welcomeMessage = "You have returned to the main menu. Please select your required service:";
             await bot.editMessageText(welcomeMessage, {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: mainKeyboard.reply_markup,
                parse_mode: 'Markdown'
            });
            return;
        } else if (data.startsWith('select_country_')) {
            // Further logic for selecting the service (Wp/Fb/Ig/Gm) would go here
             responseText = `You selected: ${data.split('_')[2].replace(/([A-Z])/g, ' $1').trim()}. Now please select the service.`;
        }

        if (responseText) {
            bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
        }
        
    } catch (error) {
        console.error("Callback Query Error:", error);
        bot.sendMessage(chatId, "A system error occurred.");
    }
});


// ------------------------------------------------
// 9. /bulkadd ADMIN COMMAND (Bulk Data Input)
// ------------------------------------------------
bot.onText(/\/bulkadd (.+)/s, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString(); 

    // Admin verification
    if (!ADMIN_ID || userId !== ADMIN_ID) {
        return bot.sendMessage(chatId, "Permission denied.");
    }

    const inputData = match[1].trim(); 
    
    if (!inputData) {
        return bot.sendMessage(chatId, "Wrong format. Please copy and paste data from the spreadsheet using the format:\n`CountryName, CountryCode, Service(Wp/Fb/Ig/Gm), Number`\nExample:\n`India, +91, Wp+Tg, 9876543210\nUSA, +1, Fb+Gm, 1234567890`");
    }
    
    const lines = inputData.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length === 0) {
        return bot.sendMessage(chatId, "No valid data found.");
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
        return bot.sendMessage(chatId, "No valid lines could be processed. Check the format.");
    }
    
    try {
        await numbersRef.update(updates); 
        bot.sendMessage(chatId, `✅ **Successfully added ${successfulAdds} numbers!**\n\n*(Out of ${lines.length} total lines)*`);

    } catch (error) {
        console.error("Firebase Bulk Save Error:", error);
        bot.sendMessage(chatId, "Error while adding numbers: " + error.message);
    }
});
