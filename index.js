// ----- Required Modules -----
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// ----- Bot Setup -----
const TOKEN = process.env.TOKEN; // Replit secret
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ----- Configuration -----
let power = 100;           // Starting power
const maxPower = 100;      // Maximum power
const powerDecay = 1;      // Power lost per interval
const intervalMs = 5000;   // Interval for power drain (ms)
const recoveryAmount = 45; // Power restored after recovery delay
const recoveryDelay = 10000; // 2 minutes in ms
const powerChannelId = '1017667058261041274'; // Main power channel ID
const slowChannels = ['1029276114641756251','1034745617399943178','1207493500929835048']; // Channels for slowmode

let powerMessage;          // Stores the message displaying power
let isLocked = false;      // Tracks if main channel is locked
let recoveryTimeout = null; // Tracks recovery timer

// ----- Update Power Bar Message -----
async function updatePowerMessage() {
    const channel = client.channels.cache.get(powerChannelId);
    if (!channel || !channel.isTextBased()) return;

    const barLength = 20;
    const filled = Math.max(0, Math.floor((power / maxPower) * barLength));
    const empty = barLength - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    if (!powerMessage) {
        powerMessage = await channel.send(`Power: ${bar} (${power}%)`);
    } else {
        await powerMessage.edit(`Power: ${bar} (${power}%)`);
    }
}

// ----- Power Interval (with Recovery Logic) -----
setInterval(async () => {
    try {
        const channel = client.channels.cache.get(powerChannelId);
        if (!channel || !channel.isTextBased()) return;

        // Decrease power
        if (power > 0) {
            power -= powerDecay;
            if (power < 0) power = 0;
        }

        await updatePowerMessage();

        // If power is 0, lock channel and start recovery if not already
        if (power === 0) {
            if (!isLocked) {
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: false });
                console.log(`Locked ${channel.name}`);
                isLocked = true;

                // Apply slowmode
                slowChannels.forEach(id => {
                    const ch = client.channels.cache.get(id);
                    if (ch && ch.isTextBased()) ch.setRateLimitPerUser(10).catch(console.error);
                });
            }

            // Start recovery timer if not already running
            if (!recoveryTimeout) {
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
                    recoveryTimeout = null; // clear timeout so it can run again
                }, recoveryDelay);
            }

        } else if (power > 0 && isLocked) {
            // If power > 0 and channel is locked, unlock immediately
            await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: true });
            console.log(`Unlocked ${channel.name}`);
            isLocked = false;

            // Remove slowmode
            slowChannels.forEach(id => {
                const ch = client.channels.cache.get(id);
                if (ch && ch.isTextBased()) ch.setRateLimitPerUser(0).catch(console.error);
            });

            // Cancel any pending recovery timer
            if (recoveryTimeout) {
                clearTimeout(recoveryTimeout);
                recoveryTimeout = null;
            }
        }

    } catch (err) {
        console.error('Error in power interval:', err);
    }
}, intervalMs);

// ----- Increase Power on Messages (Instant Update) -----
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;
    power += 5;          // Increase power per message
    if (power > maxPower) power = maxPower;
    await updatePowerMessage(); // Instantly refresh bar
});

// ----- Keep-Alive Server for Replit -----
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
