// ----- Required Modules -----
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// ----- Bot Setup -----
const TOKEN = process.env.TOKEN; // Replit secret
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ----- Configuration -----
let power = 100;             // Starting power
const maxPower = 100;
const powerDecay = 1;        // Power lost per decay interval
const decayIntervalMs = 10000; // 5 seconds
const powerChannelId = '1017667058261041274'; // Main power channel
const slowChannels = ['1029276114641756251','1034745617399943178','1207493500929835048'];

let powerMessage;
let isLocked = false;
let lastBar = '';

// ----- Update Power Bar Message -----
async function updatePowerMessage() {
    const channel = client.channels.cache.get(powerChannelId);
    if (!channel || !channel.isTextBased()) return;

    const barLength = 20; // shorter bar for less edits
    const filled = Math.max(0, Math.floor((power / maxPower) * barLength));
    const empty = barLength - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    if (bar !== lastBar) { // only edit if bar changed
        if (!powerMessage) {
            powerMessage = await channel.send(`Power: ${bar} (${power}%)`);
        } else {
            await powerMessage.edit(`Power: ${bar} (${power}%)`);
        }
        lastBar = bar;
    }
}

// ----- Handle Lock / Unlock -----
async function handleLockUnlock() {
    const channel = client.channels.cache.get(powerChannelId);
    if (!channel || !channel.isTextBased()) return;

    if (power <= 0 && !isLocked) {
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: false });
        console.log(`Locked ${channel.name}`);
        isLocked = true;

        // Apply slowmode
        slowChannels.forEach(id => {
            const ch = client.channels.cache.get(id);
            if (ch && ch.isTextBased()) ch.setRateLimitPerUser(10).catch(console.error);
        });
    }

    if (power > 0 && isLocked) {
        await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: true });
        console.log(`Unlocked ${channel.name}`);
        isLocked = false;

        // Remove slowmode
        slowChannels.forEach(id => {
            const ch = client.channels.cache.get(id);
            if (ch && ch.isTextBased()) ch.setRateLimitPerUser(0).catch(console.error);
        });
    }
}

// ----- Power Decay Interval -----
setInterval(async () => {
    if (power > 0) {
        power -= powerDecay;
        if (power < 0) power = 0;
        await updatePowerMessage();
        await handleLockUnlock();
    }
}, decayIntervalMs);

// ----- Increase Power on Messages -----
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;

    power += 5;
    if (power > maxPower) power = maxPower;

    // Immediate update and lock/unlock check
    await updatePowerMessage();
    await handleLockUnlock();
});

// ----- Keep-Alive Server -----
const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('Web server running'));

// ----- Global Error Handling -----
process.on('unhandledRejection', err => console.error('Unhandled promise rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));

// ----- Login Bot -----
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    updatePowerMessage();
});

client.login(TOKEN);
