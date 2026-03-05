// ----- Required Modules -----
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// ----- Bot Setup -----
const TOKEN = process.env.TOKEN;
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ----- Configuration -----
let power = 100;                 // Starting power
const maxPower = 100;            // Maximum power
const powerDecay = 1;            // Power lost per interval
const intervalMs = 1000;        // 1 minute interval
const powerChannelId = '1017667058261041274'; // Main power channel ID
const slowChannels = ['1029276114641756251','1034745617399943178','1207493500929835048']; // Slowmode channels

let powerMessage;                // Stores the message displaying power
let isLocked = false;            // Tracks if main channel is locked
let recoveryTimeout;             // Timer for automatic recovery
const recoveryAmount = 20;       // Power restored automatically
const recoveryDelay = 120000;    // 2 minutes (in ms)

// ----- Helper: Update Power Message -----
async function updatePowerMessage() {
    const channel = client.channels.cache.get(powerChannelId);
    if (!channel || !channel.isTextBased()) return;

    const barLength = 20; // visual bar length
    const filled = Math.max(0, Math.floor((power / maxPower) * barLength));
    const empty = barLength - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    if (!powerMessage) {
        powerMessage = await channel.send(`Power: ${bar} (${power}%)`);
    } else {
        await powerMessage.edit(`Power: ${bar} (${power}%)`);
    }
}

// ----- Power Interval -----
setInterval(async () => {
    try {
        power -= powerDecay;
        if (power < 0) power = 0;

        await updatePowerMessage();

        const channel = client.channels.cache.get(powerChannelId);
        if (!channel || !channel.isTextBased()) return;

        // LOCK if power is 0
        if (power === 0 && !isLocked) {
            await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: false });
            console.log(`Locked ${channel.name}`);
            isLocked = true;

            // Apply slowmode
            slowChannels.forEach(id => {
                const ch = client.channels.cache.get(id);
                if (ch && ch.isTextBased()) ch.setRateLimitPerUser(10).catch(console.error);
            });

            // Start automatic recovery
            if (recoveryTimeout) clearTimeout(recoveryTimeout);
            recoveryTimeout = setTimeout(async () => {
                power += recoveryAmount;
                if (power > maxPower) power = maxPower;

                await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: true });
                console.log(`Unlocked ${channel.name} after recovery`);
                isLocked = false;

                // Remove slowmode
                slowChannels.forEach(id => {
                    const ch = client.channels.cache.get(id);
                    if (ch && ch.isTextBased()) ch.setRateLimitPerUser(0).catch(console.error);
                });

                await updatePowerMessage();
            }, recoveryDelay);
        }

        // UNLOCK if power > 0
        if (power > 0 && isLocked) {
            await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: true });
            console.log(`Unlocked ${channel.name}`);
            isLocked = false;

            slowChannels.forEach(id => {
                const ch = client.channels.cache.get(id);
                if (ch && ch.isTextBased()) ch.setRateLimitPerUser(0).catch(console.error);
            });
        }

    } catch (err) {
        console.error('Error in power interval:', err);
    }
}, intervalMs);

// ----- Increase Power on Messages -----
client.on('messageCreate', msg => {
    if (msg.author.bot) return;

    power += 5; // power per message
    if (power > maxPower) power = maxPower;

    updatePowerMessage(); // update immediately
});

// ----- Keep-Alive Server for Replit / Hosting -----
const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// ----- Global Error Handling -----
process.on('unhandledRejection', err => console.error('Unhandled promise rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));

// ----- Login Bot -----
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    updatePowerMessage();
});

client.login(TOKEN);
