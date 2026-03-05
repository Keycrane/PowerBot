// ----- Required Modules -----
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// ----- Bot Setup -----
const TOKEN = process.env.TOKEN;
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ----- Configuration -----
let power = 100;
const maxPower = 100;
const powerDecay = 1;        // Power lost per interval
const intervalMs = 1000;    // 1 minute
const recoveryAmount = 99;   // Power restored after delay
const recoveryDelay = 120000; // 2 minutes after hitting 0
let isLocked = false;
let recoveryTimeout;
let powerMessage;

const powerChannelId = '1017667058261041274';
const slowChannels = [
    '1029276114641756251',
    '1034745617399943178',
    '1207493500929835048'
];

// ----- Helper: Update Power Message -----
async function updatePowerMessage() {
    try {
        const channel = await client.channels.fetch(powerChannelId);
        if (!channel || !channel.isTextBased()) return;

        const barLength = 20; // smaller for readability
        const filled = Math.max(0, Math.floor((power / maxPower) * barLength));
        const empty = barLength - filled;
        const bar = '█'.repeat(filled) + '░'.repeat(empty);

        if (!powerMessage) {
            powerMessage = await channel.send(`Power: ${bar} (${power}%)`);
        } else {
            await powerMessage.edit(`Power: ${bar} (${power}%)`);
        }
    } catch (err) {
        console.error('Failed to update power message:', err);
    }
}

// ----- Power Decay & Channel Management -----
async function handlePowerInterval() {
    try {
        power -= powerDecay;
        if (power < 0) power = 0;

        await updatePowerMessage();

        const mainChannel = await client.channels.fetch(powerChannelId);
        if (!mainChannel || !mainChannel.isTextBased()) return;

        // Lock main channel if power is 0
        if (power === 0 && !isLocked) {
            await mainChannel.permissionOverwrites.edit(mainChannel.guild.roles.everyone, {
                SendMessages: false
            });
            console.log(`Locked ${mainChannel.name}`);
            isLocked = true;

            // Apply slowmode
            for (const id of slowChannels) {
                const ch = await client.channels.fetch(id);
                if (ch && ch.isTextBased()) ch.setRateLimitPerUser(10).catch(console.error);
            }

            // Start recovery timer
            if (recoveryTimeout) clearTimeout(recoveryTimeout);
            recoveryTimeout = setTimeout(async () => {
                power += recoveryAmount;
                if (power > maxPower) power = maxPower;

                await mainChannel.permissionOverwrites.edit(mainChannel.guild.roles.everyone, {
                    SendMessages: true
                });
                console.log(`Unlocked ${mainChannel.name} after recovery`);
                isLocked = false;

                // Remove slowmode
                for (const id of slowChannels) {
                    const ch = await client.channels.fetch(id);
                    if (ch && ch.isTextBased()) ch.setRateLimitPerUser(0).catch(console.error);
                }

                await updatePowerMessage();
            }, recoveryDelay);
        }

        // Unlock channel if power is restored above 0
        if (power > 0 && isLocked) {
            await mainChannel.permissionOverwrites.edit(mainChannel.guild.roles.everyone, {
                SendMessages: true
            });
            console.log(`Unlocked ${mainChannel.name}`);
            isLocked = false;

            // Remove slowmode
            for (const id of slowChannels) {
                const ch = await client.channels.fetch(id);
                if (ch && ch.isTextBased()) ch.setRateLimitPerUser(0).catch(console.error);
            }
        }

    } catch (err) {
        console.error('Error in power interval:', err);
    }
}

// Start decay interval
setInterval(handlePowerInterval, intervalMs);

// ----- Increase Power on Messages -----
client.on('messageCreate', msg => {
    if (msg.author.bot) return;
    power += 5; // How much a message restores
    if (power > maxPower) power = maxPower;
});

// ----- Keep-Alive Server for Railway -----
const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// ----- Error Handling -----
process.on('unhandledRejection', err => console.error('Unhandled promise rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));

// ----- Login Bot -----
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    await updatePowerMessage();
});

client.login(TOKEN);
